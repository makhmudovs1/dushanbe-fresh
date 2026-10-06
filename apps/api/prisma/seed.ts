import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const categories = [
  { name: "Овощи", slug: "vegetables", sortOrder: 10 },
  { name: "Фрукты", slug: "fruits", sortOrder: 20 },
  { name: "Зелень", slug: "greens", sortOrder: 30 },
  { name: "Орехи и сухофрукты", slug: "nuts-dried-fruits", sortOrder: 40 }
];

const products = [
  {
    categorySlug: "vegetables",
    name: "Помидоры",
    slug: "tomatoes",
    description: "Сочные рыночные помидоры для салатов и домашней кухни.",
    unit: "kg",
    currentPurchasePrice: "8.00",
    currentSalePrice: "10.50",
    isWeighted: true,
    minQuantity: "0.500",
    quantityStep: "0.250",
    sortOrder: 10,
    qualityOptions: ["спелые", "твёрдые", "на выбор сборщика"]
  },
  {
    categorySlug: "vegetables",
    name: "Огурцы",
    slug: "cucumbers",
    description: "Хрустящие огурцы для свежих салатов.",
    unit: "kg",
    currentPurchasePrice: "6.50",
    currentSalePrice: "8.50",
    isWeighted: true,
    minQuantity: "0.500",
    quantityStep: "0.250",
    sortOrder: 20
  },
  {
    categorySlug: "vegetables",
    name: "Картофель",
    slug: "potatoes",
    description: "Повседневный картофель для варки, жарки и запекания.",
    unit: "kg",
    currentPurchasePrice: "3.20",
    currentSalePrice: "4.50",
    isWeighted: true,
    minQuantity: "1.000",
    quantityStep: "0.500",
    sortOrder: 30
  },
  {
    categorySlug: "vegetables",
    name: "Лук",
    slug: "onions",
    description: "Репчатый лук с местного рынка.",
    unit: "kg",
    currentPurchasePrice: "2.80",
    currentSalePrice: "4.00",
    isWeighted: true,
    minQuantity: "0.500",
    quantityStep: "0.250",
    sortOrder: 40
  },
  {
    categorySlug: "vegetables",
    name: "Морковь",
    slug: "carrots",
    description: "Свежая морковь для супов, салатов и гарниров.",
    unit: "kg",
    currentPurchasePrice: "3.50",
    currentSalePrice: "5.00",
    isWeighted: true,
    minQuantity: "0.500",
    quantityStep: "0.250",
    sortOrder: 50
  },
  {
    categorySlug: "vegetables",
    name: "Сладкий перец",
    slug: "bell-pepper",
    description: "Яркий сладкий перец для салатов и горячих блюд.",
    unit: "kg",
    currentPurchasePrice: "12.00",
    currentSalePrice: "15.50",
    isWeighted: true,
    minQuantity: "0.300",
    quantityStep: "0.100",
    sortOrder: 60
  },
  {
    categorySlug: "vegetables",
    name: "Баклажан",
    slug: "eggplant",
    description: "Баклажаны для жарки, запекания и овощных блюд.",
    unit: "kg",
    currentPurchasePrice: "7.50",
    currentSalePrice: "10.00",
    isWeighted: true,
    minQuantity: "0.500",
    quantityStep: "0.250",
    sortOrder: 70
  },
  {
    categorySlug: "fruits",
    name: "Яблоки",
    slug: "apples",
    description: "Сезонные яблоки, подобранные для ежедневного стола.",
    unit: "kg",
    currentPurchasePrice: "7.00",
    currentSalePrice: "9.50",
    isWeighted: true,
    minQuantity: "0.500",
    quantityStep: "0.250",
    sortOrder: 80
  },
  {
    categorySlug: "fruits",
    name: "Бананы",
    slug: "bananas",
    description: "Бананы с выбором степени спелости.",
    unit: "kg",
    currentPurchasePrice: "10.00",
    currentSalePrice: "13.00",
    isWeighted: true,
    minQuantity: "0.500",
    quantityStep: "0.250",
    sortOrder: 90,
    qualityOptions: ["зелёные", "средние", "спелые"]
  },
  {
    categorySlug: "fruits",
    name: "Лимоны",
    slug: "lemons",
    description: "Ароматные лимоны для чая, соусов и выпечки.",
    unit: "kg",
    currentPurchasePrice: "11.00",
    currentSalePrice: "14.50",
    isWeighted: true,
    minQuantity: "0.300",
    quantityStep: "0.100",
    sortOrder: 100
  },
  {
    categorySlug: "fruits",
    name: "Виноград",
    slug: "grapes",
    description: "Сладкий виноград для десертов и перекусов.",
    unit: "kg",
    currentPurchasePrice: "13.00",
    currentSalePrice: "17.00",
    isWeighted: true,
    minQuantity: "0.500",
    quantityStep: "0.250",
    sortOrder: 110
  },
  {
    categorySlug: "greens",
    name: "Укроп",
    slug: "dill",
    description: "Свежий пучок укропа для салатов и горячих блюд.",
    unit: "bunch",
    currentPurchasePrice: "1.50",
    currentSalePrice: "2.50",
    isWeighted: false,
    minQuantity: "1.000",
    quantityStep: "1.000",
    sortOrder: 120
  },
  {
    categorySlug: "greens",
    name: "Петрушка",
    slug: "parsley",
    description: "Свежая петрушка с рынка.",
    unit: "bunch",
    currentPurchasePrice: "1.50",
    currentSalePrice: "2.50",
    isWeighted: false,
    minQuantity: "1.000",
    quantityStep: "1.000",
    sortOrder: 130
  },
  {
    categorySlug: "greens",
    name: "Кинза",
    slug: "cilantro",
    description: "Ароматная кинза для плова, супов и салатов.",
    unit: "bunch",
    currentPurchasePrice: "1.50",
    currentSalePrice: "2.50",
    isWeighted: false,
    minQuantity: "1.000",
    quantityStep: "1.000",
    sortOrder: 140
  },
  {
    categorySlug: "nuts-dried-fruits",
    name: "Грецкие орехи",
    slug: "walnuts",
    description: "Очищенные грецкие орехи для выпечки и перекусов.",
    unit: "kg",
    currentPurchasePrice: "58.00",
    currentSalePrice: "68.00",
    isWeighted: true,
    minQuantity: "0.200",
    quantityStep: "0.100",
    sortOrder: 150
  },
  {
    categorySlug: "nuts-dried-fruits",
    name: "Курага",
    slug: "dried-apricots",
    description: "Сладкая курага для компотов, каш и перекусов.",
    unit: "kg",
    currentPurchasePrice: "38.00",
    currentSalePrice: "46.00",
    isWeighted: true,
    minQuantity: "0.200",
    quantityStep: "0.100",
    sortOrder: 160
  }
];

