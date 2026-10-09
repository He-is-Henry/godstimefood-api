import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateSessionDto } from './dto/create-session.dto';
import * as geoip from 'geoip-lite';
import { UpdateSessionDto } from './dto/update-session.dto';

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(createSessionDto: CreateSessionDto) {
    const MAX_SESSIONS = 5;
    const { userId } = createSessionDto;

    const existingSessions = await this.prisma.session.findMany({
      where: { userId },
      orderBy: { updatedAt: 'asc' },
    });

    this.logger.log(
      `User ${userId} currently has ${existingSessions.length} active session(s).`,
    );

    if (existingSessions.length >= MAX_SESSIONS) {
      const excessCount = existingSessions.length - (MAX_SESSIONS - 1);
      const sessionsToDelete = existingSessions.slice(0, excessCount);
      const idsToDelete = sessionsToDelete.map((s) => s.id);

      this.logger.warn(
        `Session cap (${MAX_SESSIONS}) reached for User ${userId}. Evicting ${excessCount} oldest session(s): [${idsToDelete.join(', ')}]`,
      );

      await this.prisma.session.deleteMany({
        where: { id: { in: idsToDelete } },
      });
    }

    const newSession = await this.prisma.session.create({
      data: createSessionDto,
    });

    this.logger.log(`Created new session ${newSession.id} for User ${userId}.`);

    return newSession;
  }

  findById(id: string) {
    return this.prisma.session.findUnique({
      where: { id },
    });
  }

  findForUser(userId: number) {
    return this.prisma.session.findMany({
      where: {
        userId,
      },
      omit: {
        refreshTokenHash: true,
      },
    });
  }

  async getSessions(userId: number, sessionId: string) {
    const sessions = await this.findForUser(userId);

    return sessions.map((s) => ({
      ...s,
      currentDevice: s.id === sessionId,
    }));
  }

  async deleteForUser(userId: number, id: string, currentSessionId: string) {
    await this.prisma.session.deleteMany({
      where: {
        userId,
        id,
      },
    });

    return this.getSessions(userId, currentSessionId);
  }

  revokeAllExcept(userId: number, excludedId: string) {
    return this.prisma.session.deleteMany({
      where: {
        userId,
        id: {
          not: excludedId,
        },
      },
    });
  }

  async revokeAllOthers(userId: number, id: string) {
    await this.revokeAllExcept(userId, id);

    return this.getSessions(userId, id);
  }

  delete(id: string) {
    return this.prisma.session.delete({
      where: { id },
    });
  }

  update(id: string, updateSession: UpdateSessionDto) {
    return this.prisma.session.update({
      where: { id },
      data: updateSession,
    });
  }

  resolveLocation(sessionId: string, ipAddress: string) {
    const geo = geoip.lookup(ipAddress);

    if (!geo) return;

    this.logger.debug({ geo });
    const countryName = new Intl.DisplayNames(['en'], { type: 'region' }).of(
      geo.country,
    );
    const parts = [geo.city, geo.region, countryName].filter(Boolean);
    const location = parts.join(', ');

    // debug
    console.log(location);
    
    return this.prisma.session
      .update({
        where: { id: sessionId },
        data: { location },
      })
      .catch((e) => {
        this.logger.error(e);
      });
  }
}
