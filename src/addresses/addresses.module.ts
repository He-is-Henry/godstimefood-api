import { Module } from '@nestjs/common';
import { AddressesService } from './addresses.service';
import { AddressesController } from './addresses.controller';

@Module({
  providers: [AddressesService],
  exports: [AddressesService],
  controllers: [AddressesController],
})
export class AddressesModule {}
