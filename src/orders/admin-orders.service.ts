import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PaidStatus, Prisma, Role, Status } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { SupabaseService } from 'src/supabase/supabase.service';
import * as bcrypt from 'bcrypt';

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
      select: { status: true },
    });

    if (!order) throw new NotFoundException('Order not found');

    if (order.status !== Status.PENDING)
      throw new BadRequestException('Only pending requests can be confirmed');

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
      select: { status: true, assignedToId: true },
    });

    if (!order) throw new NotFoundException('Order not found');

    if (order.status === Status.DELIVERED) {
      throw new BadRequestException('You cannot cancel a delivered order');
    }

    // allow admins as far as it's not delivered
    // also allow anyone as far as it's still pending
    if (isAdmin || order.status === Status.PENDING) {
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
      },
    });

    if (!order) throw new NotFoundException('Order not found');

    if (order.status !== Status.CANCELLED) {
      throw new BadRequestException('You can only revive a cancelled order');
    }

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
      },
    });

    if (!order) throw new NotFoundException('Order not found');

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

    if (
      order.confirmationAttempts >= 5 &&
      order.confirmationLockedUntil!.getDate() > Date.now()
    ) {
      throw new UnauthorizedException('Code locked');
    }

    if (!isAdmin && order.assignedToId !== user.id) {
      throw new UnauthorizedException('You cannot deliver this order!');
    }

    const codeMatches = await bcrypt.compare(code, order.confirmationCodeHash);

    if (!codeMatches) {
      if (order.confirmationAttempts >= 4) {
        const confirmationLockedUntil = new Date(Date.now() + 1000 * 60 * 5);
        await this.prisma.order.update({
          where: { id },
          data: {
            confirmationAttempts: {
              increment: 1,
            },
            confirmationLockedUntil,
          },
        });

        throw new UnauthorizedException({
          message: 'Invalid code, code input locked for 5 minutes',
          statusCode: 501,
          confirmationLockedUntil,
        });
      }

      await this.prisma.order.update({
        where: { id },
        data: {
          confirmationAttempts: {
            increment: 1,
          },
        },
      });
      throw new UnauthorizedException('Invalid code, try again');
    }

    // now that code matches, let's update to delivered;
    return await this.prisma.order.update({
      where: { id },
      data: {
        status: Status.DELIVERED,
        deliveredById: userId,
        deliveredAt: new Date(),
      },
      include: adminOrderManagementInclude,
    });
  }
}
