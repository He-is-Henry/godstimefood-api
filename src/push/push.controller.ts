import { Body, Controller, Post } from '@nestjs/common';
import { User } from 'src/common/decorators/user.decorator';
import { CreatePushDto } from './dto/create-push.dto';
import { PushService } from './push.service';

@Controller('push')
export class PushController {
  constructor(private readonly pushService: PushService) {}
  @Post('subscribe')
  subscribe(
    @User('sessionId') sessionId: string,
    @Body() createPushDto: CreatePushDto,
  ) {
    return this.pushService.subscribe(sessionId, createPushDto);
  }
}
