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
import { PushPayload, PushService } from 'src/push/push.service';
import { FilterAdminOrdersDto } from './dto/filter-admin-order.dto';

export interface JwtPayload {
  id: number;
  role: Role;
  email?: string;
  firstName?: string;
  lastName?: string;
}

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
    private readonly pushService: PushService,
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

  async findAllOrdersAdmin(dto: FilterAdminOrdersDto) {
    const { page = 1, limit = 15, status, search } = dto;
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = {};

    if (status && status !== 'ALL') {
      where.status = status as Prisma.EnumStatusFilter;
    }

    if (search?.trim()) {
      const term = search.trim();
      const searchAsNumber = parseInt(term, 10);

      where.OR = [
        ...(!isNaN(searchAsNumber) ? [{ id: searchAsNumber }] : []),
        { customer: { firstName: { contains: term, mode: 'insensitive' } } },
        { customer: { lastName: { contains: term, mode: 'insensitive' } } },
        { customer: { phone: { contains: term, mode: 'insensitive' } } },
        { deliveryAddress: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [total, orders] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: adminOrderInclude,
      }),
    ]);

    return {
      data: orders.map((order) => this.normalizeOrder(order)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
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

    const updatedOrder = await this.prisma.order.update({
      where: { id },
      data: {
        assignedToId,
      },
      include: adminOrderManagementInclude,
    });

    const normalized = this.normalizeOrder(updatedOrder);
    const icon = normalized.items[0]?.product?.images?.item[0]?.url;

    // Dispatch Push Notification to Newly Assigned Staff
    const payload: PushPayload = {
      title: '📋 Order Assigned to You',
      badge: '/icons/badge-72x72.png',
      body: `You have been assigned to handle Order #${id}.`,
      icon,
      url: `/admin/orders/${id}`,
      tag: `order-${id}`,
      renotify: true,
    };

    void this.pushService.sendToManagement('assigned', payload, {
      assignedAdminId: assignedToId,
    });

    return normalized;
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
    const isManager = user.role === Role.MANAGER;
    const data = { status: Status.CANCELLED, cancelledById: user.id };

    const order = await this.prisma.order.findUnique({
      where: { id },
      select: { status: true, assignedToId: true, id: true, customerId: true },
    });

    if (!order) throw new NotFoundException('Order not found');

    if (order.status === Status.DELIVERED) {
      throw new BadRequestException('You cannot cancel a delivered order');
    }

    if (
      !isAdmin &&
      order.status !== Status.PENDING &&
      order.assignedToId !== user.id
    ) {
      throw new UnauthorizedException('This order is not assigned to you');
    }

    // 1. Notify Customer via MessagesService
    void this.messagesService
      .create({
        orderId: order.id,
        action: MessageAction.ORDER_CANCELLED,
        userId: order.customerId,
      })
      .catch((e) => console.log(e));

    // 2. Perform DB update
    const updatedOrder = await this.prisma.order.update({
      where: { id },
      data,
      include: adminOrderManagementInclude,
    });

    const normalized = this.normalizeOrder(updatedOrder);
    const icon = normalized.items[0]?.product?.images?.item[0]?.url;
    const staffName =
      [user.firstName, user.lastName].filter(Boolean).join(' ') ||
      `Staff #${user.id}`;

    // 3. Dispatch Management Push Notifications

    // If cancelled by a Manager -> Notify Admins
    if (isManager) {
      void this.pushService.sendToManagement(
        'admin',
        {
          title: '⚠️ Order Cancelled by Manager',
          body: `${staffName} cancelled Order #${id}.`,
          icon,
          badge: '/icons/badge-72x72.png',
          url: `/admin/orders/${id}`,
          tag: `order-${id}`,
          renotify: true,
        },
        { actorId: user.id },
      );
    }

    // If assigned to someone else -> Notify Assigned Staff
    if (order.assignedToId && order.assignedToId !== user.id) {
      void this.pushService.sendToManagement(
        'assigned',
        {
          title: '❌ Assigned Order Cancelled',
          body: `Order #${id} assigned to you was cancelled by ${staffName}.`,
          icon,
          badge: '/icons/badge-72x72.png',
          url: `/admin/orders/${id}`,
          tag: `order-${id}`,
        },
        { assignedAdminId: order.assignedToId, actorId: user.id },
      );
    }

    return normalized;
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

      await this.prisma.order.update({
        where: { id },
        data: {
          confirmationAttempts: newAttempts,
        },
      });

      throw new UnauthorizedException('Invalid code, try again');
    }

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
