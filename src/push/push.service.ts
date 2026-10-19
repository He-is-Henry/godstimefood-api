import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webPush from 'web-push';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreatePushDto } from './dto/create-push.dto';

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
    userId: number,
    payload: { title: string; body: string; icon?: string; url?: string },
  ) {
    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: {
        session: {
          userId,
        },
      },
    });

    if (!subscriptions.length) return;

    const payloadString = JSON.stringify(payload);

    await Promise.allSettled(
      subscriptions.map(async (sub) => {
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
      }),
    );
  }
}
