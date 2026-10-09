import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  try {
    const categoriesData = [
      {
        id: 1,
        name: 'swallows',
      },
      {
        id: 2,
        name: 'rice',
      },
      {
        id: 3,
        name: 'proteins',
      },
      {
        id: 4,
        name: 'beans',
      },
      {
        id: 5,
        name: 'pasta',
      },
      {
        id: 6,
        name: 'soups',
      },
      {
        id: 7,
        name: 'moin moin',
      },
      {
        id: 8,
        name: 'sides and extras',
      },
      {
        id: 10,
        name: 'main dishes',
      },
    ] as const;

    type categoryName = (typeof categoriesData)[number]['name'];

    const productsData: {
      name: string;
      price: number;
      categories: categoryName[];
    }[] = [
      {
        name: 'Amala',
        price: 200,
        categories: ['swallows', 'main dishes'],
      },
      {
        name: 'Pounded Yam',
        price: 500,
        categories: ['swallows', 'main dishes'],
      },
      {
        name: 'Eba',
        price: 200,
        categories: ['swallows', 'main dishes'],
      },
      {
        name: 'Jollof Rice',
        price: 500,
        categories: ['rice', 'main dishes'],
      },
      {
        name: 'Fried Rice',
        price: 500,
        categories: ['rice', 'main dishes'],
      },
      {
        name: 'Ewa Agoyin',
        price: 500,
        categories: ['beans', 'main dishes'],
      },
      {
        name: 'Beans And Corn',
        price: 500,
        categories: ['beans', 'main dishes'],
      },

      {
        name: 'Egusi Soup',
        price: 4000,
        categories: ['soups'],
      },
      {
        name: 'Fisherman Soup',
        price: 1500,
        categories: ['soups'],
      },
      {
        name: 'Moi Moi Ordinary',
        price: 550,
        categories: ['beans', 'moin moin', 'proteins'],
      },
      {
        name: 'Goat meat',
        price: 2000,
        categories: ['proteins'],
      },
      {
        name: 'Assorted Meat',
        price: 500,
        categories: ['proteins'],
      },
      {
        name: 'Chicken',
        price: 5000,
        categories: ['proteins'],
      },
      {
        name: 'Turkey',
        price: 7000,
        categories: ['proteins'],
      },
      {
        name: 'Peppered Gizzard',
        price: 2000,
        categories: ['proteins'],
      },
    ];

    for (const product of productsData) {
      // create product and get id;
      const { name, price, categories } = product;
      const result = await prisma.product.create({
        data: {
          name,
          price,
        },
      });

      console.log(`Product ${result.id} - ${result.name} created`);

      const productId = result.id;

      // get category ids;
      const categoryIds = categories.map((c) => {
        const categoryId = categoriesData.find((data) => data.name === c)?.id;
        return categoryId;
      });

      // create product categories;
      for (const categoryId of categoryIds) {
        if (!categoryId) continue;
        const cratedCat = await prisma.productCategory.create({
          data: {
            categoryId,
            productId,
          },
        });
        console.log(`Category ${cratedCat.id} added to product ${productId}`);
      }
    }
  } catch (e) {
    console.log(e);
  }

  const products = await prisma.product.findMany();
  console.log('Seed successful! Products deleted successfully:', products);
}

main()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
