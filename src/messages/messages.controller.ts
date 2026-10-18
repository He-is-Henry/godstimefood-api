import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { MessagesService } from './messages.service';
import { User } from 'src/common/decorators/user.decorator';

@Controller('messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get()
  getMessages(
    @User('id') userId: number,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    return this.messagesService.getMessages(userId, {
      page: page ? +page : undefined,
      limit: limit ? +limit : undefined,
      unreadOnly: unreadOnly === 'true',
    });
  }

  @Get('count')
  getUnreadCount(@User('id') userId: number) {
    return this.messagesService.getUnreadCount(userId);
  }

  @Patch('read/all')
  markAllAsRead(@User('id') userId: number) {
    return this.messagesService.markAllAsRead(userId);
  }

  @Patch(':id/read')
  readMessage(
    @User('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.messagesService.readMessage(userId, id);
  }
}
