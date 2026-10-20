import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateMessageDto } from './dto/create-message.dto';
import {
  orderWithItemsInclude,
  type OrderWithDetails,
} from 'src/orders/orders.service';
import { SupabaseService } from 'src/supabase/supabase.service';
import { PushService } from 'src/push/push.service';
import { MessageAction } from '@prisma/client';

export interface GetMessagesQueryDto {
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
}

const NOTIFICATION_CONFIG: Record<
  MessageAction,
  { title: string; body: (summary: string) => string }
> = {
  ORDER_CONFIRMED: {
    title: 'Order Confirmed',
    body: (summary) =>
      `Your order for ${summary} has been confirmed and sent to the kitchen.`,
  },
  ORDER_OUT_FOR_DELIVERY: {
    title: 'Out for Delivery',
    body: (summary) =>
      `A rider is en route with ${summary}. Tap to view details and get your delivery code.`,
  },
  ORDER_DELIVERED: {
    title: 'Order Delivered',
    body: (summary) =>
      `Your order for ${summary} was delivered successfully. Enjoy your meal!`,
  },
  ORDER_CANCELLED: {
    title: 'Order Cancelled',
    body: (summary) =>
      `Your order for ${summary} has been cancelled. Tap to check order status.`,
  },
  ORDER_REVIVED: {
    title: 'Order Restored',
    body: (summary) =>
      `Your order for ${summary} has been reactivated and restored to pending state.`,
  },
  PAYMENT_VERIFIED: {
    title: 'Payment Verified',
    body: (summary) =>
      `Your bank transfer for ${summary} has been verified and approved.`,
  },
};

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly supabaseService: SupabaseService,
    private readonly pushService: PushService,
  ) {}

  normalizeOrder(order: OrderWithDetails) {
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

  private getProductImage(images: {
    item: { url: string }[];
  }): string | undefined {
    return images.item[0]?.url;
  }

  private getItemSummary(items: { product: { name: string } }[]): string {
    if (!items.length) return 'Food Order';
    const firstItem = items[0].product.name;
    const count = items.length - 1;
    return count > 0
      ? `${firstItem} and ${count} other item${count > 1 ? 's' : ''}`
      : firstItem;
  }

  async create(createMessageDto: CreateMessageDto) {
    const message = await this.prisma.message.create({
      data: createMessageDto,
    });

    const order = await this.prisma.order.findUnique({
      where: { id: createMessageDto.orderId },
      include: orderWithItemsInclude,
    });

    if (order) {
      const normalizedOrder = this.normalizeOrder(order);
      const itemSummary = this.getItemSummary(normalizedOrder.items);
      const firstItem = normalizedOrder.items[0];
      const icon = firstItem
        ? this.getProductImage(firstItem.product.images)
        : undefined;

      const config = NOTIFICATION_CONFIG[createMessageDto.action];

      if (config) {
        const payload = {
          title: config.title,
          body: config.body(itemSummary),
          icon,
          badge: '/icons/badge-72x72.png',
          url: `/orders/${createMessageDto.orderId}`,
          tag: `order-${order.id}`,
          renotify: true,
        };

        // 3. Log initial dispatch attempt
        this.logger.log(
          `Dispatching push notification [${createMessageDto.action}] for Order #${order.id} to User #${createMessageDto.userId}`,
        );

        // 4. Handle success and failure asynchronously without blocking HTTP response
        this.pushService
          .sendToUser(createMessageDto.userId, payload)
          .then((result) => {
            this.logger.log({
              message: `Push notification delivered successfully`,
              userId: createMessageDto.userId,
              orderId: createMessageDto.orderId,
              action: createMessageDto.action,
              result,
            });
          })
          .catch((error) => {
            this.logger.error(
              `Failed to send push notification [${createMessageDto.action}] to User #${createMessageDto.userId}`,
              error instanceof Error ? error.stack : error,
            );
          });
      }
    }

    return message;
  }

  async getMessages(userId: number, query: GetMessagesQueryDto = {}) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(50, Number(query.limit) || 20));
    const skip = (page - 1) * limit;
    const unreadOnly = String(query.unreadOnly) === 'true';

    const whereCondition = {
      userId,
      ...(unreadOnly && { read: false }),
    };

    const [messages, total, unreadCount] = await Promise.all([
      this.prisma.message.findMany({
        where: whereCondition,
        orderBy: { id: 'desc' },
        skip,
        take: limit,
        include: {
          order: {
            include: orderWithItemsInclude,
          },
        },
      }),
      this.prisma.message.count({ where: whereCondition }),
      this.prisma.message.count({ where: { userId, read: false } }),
    ]);

    const mappedMessages = messages.map((m) => ({
      ...m,
      order: this.normalizeOrder(m.order),
    }));

    return {
      data: mappedMessages,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        unreadCount,
      },
    };
  }

  async getUnreadCount(userId: number) {
    const count = await this.prisma.message.count({
      where: {
        userId,
        read: false,
      },
    });

    return { count };
  }

  async readMessage(userId: number, id: number) {
    const message = await this.prisma.message.findFirst({
      where: { id, userId },
    });

    if (!message) throw new NotFoundException('Message not found');

    return await this.prisma.message.update({
      where: { id },
      data: { read: true },
    });
  }

  async markAllAsRead(userId: number) {
    return await this.prisma.message.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
  }
}
