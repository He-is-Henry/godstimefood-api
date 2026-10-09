import { Controller, Delete, Get, Param } from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { User } from 'src/common/decorators/user.decorator';

@Controller('auth/sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Get('')
  async getSessions(
    @User('id') userId: number,
    @User('sessionId') sessionId: string,
  ) {
    return this.sessionsService.getSessions(userId, sessionId);
  }

  @Delete('revoke/all')
  async revokeAllExcept(
    @User('id') userId: number,
    @User('sessionId') sessionId: string,
  ) {
    return this.sessionsService.revokeAllOthers(userId, sessionId);
  }

  @Delete('revoke/:id')
  async deleteSession(
    @User('id') userId: number,
    @User('sessionId') currentSessionId: string,
    @Param('id') targetSessionId: string,
  ) {
    return this.sessionsService.deleteForUser(
      userId,
      targetSessionId,
      currentSessionId,
    );
  }
}
