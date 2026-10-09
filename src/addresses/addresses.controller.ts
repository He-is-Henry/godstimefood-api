import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { AddressesService } from './addresses.service';
import { User } from 'src/common/decorators/user.decorator';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

@Controller('users/me/addresses')
export class AddressesController {
  constructor(private readonly addressesService: AddressesService) {}

  @Get()
  getAddresses(@User('id') userId: number) {
    return this.addressesService.getAddresses(userId);
  }

  @Post()
  createAddress(
    @User('id') userId: number,
    @Body() createAddressDto: CreateAddressDto,
  ) {
    return this.addressesService.createAddress(userId, createAddressDto);
  }

  @Patch(':id')
  updateAddress(
    @User('id') userId: number,
    updateAddressDto: UpdateAddressDto,
    @Param('id') id: string,
  ) {
    return this.addressesService.updateAddress(userId, +id, updateAddressDto);
  }

  @Patch(':id/default')
  makeAddressDefault(@User('id') userId: number, @Param('id') id: string) {
    return this.addressesService.makeAddressDefault(userId, +id);
  }

  @Delete(':id')
  deleteAddress(@User('id') userId: number, @Param('id') id: string) {
    return this.addressesService.deleteAddress(userId, +id);
  }
}
