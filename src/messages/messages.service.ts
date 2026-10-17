import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateMessageDto } from './dto/create-message.dto';

@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

  create(createMessageDto: CreateMessageDto) {
    return this.prisma.message.create({
      data: createMessageDto,
    });
  }

  getMessages(userId: number) {
    return this.prisma.message.findMany({
      where: { userId },
    });
  }

  readMessage(userId: number, id: number) {
    return this.prisma.message.update({
      where: { id, userId },
      data: { read: true },
    });
  }

  markAllAsRead(userId: number) {
    return this.prisma.message.updateMany({
      where: { userId },
      data: { read: true },
    });
  }
}
