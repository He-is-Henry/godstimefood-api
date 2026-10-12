import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UsersService } from 'src/users/users.service';
import { Prisma, Product, CartItem } from '@prisma/client';
import { SupabaseService } from 'src/supabase/supabase.service';

interface CartItemWithProd extends Omit<CartItem, 'id'> {
  product: Product;
}

type Cart = CartItemWithProd[];

const orderWithItemsInclude = Prisma.validator<Prisma.OrderInclude>()({
  items: {
    include: {
      product: {
        select: {
          name: true,
          description: true,
          images: {
            select: {
              image: {
                select: {
                  path: true,
                },
              },
            },
          },
        },
      },
    },
  },
});

const adminOrderInclude = Prisma.validator<Prisma.OrderInclude>()({
  customer: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      email: true,
    },
  },
  items: {
    include: {
      product: {
        select: {
          name: true,
          description: true,
          images: {
            select: {
              image: {
                select: {
                  path: true,
                },
              },
            },
          },
        },
      },
    },
  },
});

export type OrderWithDetails = Prisma.OrderGetPayload<{
  include: typeof orderWithItemsInclude;
}>;

export type AdminOrderWithDetails = Prisma.OrderGetPayload<{
  include: typeof adminOrderInclude;
}>;

const BASE_DELIVERY_FEE = 500;
const PER_ITEM_DELIVERY_FEE = 100;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly supabaseService: SupabaseService,
  ) {}

  async createOrder(customerId: number, createOrderDto: CreateOrderDto) {
    const { productId, addressId, quantity } = createOrderDto;
    const user = await this.usersService.findById(customerId);

    const address = await this.prisma.address.findFirst({
      where: { id: addressId, userId: user.id },
    });

    if (!address) throw new BadRequestException('Address should exist');

    const orderItems: Cart = [];

    if (productId) {
      // if product id exists, user wants to make a quick order
      if (!quantity)
        throw new BadRequestException(
          'You should send a quantity for an instant order',
        );

      // look up the product
      const instantOrderProduct = await this.prisma.product.findUnique({
        where: { id: productId },
      });

      if (!instantOrderProduct)
        throw new NotFoundException('The product you specified does not exist');

      if (!instantOrderProduct.isAvailable) {
        throw new BadRequestException(
          `"${instantOrderProduct.name}" is currently unavailable`,
        );
      }

      if (
        instantOrderProduct.availableQuantity !== null &&
        instantOrderProduct.availableQuantity < quantity
      ) {
        throw new BadRequestException(
          `Only ${instantOrderProduct.availableQuantity} units of "${instantOrderProduct.name}" left in stock`,
        );
      }

      // add to order items array.
      orderItems.push({
        userId: customerId,
        productId: instantOrderProduct.id,
        quantity,
        product: instantOrderProduct,
      });
    } else {
      // else, get user's cart
      const userCart = await this.prisma.cartItem.findMany({
        where: {
          userId: customerId,
        },
        include: {
          product: true,
        },
      });

      if (userCart.length === 0)
        throw new BadRequestException('You cannot checkout an empty cart');

      for (const item of userCart) {
        if (!item.product.isAvailable) {
          throw new BadRequestException(
            `"${item.product.name}" is no longer available`,
          );
        }
        if (
          item.product.availableQuantity !== null &&
          item.product.availableQuantity < item.quantity
        ) {
          throw new BadRequestException(
            `Insufficient stock for "${item.product.name}"`,
          );
        }
      }

      // add all items in cart to order items
      userCart.forEach((c) => orderItems.push(c));
    }

    // after this, we know for sure that we have items in orderItems
    // create order

    const deliveryAddress = [address.address, address.city, address.state]
      .filter(Boolean)
      .join(', ');
    const totalAmount = this.calculateGrandTotal(orderItems);

    const result = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          customerId,
          deliveryAddress,
          totalAmount,
        },
      });

      const orderId = order.id;

      await tx.orderItem.createMany({
        data: orderItems.map((item) => ({
          orderId,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.product.price,
        })),
      });

      if (!productId) {
        await tx.cartItem.deleteMany({ where: { userId: customerId } });
      }

      return order;
    });

    return result;
  }

  async findOrders(customerId: number) {
    const orders = await this.prisma.order.findMany({
      where: {
        customerId,
      },
      orderBy: { createdAt: 'desc' },
      include: orderWithItemsInclude,
    });

    const mappedOrders = orders.map((order) => ({
      ...order,
      items: order.items.map((item) => ({
        ...item,
        product: {
          name: item.product.name,
          description: item.product.description,
          images: item.product.images.map((img) => ({
            path: img.image.path,
            url: this.supabaseService.getFile(img.image.path),
          })),
        },
      })),
    }));

    return mappedOrders;
  }

  async findAllOrdersAdmin() {
    const orders = await this.prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      include: adminOrderInclude,
    });

    const mappedOrders = orders.map((order) => ({
      ...order,
      items: order.items.map((item) => ({
        ...item,
        product: {
          name: item.product.name,
          description: item.product.description,
          images: item.product.images.map((img) => ({
            path: img.image.path,
            url: this.supabaseService.getFile(img.image.path),
          })),
        },
      })),
    }));

    return mappedOrders;
  }

  private calculateGrandTotal(cart: Cart) {
    const totalQuantity = cart.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = cart.reduce(
      (sum, item) => sum + item.product.price * item.quantity,
      0,
    );
    const deliveryFee =
      totalQuantity > 0
        ? BASE_DELIVERY_FEE + totalQuantity * PER_ITEM_DELIVERY_FEE
        : 0;
    const grandTotal = subtotal + deliveryFee;

    return grandTotal;
  }
}
