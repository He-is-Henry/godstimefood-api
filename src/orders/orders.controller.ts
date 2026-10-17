import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { User } from 'src/common/decorators/user.decorator';
import { UpdateOrderDto } from './dto/update-order.dto';

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

  @Get(':id')
  getOrder(@User('id') customerId: number, @Param('id') id: string) {
    return this.ordersService.findOrder(customerId, +id);
  }

  @Patch(':id')
  updateOrder(
    @User('id') customerId: number,
    @Param('id') id: string,
    @Body() updateOrderDto: UpdateOrderDto,
  ) {
    return this.ordersService.updateOrder(customerId, +id, updateOrderDto);
  }

  @Patch(':id/cancel')
  cancelOrder(@User('id') customerId: number, @Param('id') id: string) {
    return this.ordersService.cancelOrder(customerId, +id);
  }

  @Patch(':id/paid')
  claimPayment(@User('id') customerId: number, @Param('id') id: string) {
    return this.ordersService.claimPayment(customerId, +id);
  }

  @Patch(':id/code')
  getCode(@User('id') customerId: number, @Param('id') id: string) {
    return this.ordersService.getCode(customerId, +id);
  }
}
