import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import {
  AddProductCategoryDto,
  AddProductImageDto,
  UpdateProductDto,
} from './dto/update-product.dto';
import { Public } from 'src/common/decorators/public.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Roles(Role.ADMIN, Role.MANAGER)
  @Post()
  create(@Body() createProductDto: CreateProductDto) {
    return this.productsService.create(createProductDto);
  }

  @Public()
  @Get()
  findAll(@Query('categoryId') categoryId?: string) {
    return this.productsService.findAll(Number(categoryId));
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productsService.findOne(+id);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateProductDto: UpdateProductDto) {
    return this.productsService.update(+id, updateProductDto);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Patch(':id/image')
  addProductImage(
    @Param('id') id: string,
    @Body() addProductImageDto: AddProductImageDto,
  ) {
    return this.productsService.addProductImage(
      +id,
      addProductImageDto.imageId,
    );
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Patch(':id/category')
  addProductCategory(
    @Param('id') id: string,
    @Body() addProductCategoryDto: AddProductCategoryDto,
  ) {
    return this.productsService.addProductCategory(
      +id,
      addProductCategoryDto.categoryId,
    );
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Delete(':id/image/:imageId')
  removeProductImage(
    @Param('id') id: number,
    @Param('imageId') imageId: number,
  ) {
    return this.productsService.removeProductImage(id, imageId);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Delete(':id/category/:categoryId')
  removeProductCategory(
    @Param('id') id: number,
    @Param('categoryId') categoryId: number,
  ) {
    return this.productsService.removeProductCategory(id, categoryId);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.productsService.remove(+id);
  }
}
