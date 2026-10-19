import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UsersService } from 'src/users/users.service';
import { Prisma, Product, CartItem, Status, PaidStatus } from '@prisma/client';
import { SupabaseService } from 'src/supabase/supabase.service';
import { UpdateOrderDto } from './dto/update-order.dto';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { PushPayload, PushService } from 'src/push/push.service';

interface CartItemWithProd extends Omit<CartItem, 'id'> {
  product: Product;
}

type Cart = CartItemWithProd[];

export const orderWithItemsInclude = Prisma.validator<Prisma.OrderInclude>()({
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

const omit = {
  cancelledById: true,
  confirmedById: true,
  assignedToId: true,
  deliveredById: true,
  paidById: true,
};

const BASE_DELIVERY_FEE = 500;
const PER_ITEM_DELIVERY_FEE = 100;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly supabaseService: SupabaseService,
    private readonly pushService: PushService,
  ) {}

  private normalizeOrder(order: OrderWithDetails) {
    return {
      ...order,
      items: order.items.map((item) => ({
        ...item,
        product: {
          name: item.product.name,
          description: item.product.description,
          images: {
            item: item.product.images.map((img) => ({
              path: img.image.path,
              url: this.supabaseService.getFile(img.image.path),
            })),
          },
        },
      })),
    };
  }

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

    const order = await this.findOrder(customerId, result.id);

    const customerName =
      [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Customer';
    const firstProductImage = order.items[0]?.product?.images?.item[0]?.url;

    const payload: PushPayload = {
      title: '🛍️ New Order Received!',
      body: `${customerName} placed Order #${order.id} for ₦${order.totalAmount.toLocaleString()}`,
      icon: firstProductImage,
      badge: '/icons/badge-72x72.png',
      url: `/admin/orders/${order.id}`,
      tag: `order-${order.id}`,
      renotify: true,
    };

    void this.pushService.sendToManagement('all', payload);
    return order;
  }

  async findOrders(customerId: number) {
    const orders = await this.prisma.order.findMany({
      where: {
        customerId,
      },
      orderBy: { createdAt: 'desc' },
      include: orderWithItemsInclude,
      omit,
    });

    const mappedOrders = orders.map((order) => this.normalizeOrder(order));

    return mappedOrders;
  }

  async findOrder(customerId: number, id: number) {
    const order = await this.prisma.order.findFirst({
      where: {
        id,
        customerId,
      },
      include: orderWithItemsInclude,
      omit,
    });

    if (!order) throw new NotFoundException('Order not found');

    return this.normalizeOrder(order);
  }

  async cancelOrder(customerId: number, id: number) {
    const order = await this.prisma.order.findUnique({
      where: { id, customerId },
      select: { status: true },
    });

    if (!order) throw new NotFoundException('Order not found');

    if (order.status !== Status.PENDING) {
      throw new BadRequestException(
        'You can only cancel a pending order, contact support for more',
      );
    }

    const updatedOrder = await this.prisma.order.update({
      where: { id, customerId, status: Status.PENDING },
      data: { status: Status.CANCELLED },
      include: orderWithItemsInclude,
      omit,
    });

    const normalized = this.normalizeOrder(updatedOrder);
    const firstProductImage =
      normalized.items[0]?.product?.images?.item[0]?.url;

    const payload: PushPayload = {
      title: '❌ Order Cancelled',
      body: `Customer cancelled Order #${id}. Do not prepare.`,
      icon: firstProductImage,
      badge: '/icons/badge-72x72.png',
      url: `/admin/orders/${id}`,
      tag: `order-${id}`,
      renotify: true,
    };

    void this.pushService.sendToManagement('all', payload);

    return normalized;
  }

  async claimPayment(customerId: number, id: number) {
    const order = await this.prisma.order.findFirst({
      where: {
        id,
        customerId,
      },
    });

    if (!order) throw new NotFoundException('Order not found');
    if (order.status === Status.DELIVERED) {
      throw new BadRequestException('You cannot update a delivered order');
    }

    const updatedOrder = await this.prisma.order.update({
      where: { id, customerId },
      data: { paid: PaidStatus.PENDING_VERIFICATION },
      include: orderWithItemsInclude,
      omit,
    });

    const normalized = this.normalizeOrder(updatedOrder);
    const firstProductImage =
      normalized.items[0]?.product?.images?.item[0]?.url;

    const payload: PushPayload = {
      title: '💳 Payment Claimed',
      body: `Customer submitted payment for Order #${id} (₦${normalized.totalAmount.toLocaleString()}). Tap to verify.`,
      icon: firstProductImage,
      badge: '/icons/badge-72x72.png',
      url: `/admin/orders/${id}`,
      tag: `order-${id}`,
      renotify: true,
    };

    void this.pushService.sendToManagement('all', payload);

    return normalized;
  }

  async updateOrder(
    customerId: number,
    id: number,
    updateOrderDto: UpdateOrderDto,
  ) {
    const order = await this.prisma.order.findFirst({
      where: {
        id,
        customerId,
      },
    });

    if (!order) throw new NotFoundException('Order not found');

    if (order.status === Status.DELIVERED) {
      throw new BadRequestException('You cannot update a delivered order');
    }

    return await this.prisma.order.update({
      where: { id, customerId },
      data: updateOrderDto,
      include: orderWithItemsInclude,
      omit,
    });
  }

  async getCode(customerId: number, id: number) {
    const order = await this.prisma.order.findFirst({
      where: {
        id,
        customerId,
      },
    });

    if (!order) throw new NotFoundException('Order not found');
    if (order.status === Status.DELIVERED) {
      throw new BadRequestException('You cannot update a delivered order');
    }

    if (order.paid !== PaidStatus.VERIFIED) {
      throw new UnauthorizedException(
        'You can only get code when payment is verified, please contact support for more',
      );
    }

    const code = crypto.randomInt(10000).toString().padStart(4, '0');
    const confirmationCodeHash = await bcrypt.hash(code, 10);

    const updatedOrder = await this.prisma.order.update({
      where: {
        id,
        customerId,
      },
      data: {
        confirmationCodeHash,
        confirmationAttempts: 0,
        confirmationLockedUntil: null,
      },
      include: orderWithItemsInclude,
      omit,
    });

    return { code, order: updatedOrder };
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
