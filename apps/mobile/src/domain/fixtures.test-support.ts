import type { Product } from "./catalog";
export const potato: Product = {
  id: "potato-white",
  slug: "potato-white",
  name: "Картофель белый",
  nameTj: "Картошкаи сафед",
  description: "Описание",
  descriptionTj: "Тавсиф",
  image: "/api/v1/media/potato.webp",
  images: [],
  priceDrop: null,
  unit: "kg",
  sellingPrice: "6.9",
  isWeighted: true,
  minQuantity: "0.5",
  quantityStep: "0.5",
  category: {
    id: "vegetables",
    slug: "vegetables",
    name: "Овощи",
    nameTj: "Сабзавот",
  },
};
