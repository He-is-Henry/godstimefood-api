import { IsInt, IsOptional } from 'class-validator';

export class CreateOrderDto {
  @IsInt()
  addressId!: number;

  @IsOptional()
  @IsInt()
  productId?: number;

  @IsOptional()
  @IsInt()
  quantity?: number;
}
