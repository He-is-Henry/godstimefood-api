import { Controller, Get, Param, Patch } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { User } from 'src/common/decorators/user.decorator';

@Controller('messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get()
  getMessages(@User('id') userId: number) {
    return this.messagesService.getMessages(userId);
  }

  @Patch('read/all')
  markAllAsRead(@User('id') userId: number) {
    return this.messagesService.markAllAsRead(userId);
  }

  @Patch(':id/read')
  readMessage(@User('id') userId: number, @Param('id') id: string) {
    return this.messagesService.readMessage(userId, +id);
  }
}
