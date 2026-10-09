import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { CartItemsService } from './cart-items.service';
import { CreateCartItemDto } from './dto/create-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { User } from 'src/common/decorators/user.decorator';

@Controller('cart')
export class CartItemsController {
  constructor(private readonly cartItemsService: CartItemsService) {}

  @Post()
  create(
    @User('id') userId: number,
    @Body() createCartItemDto: CreateCartItemDto,
  ) {
    return this.cartItemsService.create(userId, createCartItemDto);
  }

  @Get()
  findAll(@User('id') userId: number) {
    return this.cartItemsService.findAll(userId);
  }

  @Get(':id')
  findOne(@User('id') userId: number, @Param('id') id: string) {
    return this.cartItemsService.findOne(userId, +id);
  }

  @Patch(':id')
  update(
    @User('id') userId: number,
    @Param('id') id: string,
    @Body() updateCartItemDto: UpdateCartItemDto,
  ) {
    return this.cartItemsService.update(userId, +id, updateCartItemDto);
  }

  @Delete(':id')
  remove(@User('id') userId: number, @Param('id') id: string) {
    return this.cartItemsService.remove(userId, +id);
  }
}
