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
  urgency?: 'very-low' | 'low' | 'normal' | 'high';
  ttl?: number;
}

export interface PushResult {
  totalSubscriptions: number;
  sentCount: number;
  failedCount: number;
  details: Array<{
    subscriptionId: number;
    success: boolean;
    error?: string;
  }>;
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

  async sendToUser(
    userIds: number | number[],
    payload: PushPayload,
  ): Promise<PushResult> {
    const ids = Array.isArray(userIds) ? userIds : [userIds];
    if (!ids.length) {
      return {
        totalSubscriptions: 0,
        sentCount: 0,
        failedCount: 0,
        details: [],
      };
    }

    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: {
        session: {
          userId: { in: ids },
        },
      },
    });

    if (!subscriptions.length) {
      this.logger.warn(
        `No push subscriptions found in DB for User ID(s): [${ids.join(', ')}]`,
      );
      return {
        totalSubscriptions: 0,
        sentCount: 0,
        failedCount: 0,
        details: [],
      };
    }

    const payloadString = JSON.stringify(payload);

    const details = await Promise.all(
      subscriptions.map((sub) =>
        this.dispatchPush(sub, payloadString, payload),
      ),
    );

    const sentCount = details.filter((d) => d.success).length;
    const failedCount = details.filter((d) => !d.success).length;

    return {
      totalSubscriptions: subscriptions.length,
      sentCount,
      failedCount,
      details,
    };
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
    return await this.sendToUser(targetIds, payload);
  }

  private async dispatchPush(
    sub: { id: number; endpoint: string; p256dh: string; auth: string },
    payloadString: string,
    payload: PushPayload,
  ): Promise<{ subscriptionId: number; success: boolean; error?: string }> {
    const pushConfig = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.p256dh,
        auth: sub.auth,
      },
    };

    const options: webPush.RequestOptions = {
      urgency: payload.urgency || 'high',
      TTL: payload.ttl ?? 86400,
    };

    try {
      await webPush.sendNotification(pushConfig, payloadString, options);
      return { subscriptionId: sub.id, success: true };
    } catch (error: unknown) {
      let errorMessage = 'Unknown push dispatch error';

      if (error instanceof webPush.WebPushError) {
        errorMessage = `WebPush Error ${error.statusCode}: ${error.body || error.message}`;
        if (error.statusCode === 404 || error.statusCode === 410) {
          this.logger.warn(
            `Push subscription expired/invalid (HTTP ${error.statusCode}). Deleting Sub ID: ${sub.id}`,
          );
          await this.prisma.pushSubscription
            .delete({
              where: { id: sub.id },
            })
            .catch((err) =>
              this.logger.error(
                `Failed to clean up dead subscription ${sub.id}`,
                err,
              ),
            );
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }

      this.logger.error(
        `Failed push dispatch to Sub ID ${sub.id}: ${errorMessage}`,
      );
      return { subscriptionId: sub.id, success: false, error: errorMessage };
    }
  }
}
