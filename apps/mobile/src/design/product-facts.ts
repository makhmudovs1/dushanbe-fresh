// USDA SR Legacy, April 2018: values per 100 g of edible portion, not a batch analysis.
// Tuple: FDC ID, kcal, protein g, fat g, carbohydrate-by-difference g, storage profile.
type ReferenceRow = readonly [number, number, number, number, number, keyof typeof storageProfiles];
type Localized = { ru: string; tg: string };
const maryland = "https://extension.umd.edu/resource/storing-garden-fruits-and-vegetables";
const minnesota = "https://extension.umn.edu/garden-and-home/yard-and-garden/gardening-in-minnesota/harvesting-and-storing-home-garden-vegetables";
const virginia = "https://www.pubs.ext.vt.edu/348/348-960/348-960.html";
const utah = "https://extension.usu.edu/preserve-the-harvest/research/food-storage-in-home";
const fao = "https://www.fao.org/4/s8270e/S8270E07.htm";

export const storageProfiles = {
  roots: { ru: "1–2 недели в овощном отделении холодильника, без ботвы.", tg: "1–2 ҳафта дар қисми сабзавоти яхдон, бе баргҳо.", source: maryland },
  cabbage: { ru: "3–6 дней в холодильнике, в пакете с отверстиями.", tg: "3–6 рӯз дар яхдон, дар халтаи сӯрохдор.", source: maryland },
  potato: { ru: "2–4 недели в прохладном, сухом и тёмном месте с вентиляцией.", tg: "2–4 ҳафта дар ҷои салқин, хушк ва торик бо ҳавогузаронӣ.", source: maryland },
  onion: { ru: "2–4 недели в прохладном сухом месте с вентиляцией.", tg: "2–4 ҳафта дар ҷои салқину хушк бо ҳавогузаронӣ.", source: maryland },
  cool: { ru: "До 1 недели в прохладном месте около +13 °C; в холодильнике — несколько дней.", tg: "То 1 ҳафта дар ҷои салқин, тақрибан +13 °C; дар яхдон — чанд рӯз.", source: minnesota },
  tomato: { ru: "При комнатной температуре до созревания. Спелые плоды используйте в первую очередь.", tg: "То пухтан дар ҳарорати хона. Меваҳои пухтаро аввал истифода баред.", source: maryland },
  pumpkin: { ru: "Целая тыква — до 1 месяца при комнатной температуре; разрезанную храните в холодильнике.", tg: "Кадуи бутун — то 1 моҳ дар ҳарорати хона; буридаро дар яхдон нигоҳ доред.", source: maryland },
  zucchini: { ru: "4–5 дней в холодильнике.", tg: "4–5 рӯз дар яхдон.", source: virginia },
  pepper: { ru: "До 5 дней в холодильнике, в пакете с отверстиями.", tg: "То 5 рӯз дар яхдон, дар халтаи сӯрохдор.", source: maryland },
  garlic: { ru: "В сухом прохладном месте с вентиляцией, без прямого света.", tg: "Дар ҷои хушку салқин бо ҳавогузаронӣ, дур аз нури мустақим.", source: minnesota },
  beans: { ru: "3–5 дней в холодильнике.", tg: "3–5 рӯз дар яхдон.", source: virginia },
  ripeFruit: { ru: "Дозревать при комнатной температуре; спелые плоды — 3–5 дней в холодильнике.", tg: "То пухтан дар ҳарорати хона; меваҳои пухта — 3–5 рӯз дар яхдон.", source: virginia },
  apple: { ru: "До 3 недель при комнатной температуре; для более долгого хранения — холодильник.", tg: "То 3 ҳафта дар ҳарорати хона; барои нигоҳдории дарозтар — яхдон.", source: virginia },
  grape: { ru: "До 1 недели в холодильнике. Мыть перед употреблением.", tg: "То 1 ҳафта дар яхдон. Пеш аз истеъмол бишӯед.", source: virginia },
  banana: { ru: "До созревания при комнатной температуре; спелые — до 3 дней в холодильнике.", tg: "То пухтан дар ҳарорати хона; пухта — то 3 рӯз дар яхдон.", source: virginia },
  citrus: { ru: "До 10 дней при комнатной температуре или 10–21 день в холодильнике.", tg: "То 10 рӯз дар ҳарорати хона ё 10–21 рӯз дар яхдон.", source: virginia },
  fruit: { ru: "В прохладном месте; спелые плоды — в холодильнике, отдельно от повреждённых.", tg: "Дар ҷои салқин; меваҳои пухта — дар яхдон, ҷудо аз меваҳои осебдида.", source: fao },
  greens: { ru: "2–4 дня в холодильнике, в пакете с отверстиями. Мыть перед употреблением.", tg: "2–4 рӯз дар яхдон, дар халтаи сӯрохдор. Пеш аз истеъмол бишӯед.", source: maryland },
  basil: { ru: "До 5 дней при комнатной температуре, стебли — в воде.", tg: "То 5 рӯз дар ҳарорати хона, пояҳо — дар об.", source: minnesota },
  dry: { ru: "В сухом прохладном месте, в плотно закрытой ёмкости. Срок — по маркировке партии.", tg: "Дар ҷои хушку салқин, дар зарфи маҳкам. Муҳлат — тибқи тамғаи партия.", source: utah }
} satisfies Record<string, Localized & { source: string }>;

