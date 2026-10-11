import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';

export class CreateProductDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsInt()
  price!: number;

  @IsInt()
  @IsOptional()
  availableQuantity?: number;

  @IsBoolean()
  isAvailable!: boolean;
}
