import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  MessageAction,
  PaidStatus,
  Prisma,
  Role,
  Status,
} from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { SupabaseService } from 'src/supabase/supabase.service';
import * as bcrypt from 'bcrypt';
import { MessagesService } from 'src/messages/messages.service';

const userInclude = {
  select: {
    id: true,
    firstName: true,
    lastName: true,
    phone: true,
    email: true,
  },
};

const adminOrderInclude = Prisma.validator<Prisma.OrderInclude>()({
  customer: userInclude,
  items: {
    include: {
      product: {
        select: {
          name: true,
          description: true,
          images: {
            select: {
              image: {
                select: {
                  path: true,
                },
              },
            },
          },
        },
      },
    },
  },
});

const adminOrderManagementInclude = {
  ...adminOrderInclude,
  confirmedBy: userInclude,
  deliveredBy: userInclude,
  cancelledBy: userInclude,
  paidBy: userInclude,
  assignedTo: userInclude,
};

export type AdminOrderWithDetails = Prisma.OrderGetPayload<{
  include: typeof adminOrderInclude;
}>;

@Injectable()
export class AdminOrdersService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly prisma: PrismaService,
    private readonly messagesService: MessagesService,
  ) {}

  private normalizeOrder(order: AdminOrderWithDetails) {
    return {
      ...order,
      items: order.items.map((item) => ({
        ...item,
        product: {
          name: item.product.name,
          description: item.product.description,
          images: {
            item: item.product.images.map((img) => ({
              path: img.image.path,
              url: this.supabaseService.getFile(img.image.path),
            })),
          },
        },
      })),
    };
  }

  async findAllOrdersAdmin() {
    const orders = await this.prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      include: adminOrderInclude,
    });

    const mappedOrders = orders.map((order) => this.normalizeOrder(order));

    return mappedOrders;
  }

  async findOrderAdmin(id: number) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: adminOrderManagementInclude,
    });

    if (!order) throw new NotFoundException('Invalid order id.');

    return this.normalizeOrder(order);
  }

  async confirmOrder(id: number, userId: number) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      select: { status: true, id: true, customerId: true },
    });

    if (!order) throw new NotFoundException('Order not found');

    if (order.status !== Status.PENDING)
      throw new BadRequestException('Only pending requests can be confirmed');

    void this.messagesService
      .create({
        orderId: order.id,
        action: MessageAction.ORDER_CONFIRMED,
        userId: order.customerId,
      })
      .catch((e) => console.log(e));

    return await this.prisma.order.update({
      where: { id },
      data: { status: Status.CONFIRMED, confirmedById: userId },
      include: adminOrderManagementInclude,
    });
  }

  async assignOrder(id: number, assignedToId: number) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      select: { assignedToId: true, status: true },
    });

    if (!order) throw new NotFoundException('Order not found');

    if (order.assignedToId === assignedToId) {
      throw new ConflictException('User is already assigned');
    }

    return await this.prisma.order.update({
      where: { id },
      data: {
        assignedToId,
      },
      include: adminOrderManagementInclude,
    });
  }

  async claimOrder(id: number, userId: number) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      select: {
        status: true,
        assignedToId: true,
      },
    });

    if (!order) throw new NotFoundException('Order not found');

    if (order.status === Status.DELIVERED) {
      throw new BadRequestException('You cannot claim a delivered order');
    }

    if (order.assignedToId === userId) {
      throw new ConflictException('You are already assigned to this order');
    }

    if (order.assignedToId !== null) {
      throw new UnauthorizedException(
        'This order is already assigned to someone else',
      );
    }

    return await this.prisma.order.update({
      where: { id },
      data: {
        assignedToId: userId,
      },
      include: adminOrderManagementInclude,
    });
  }

  async releaseOrder(id: number, userId: number) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      select: {
        assignedToId: true,
      },
    });

    if (!order) throw new NotFoundException('Order not found');

    if (order.assignedToId !== userId) {
      throw new UnauthorizedException('You are not assigned to this order');
    }

    return await this.prisma.order.update({
      where: { id },
      data: {
        assignedToId: null,
      },
      include: adminOrderManagementInclude,
    });
  }

  async cancelOrder(id: number, user: JwtPayload) {
    const isAdmin = user.role === Role.ADMIN;
    const data = { status: Status.CANCELLED, cancelledById: user.id };

    const order = await this.prisma.order.findUnique({
      where: { id },
      select: { status: true, assignedToId: true, id: true, customerId: true },
    });

    if (!order) throw new NotFoundException('Order not found');

    if (order.status === Status.DELIVERED) {
      throw new BadRequestException('You cannot cancel a delivered order');
    }

    // allow admins as far as it's not delivered
    // also allow anyone as far as it's still pending
    if (isAdmin || order.status === Status.PENDING) {
      void this.messagesService
        .create({
          orderId: order.id,
          action: MessageAction.ORDER_CANCELLED,
          userId: order.customerId,
        })
        .catch((e) => console.log(e));

      return this.prisma.order.update({
        where: { id },
        data,
        include: adminOrderManagementInclude,
      });
    }

    // we know it's not pending and it's definitely a manager, we need to check assigned
    if (order.assignedToId !== user.id) {
      throw new UnauthorizedException('This order is not assigned to you');
    }

    void this.messagesService
      .create({
        orderId: order.id,
        action: MessageAction.ORDER_CANCELLED,
        userId: order.customerId,
      })
      .catch((e) => console.log(e));

    return await this.prisma.order.update({
      where: { id },
      data,
      include: adminOrderManagementInclude,
    });
  }

  async reviveOrder(id: number) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      select: {
        status: true,
        id: true,
        customerId: true,
      },
    });

    if (!order) throw new NotFoundException('Order not found');

    if (order.status !== Status.CANCELLED) {
      throw new BadRequestException('You can only revive a cancelled order');
    }

    void this.messagesService
      .create({
        orderId: order.id,
        action: MessageAction.ORDER_REVIVED,
        userId: order.customerId,
      })
      .catch((e) => console.log(e));

    return await this.prisma.order.update({
      where: { id },
      data: { status: Status.PENDING },
      include: adminOrderManagementInclude,
    });
  }

  async confirmPayment(id: number, userId: number) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        customerId: true,
      },
    });

    if (!order) throw new NotFoundException('Order not found');

    void this.messagesService
      .create({
        orderId: order.id,
        action: MessageAction.PAYMENT_VERIFIED,
        userId: order.customerId,
      })
      .catch((e) => console.log(e));

    return await this.prisma.order.update({
      where: { id },
      data: { paid: PaidStatus.VERIFIED, paidById: userId, paidAt: new Date() },
      include: adminOrderManagementInclude,
    });
  }

  async markOutForDelivery(id: number, user: JwtPayload) {
    const isAdmin = user.role === Role.ADMIN;
    const order = await this.prisma.order.findUnique({
      where: { id },
      select: {
        status: true,
        assignedToId: true,
        id: true,
        customerId: true,
      },
    });

    if (!order) throw new NotFoundException('Order not found');

    if (order.status !== Status.CONFIRMED) {
      throw new BadRequestException(
        'You can only prep confirmed orders for delivery',
      );
    }

    if (!isAdmin && order.assignedToId !== user.id) {
      throw new UnauthorizedException('You cannot update this order!');
    }

    void this.messagesService
      .create({
        orderId: order.id,
        action: MessageAction.ORDER_OUT_FOR_DELIVERY,
        userId: order.customerId,
      })
      .catch((e) => console.log(e));

    return await this.prisma.order.update({
      where: { id },
      data: { status: Status.OUT_FOR_DELIVERY },
      include: adminOrderManagementInclude,
    });
  }

  async deliver(id: number, user: JwtPayload, code: string) {
    const isAdmin = user.role === Role.ADMIN;
    const userId = user.id;

    const order = await this.prisma.order.findUnique({
      where: { id },
      select: {
        confirmationCodeHash: true,
        status: true,
        paid: true,
        confirmationAttempts: true,
        confirmationLockedUntil: true,
        assignedToId: true,
        id: true,
        customerId: true,
      },
    });

    if (!order) throw new NotFoundException('Order not found');

    if (!order.confirmationCodeHash) {
      throw new BadRequestException(
        'Code not generated yet, ask user to generate code',
      );
    }

    if (order.paid !== PaidStatus.VERIFIED) {
      throw new BadRequestException('Please verify payment before delivery');
    }

    if (!isAdmin && order.assignedToId !== user.id) {
      throw new UnauthorizedException('You cannot deliver this order!');
    }

    // 1. Lockout Check — SKIPPED ENTIRELY FOR ADMINS
    if (
      !isAdmin &&
      order.confirmationAttempts >= 5 &&
      order.confirmationLockedUntil &&
      order.confirmationLockedUntil.getTime() > Date.now()
    ) {
      throw new UnauthorizedException({
        message: 'Invalid code, code input locked for 5 minutes',
        statusCode: 501,
        confirmationLockedUntil: order.confirmationLockedUntil,
      });
    }

    // 2. Baseline Attempts Calculation (Reset if lockout timer has passed)
    let currentAttempts = order.confirmationAttempts;
    if (
      order.confirmationLockedUntil &&
      order.confirmationLockedUntil.getTime() <= Date.now()
    ) {
      currentAttempts = 0;
    }

    const codeMatches = await bcrypt.compare(code, order.confirmationCodeHash);

    if (!codeMatches) {
      const newAttempts = currentAttempts + 1;

      // Trigger lockout ONLY for non-admins (Managers/Riders)
      if (!isAdmin && newAttempts >= 5) {
        const confirmationLockedUntil = new Date(Date.now() + 1000 * 60 * 5);
        await this.prisma.order.update({
          where: { id },
          data: {
            confirmationAttempts: newAttempts,
            confirmationLockedUntil,
          },
        });

        throw new UnauthorizedException({
          message: 'Invalid code, code input locked for 5 minutes',
          statusCode: 501,
          confirmationLockedUntil,
        });
      }

      // Increment attempts counter on invalid attempt
      await this.prisma.order.update({
        where: { id },
        data: {
          confirmationAttempts: newAttempts,
        },
      });

      throw new UnauthorizedException('Invalid code, try again');
    }

    // 3. Code Matches! Reset attempts/lockout state and set status to DELIVERED
    void this.messagesService
      .create({
        orderId: order.id,
        action: MessageAction.ORDER_DELIVERED,
        userId: order.customerId,
      })
      .catch((e) => console.log(e));

    return await this.prisma.order.update({
      where: { id },
      data: {
        status: Status.DELIVERED,
        deliveredById: userId,
        deliveredAt: new Date(),
        confirmationAttempts: 0,
        confirmationLockedUntil: null,
      },
      include: adminOrderManagementInclude,
    });
  }
}