async function main() {
  const categoryBySlug = new Map<string, string>();

  for (const category of categories) {
    const saved = await prisma.category.upsert({
      where: { slug: category.slug },
      update: category,
      create: category
    });

    categoryBySlug.set(saved.slug, saved.id);
  }

  for (const product of products) {
    const categoryId = categoryBySlug.get(product.categorySlug);

    if (!categoryId) {
      throw new Error(`Missing category ${product.categorySlug}`);
    }

    const saved = await prisma.product.upsert({
      where: { slug: product.slug },
      update: toProductData(product, categoryId),
      create: toProductData(product, categoryId)
    });

    await prisma.productQualityOption.deleteMany({
      where: { productId: saved.id }
    });

    if (product.qualityOptions) {
      await prisma.productQualityOption.createMany({
        data: product.qualityOptions.map((label, index) => ({
          productId: saved.id,
          label,
          sortOrder: index * 10,
          isActive: true
        }))
      });
    }
  }
}

function toProductData(product: (typeof products)[number], categoryId: string) {
  return {
    categoryId,
    name: product.name,
    slug: product.slug,
    description: product.description,
    unit: product.unit,
    currentPurchasePrice: new Prisma.Decimal(product.currentPurchasePrice),
    currentSalePrice: new Prisma.Decimal(product.currentSalePrice),
    isWeighted: product.isWeighted,
    minQuantity: new Prisma.Decimal(product.minQuantity),
    quantityStep: new Prisma.Decimal(product.quantityStep),
    isActive: true,
    isAvailableToday: true,
    sortOrder: product.sortOrder
  };
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