export const productFactRows = {
  "white-cabbage": [169975, 25, 1.28, 0.1, 5.8, "cabbage"],
  "apples-gala": [168204, 57, 0.25, 0.12, 13.7, "apple"],
  potatoes: [170026, 77, 2.05, 0.09, 17.5, "potato"],
  carrots: [170393, 41, 0.93, 0.24, 9.58, "roots"],
  cucumbers: [168409, 15, 0.65, 0.11, 3.63, "cool"],
  tomatoes: [170457, 18, 0.88, 0.2, 3.89, "tomato"],
  onions: [170000, 40, 1.1, 0.1, 9.34, "onion"],
  "radish-turb": [168451, 18, 0.6, 0.1, 4.1, "roots"],
  beetroot: [169145, 43, 1.61, 0.17, 9.56, "roots"],
  pumpkin: [168448, 26, 1, 0.1, 6.5, "pumpkin"],
  zucchini: [169291, 17, 1.21, 0.32, 3.11, "zucchini"],
  cauliflower: [169986, 25, 1.92, 0.28, 4.97, "cabbage"],
  eggplant: [169228, 25, 0.98, 0.18, 5.88, "cool"],
  "bell-pepper": [170427, 20, 0.86, 0.17, 4.64, "pepper"],
  garlic: [169230, 149, 6.36, 0.5, 33.1, "garlic"],
  "green-beans": [169961, 31, 1.83, 0.22, 6.97, "beans"],
  "hot-green-pepper": [170497, 40, 2, 0.2, 9.46, "pepper"],
  pears: [169118, 57, 0.36, 0.14, 15.2, "ripeFruit"],
  grapes: [174683, 69, 0.72, 0.16, 18.1, "grape"],
  bananas: [173944, 89, 1.09, 0.33, 22.8, "banana"],
  mandarins: [169105, 53, 0.81, 0.31, 13.3, "citrus"],
  // Generic raw apple reference: USDA has no Simirenko-specific analysis here.
  "apples-simirenko": [171688, 52, 0.26, 0.17, 13.8, "apple"],
  pomegranates: [169134, 83, 1.67, 1.17, 18.7, "fruit"],
  quince: [168163, 57, 0.4, 0.1, 15.3, "fruit"],
  peaches: [169928, 39, 0.91, 0.25, 9.54, "ripeFruit"],
  oranges: [169097, 47, 0.94, 0.12, 11.8, "citrus"],
  kiwi: [168153, 61, 1.14, 0.52, 14.7, "fruit"],
  persimmon: [169941, 70, 0.58, 0.19, 18.6, "fruit"],
  lemons: [167746, 29, 1.1, 0.3, 9.32, "citrus"],
  "green-onion": [170005, 32, 1.83, 0.19, 7.34, "greens"],
  dill: [172233, 43, 3.46, 1.12, 7.02, "greens"],
  cilantro: [169997, 23, 2.13, 0.52, 3.67, "greens"],
  basil: [172232, 23, 3.15, 0.64, 2.65, "basil"],
  mint: [173475, 44, 3.29, 0.73, 8.41, "greens"],
  "leaf-lettuce": [169249, 15, 1.36, 0.15, 2.87, "greens"],
  walnuts: [170187, 654, 15.2, 65.2, 13.7, "dry"],
  "dark-raisins": [168165, 299, 3.3, 0.25, 79.3, "dry"],
  "dried-plums": [168162, 240, 2.18, 0.38, 63.9, "dry"],
  "dried-figs": [174665, 249, 3.3, 0.93, 63.9, "dry"],
  almonds: [170567, 579, 21.2, 49.9, 21.6, "dry"],
  "dried-apricots": [173941, 241, 3.39, 0.51, 62.6, "dry"],
  chickpeas: [173756, 378, 20.5, 6.04, 63, "dry"],
  "red-beans": [173744, 337, 22.5, 1.06, 61.3, "dry"],
  parsley: [170416, 36, 2.97, 0.79, 6.33, "greens"]
} satisfies Record<string, ReferenceRow>;

export function productFacts(slug: string) {
  // Exact allowlist: never guess nutrition from a category, substring or new product name.
  if (!Object.hasOwn(productFactRows, slug)) return null;
  const [fdcId, calories, protein, fat, carbohydrate, storage] = productFactRows[slug as keyof typeof productFactRows];
  return { calories, protein, fat, carbohydrate, storage: storageProfiles[storage],
    source: `https://fdc.nal.usda.gov/food-details/${fdcId}/nutrients` };
}
