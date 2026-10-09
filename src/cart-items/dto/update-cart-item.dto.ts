import { IsInt } from 'class-validator';

export class UpdateCartItemDto {
  @IsInt()
  quantity!: number;
}
