import { ConflictException, Injectable } from '@nestjs/common';
import { CreateCartItemDto } from './dto/create-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class CartItemsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: number, createCartItemDto: CreateCartItemDto) {
    const productAlreadyInCart = await this.prisma.cartItem.findUnique({
      where: {
        productId_userId: {
          userId,
          productId: createCartItemDto.productId,
        },
      },
    });

    if (productAlreadyInCart) {
      throw new ConflictException('This product is already in your cart');
    }

    return this.prisma.cartItem.create({
      data: {
        ...createCartItemDto,
        userId,
      },
      include: {
        product: true,
      },
    });
  }

  findAll(userId: number) {
    return this.prisma.cartItem.findMany({
      where: { userId },
      include: {
        product: true,
      },
    });
  }

  findOne(userId: number, id: number) {
    return this.prisma.cartItem.findUnique({
      where: { id, userId },
      include: {
        product: true,
      },
    });
  }

  update(userId: number, id: number, updateCartItemDto: UpdateCartItemDto) {
    return this.prisma.cartItem.update({
      where: { id, userId },
      data: updateCartItemDto,
      include: {
        product: true,
      },
    });
  }

  remove(userId: number, id: number) {
    return this.prisma.cartItem.delete({
      where: {
        id,
        userId,
      },
    });
  }
}
