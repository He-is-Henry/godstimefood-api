import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { AdminOrdersService } from './admin-orders.service';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { User } from 'src/common/decorators/user.decorator';
import { AssignOrderDto } from './dto/assign-order.dto';
import { DeliverOrderDto } from './dto/deliver-order.dto';
import { FilterAdminOrdersDto } from './dto/filter-admin-order.dto';

@Roles(Role.ADMIN, Role.MANAGER)
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly adminOrdersService: AdminOrdersService) {}

  @Get()
  findAllOrdersAdmin(@Query() dto: FilterAdminOrdersDto) {
    return this.adminOrdersService.findAllOrdersAdmin(dto);
  }

  @Get(':id')
  findOrderAdmin(@Param('id') id: string) {
    return this.adminOrdersService.findOrderAdmin(+id);
  }

  @Patch(':id/confirm')
  confirmOrder(@Param('id') id: string, @User('id') userId: number) {
    return this.adminOrdersService.confirmOrder(+id, userId);
  }

  @Roles(Role.ADMIN)
  @Patch(':id/assign')
  assignOrder(@Param('id') id: string, @Body() assignOrderDto: AssignOrderDto) {
    return this.adminOrdersService.assignOrder(
      +id,
      assignOrderDto.assignedToId,
    );
  }

  @Patch(':id/claim')
  claimOrder(@Param('id') id: string, @User('id') userId: number) {
    return this.adminOrdersService.claimOrder(+id, userId);
  }

  @Patch(':id/release')
  releaseOrder(@Param('id') id: string, @User('id') userId: number) {
    return this.adminOrdersService.releaseOrder(+id, userId);
  }

  @Patch(':id/cancel')
  cancelOrder(@Param('id') id: string, @User() user: JwtPayload) {
    return this.adminOrdersService.cancelOrder(+id, user);
  }

  @Roles(Role.ADMIN)
  @Patch(':id/revive')
  reviveOrder(@Param('id') id: string) {
    return this.adminOrdersService.reviveOrder(+id);
  }

  @Patch(':id/paid')
  confirmPayment(@Param('id') id: string, @User('id') userId: number) {
    return this.adminOrdersService.confirmPayment(+id, userId);
  }

  @Patch(':id/out-for-delivery')
  markOutForDelivery(@Param('id') id: string, @User() user: JwtPayload) {
    return this.adminOrdersService.markOutForDelivery(+id, user);
  }

  @Patch(':id/deliver')
  deliverOrder(
    @Param('id') id: string,
    @User() user: JwtPayload,
    @Body() deliverOrderDto: DeliverOrderDto,
  ) {
    return this.adminOrdersService.deliver(+id, user, deliverOrderDto.code);
  }
}
