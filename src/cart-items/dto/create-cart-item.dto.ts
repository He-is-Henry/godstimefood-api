import { IsInt } from 'class-validator';

export class CreateCartItemDto {
  @IsInt()
  productId!: number;

  @IsInt()
  quantity!: number;
}
