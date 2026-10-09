import { PartialType } from '@nestjs/mapped-types';
import { CreateProductDto } from './create-product.dto';
import { IsInt } from 'class-validator';

export class UpdateProductDto extends PartialType(CreateProductDto) {}

export class AddProductImageDto {
  @IsInt()
  imageId!: number;
}

export class AddProductCategoryDto {
  @IsInt()
  categoryId!: number;
}
