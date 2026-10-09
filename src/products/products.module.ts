import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { ImagesModule } from 'src/images/images.module';

@Module({
  imports: [ImagesModule],
  controllers: [ProductsController],
  providers: [ProductsService],
})
export class ProductsModule {}
