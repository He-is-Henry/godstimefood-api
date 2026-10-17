import { IsInt, IsString } from 'class-validator';

export class CreateMessageDto {
  @IsString()
  message!: string;

  @IsInt()
  userId!: number;
}
