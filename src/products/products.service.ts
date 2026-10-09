import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { ImagesService } from 'src/images/images.service';

const PopulatedProductArgs = {
  include: {
    categories: {
      select: {
        category: true,
      },
    },
    images: {
      select: {
        image: true,
      },
    },
  },
} satisfies Prisma.ProductDefaultArgs;

type PopulatedProduct = Prisma.ProductGetPayload<typeof PopulatedProductArgs>;

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly imagesService: ImagesService,
  ) {}

  private formatProduct(product: PopulatedProduct) {
    return {
      ...product,
      categories: product.categories.map((item) => item.category),
      images: product.images.map((item) =>
        this.imagesService.formatImage(item.image),
      ),
    };
  }

  create(createProductDto: CreateProductDto) {
    return this.prisma.product.create({
      data: createProductDto,
    });
  }

  async findAll(categoryId?: number) {
    const products = await this.prisma.product.findMany({
      where: categoryId
        ? {
            categories: {
              some: {
                categoryId,
              },
            },
          }
        : undefined,
      include: PopulatedProductArgs.include,
      orderBy: {
        id: 'asc',
      },
    });

    return products.map((p) => this.formatProduct(p));
  }

  async findOne(id: number) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: PopulatedProductArgs.include,
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found.`);
    }

    return this.formatProduct(product);
  }

  async update(id: number, updateProductDto: UpdateProductDto) {
    const product = await this.prisma.product.update({
      where: { id },
      data: updateProductDto,
      include: PopulatedProductArgs.include,
    });

    return this.formatProduct(product);
  }

  async addProductImage(productId: number, imageId: number) {
    await this.prisma.productImage.create({
      data: {
        productId,
        imageId,
      },
    });

    return this.findOne(productId);
  }
  async addProductCategory(productId: number, categoryId: number) {
    await this.prisma.productCategory.create({
      data: {
        productId,
        categoryId,
      },
    });

    return this.findOne(productId);
  }

  async removeProductImage(productId: number, imageId: number) {
    await this.prisma.productImage.delete({
      where: {
        productId_imageId: {
          productId,
          imageId,
        },
      },
    });

    return this.findOne(productId);
  }

  async removeProductCategory(productId: number, categoryId: number) {
    await this.prisma.productCategory.delete({
      where: {
        productId_categoryId: {
          productId,
          categoryId,
        },
      },
    });

    return this.findOne(productId);
  }

  remove(id: number) {
    return this.prisma.product.delete({ where: { id } });
  }
}
