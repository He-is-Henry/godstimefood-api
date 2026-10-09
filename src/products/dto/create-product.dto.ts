import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateProductDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsInt()
  price!: number;

  @IsInt()
  availableQuantity?: number;

  @IsBoolean()
  isAvailable!: boolean;

  @IsDateString()
  createdAt!: Date;

  @IsDateString()
  updatedAt!: Date;
}
