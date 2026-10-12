import { Body, Controller, Get, Post } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { User } from 'src/common/decorators/user.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  createOrder(
    @User('id') customerId: number,
    @Body() createOrderDto: CreateOrderDto,
  ) {
    return this.ordersService.createOrder(customerId, createOrderDto);
  }

  @Get()
  getOrders(@User('id') customerId: number) {
    return this.ordersService.findOrders(customerId);
  }

  @Get('admin')
  @Roles(Role.ADMIN, Role.MANAGER)
  findAllOrdersAdmin() {
    return this.ordersService.findAllOrdersAdmin();
  }
}
