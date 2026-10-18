import { MessageAction } from '@prisma/client';
import { IsEnum, IsInt } from 'class-validator';

export class CreateMessageDto {
  @IsInt()
  userId!: number;

  @IsEnum(MessageAction)
  action!: MessageAction;

  @IsInt()
  orderId!: number;
}
