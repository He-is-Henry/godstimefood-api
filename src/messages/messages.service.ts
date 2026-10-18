import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateMessageDto } from './dto/create-message.dto';
import {
  orderWithItemsInclude,
  type OrderWithDetails,
} from 'src/orders/orders.service';
import { SupabaseService } from 'src/supabase/supabase.service';

export interface GetMessagesQueryDto {
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
}

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabaseService: SupabaseService,
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

  async create(createMessageDto: CreateMessageDto) {
    return await this.prisma.message.create({
      data: createMessageDto,
    });
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
