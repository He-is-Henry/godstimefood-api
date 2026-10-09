import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}

  async getAddresses(userId: number) {
    return this.prisma.address.findMany({
      where: { userId },
    });
  }

  async createAddress(userId: number, address: CreateAddressDto) {
    const addressesCount = await this.prisma.address.count({
      where: {
        userId,
      },
    });

    const isDefault = addressesCount === 0;

    return this.prisma.address.create({
      data: {
        userId,
        isDefault,
        ...address,
      },
    });
  }

  async updateAddress(
    userId: number,
    id: number,
    updateAddressDto: UpdateAddressDto,
  ) {
    return this.prisma.address.update({
      where: { userId, id },
      data: updateAddressDto,
    });
  }

  async makeAddressDefault(userId: number, id: number) {
    await this.prisma.address.updateMany({
      where: { userId },
      data: { isDefault: false },
    });

    return this.prisma.address.update({
      where: { id, userId },
      data: { isDefault: true },
    });
  }

  async deleteAddress(userId: number, id: number) {
    return this.prisma.address.delete({
      where: {
        userId,
        id,
      },
    });
  }
}
