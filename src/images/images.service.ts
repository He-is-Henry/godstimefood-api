import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateImageDto } from './dto/create-image.dto';
import { UpdateImageDto } from './dto/update-image.dto';
import { SupabaseService } from 'src/supabase/supabase.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class ImagesService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly prisma: PrismaService,
  ) {}

  async create(file: Express.Multer.File, createImageDto: CreateImageDto) {
    if (!file) {
      throw new BadRequestException('An image file is required');
    }

    const path = await this.supabaseService.uploadFile(file);

    const name = createImageDto?.name ?? path;

    const image = await this.prisma.image.create({
      data: {
        path,
        name,
      },
    });

    return this.formatImage(image);
  }

  async findAll() {
    const images = await this.prisma.image.findMany();

    return images.map((i) => this.formatImage(i));
  }

  async findOne(id: number) {
    const image = await this.prisma.image.findUnique({
      where: { id },
    });

    if (!image) throw new NotFoundException('Image does not exist');

    return this.formatImage(image);
  }

  async update(id: number, updateImageDto: UpdateImageDto) {
    try {
      const image = await this.prisma.image.update({
        where: { id },
        data: updateImageDto,
      });

      return this.formatImage(image);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('Image does not exist');
      }
      throw error;
    }
  }

  async remove(id: number, sure = false) {
    const imageDoc = await this.prisma.image.findUnique({
      where: { id },
      include: {
        productImages: { select: { id: true } },
      },
    });

    if (!imageDoc) throw new NotFoundException('Image does not exist');

    const image = this.formatImage(imageDoc);
    if (imageDoc.productImages.length > 0 && !sure) {
      throw new ConflictException(
        `This image is currently linked to ${imageDoc.productImages.length} product(s). Are you sure you want to proceed?.`,
      );
    }
    await this.supabaseService.deleteFile(image.path);

    return this.prisma.image.delete({
      where: { id },
    });
  }

  formatImage<T extends { path: string }>(image: T) {
    return {
      ...image,
      url: this.supabaseService.getFile(image.path),
    };
  }
}
