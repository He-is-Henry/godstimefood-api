import { IsNumberString } from 'class-validator';

export class DeliverOrderDto {
  @IsNumberString()
  code!: string;
}
