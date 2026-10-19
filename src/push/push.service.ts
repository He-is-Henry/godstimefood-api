import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webPush from 'web-push';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CreatePushDto } from './dto/create-push.dto';

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  url?: string;
  tag: string;
  renotify?: boolean;
}

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    const subject = this.configService.getOrThrow<string>('VAPID_SUBJECT');
    const publicKey = this.configService.getOrThrow<string>('VAPID_PUBLIC_KEY');
    const privateKey =
      this.configService.getOrThrow<string>('VAPID_PRIVATE_KEY');

    webPush.setVapidDetails(subject, publicKey, privateKey);
  }

  async subscribe(sessionId: string, dto: CreatePushDto) {
    return this.prisma.pushSubscription.upsert({
      where: { sessionId },
      update: {
        endpoint: dto.endpoint,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
      },
      create: {
        sessionId,
        endpoint: dto.endpoint,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
      },
    });
  }

  async sendToUser(userIds: number | number[], payload: PushPayload) {
    const ids = Array.isArray(userIds) ? userIds : [userIds];
    if (!ids.length) return;

    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: {
        session: {
          userId: { in: ids },
        },
      },
    });

    if (!subscriptions.length) return;

    const payloadString = JSON.stringify(payload);

    await Promise.allSettled(
      subscriptions.map((sub) => this.dispatchPush(sub, payloadString)),
    );
  }

  async sendToManagement(
    to: 'all' | 'admin' | 'assigned',
    payload: PushPayload,
    options?: { assignedAdminId?: number; actorId?: number },
  ) {
    const { assignedAdminId, actorId } = options || {};

    if (to === 'assigned' && !assignedAdminId) return;

    const userWhereFilter: Prisma.UserWhereInput = {};

    if (actorId) {
      userWhereFilter.id = { not: actorId };
    }

    if (to === 'all') {
      userWhereFilter.role = { in: ['ADMIN', 'MANAGER'] };
    } else if (to === 'admin') {
      userWhereFilter.role = 'ADMIN';
    } else if (to === 'assigned') {
      userWhereFilter.id = actorId
        ? { equals: assignedAdminId, not: actorId }
        : assignedAdminId;
    }

    const users = await this.prisma.user.findMany({
      where: userWhereFilter,
      select: { id: true },
    });

    if (!users.length) return;

    const targetIds = users.map((u) => u.id);
    await this.sendToUser(targetIds, payload);
  }

  private async dispatchPush(
    sub: { id: number; endpoint: string; p256dh: string; auth: string },
    payloadString: string,
  ) {
    const pushConfig = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.p256dh,
        auth: sub.auth,
      },
    };

    try {
      await webPush.sendNotification(pushConfig, payloadString);
    } catch (error: unknown) {
      if (error instanceof webPush.WebPushError) {
        if (error.statusCode === 404 || error.statusCode === 410) {
          this.logger.warn(
            `Push subscription expired/invalid. Removing ID: ${sub.id}`,
          );
          await this.prisma.pushSubscription.delete({
            where: { id: sub.id },
          });
          return;
        }
      }

      this.logger.error(`Failed to send push to sub ID ${sub.id}:`, error);
    }
  }
}
