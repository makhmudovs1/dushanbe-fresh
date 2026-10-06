"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import {
  Category,
  createAdminCategory,
  createAdminProduct,
  getAdminCategories,
  getAdminProducts,
  Product,
  updateAdminProduct,
  uploadProductImage
} from "@/lib/api";
import { priceLabel, unitLabel } from "@/lib/format";
import { ProductPhotoField } from "./product-photo-field";
import { ProductImage } from "./product-image";

const emptyProduct = {
  categoryId: "",
  name: "",
  slug: "",
  description: "",
  image: "",
  unit: "kg",
  sellingPrice: "0.00",
  purchasePrice: "0.00",
  isWeighted: true,
  minQuantity: "0.500",
  quantityStep: "0.250",
  isActive: true,
  isAvailableToday: true,
  sortOrder: 0,
  qualityOptionsText: ""
};

export function AdminCatalog() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [form, setForm] = useState(emptyProduct);
  const [categoryForm, setCategoryForm] = useState({ name: "", slug: "", sortOrder: 0 });
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);

  useEffect(() => {
    void load();
  }, []);

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === selectedProductId),
    [products, selectedProductId]
  );

  async function load() {
    try {
      const [nextCategories, nextProducts] = await Promise.all([
        getAdminCategories(),
        getAdminProducts()
      ]);
      setCategories(nextCategories);
      setProducts(nextProducts);
      setForm((current) => ({
        ...current,
        categoryId: current.categoryId || nextCategories[0]?.id || ""
      }));
    } catch {
      setNotice("Не удалось загрузить каталог. Повторите попытку.");
    }
  }

  function selectProduct(product: Product) {
    setPhoto(null);
    setNotice("");
    setSelectedProductId(product.id);
    setForm({
      categoryId: product.category.id,
      name: product.name,
      slug: product.slug,
      description: product.description ?? "",
      image: product.image ?? "",
      unit: product.unit,
      sellingPrice: product.sellingPrice,
      purchasePrice: product.purchasePrice ?? "0.00",
      isWeighted: product.isWeighted,
      minQuantity: product.minQuantity,
      quantityStep: product.quantityStep,
      isActive: product.isActive ?? true,
      isAvailableToday: product.isAvailableToday ?? true,
      sortOrder: product.sortOrder ?? 0,
      qualityOptionsText: product.qualityOptions.map((option) => option.label).join("\n")
    });
  }

  function resetForm() {
    setPhoto(null);
    setSelectedProductId("");
    setForm({
      ...emptyProduct,
      categoryId: categories[0]?.id ?? ""
    });
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (form.isActive && !form.image && !photo) {
      setNotice("Добавьте фотографию товара или выключите товар, чтобы сохранить черновик.");
      return;
    }
    setPending(true);
    setNotice("");

    const payload = {
      ...form,
      qualityOptions: form.qualityOptionsText
        .split("\n")
        .map((label, index) => ({ label: label.trim(), sortOrder: index * 10 }))
        .filter((option) => option.label.length > 0)
    };

    try {
      if (photo) {
        payload.image = await uploadProductImage(photo);
        setForm(current => ({ ...current, image: payload.image }));
        setPhoto(null);
      }
      if (selectedProductId) {
        await updateAdminProduct(selectedProductId, payload);
        setNotice("Товар обновлен.");
      } else {
        await createAdminProduct(payload);
        setNotice("Товар создан.");
      }

      await load();
      resetForm();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Не удалось сохранить товар. Проверьте поля формы.");
    } finally {
      setPending(false);
    }
  }

  async function saveCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setNotice("");
    try {
      await createAdminCategory(categoryForm);
      setCategoryForm({ name: "", slug: "", sortOrder: 0 });
      await load();
      setNotice("Категория создана.");
    } catch {
      setNotice("Не удалось создать категорию. Проверьте название и уникальность адреса.");
    } finally {
      setPending(false);
    }
  }

  async function toggleProduct(product: Product, field: "isActive" | "isAvailableToday") {
    setPending(true);
    try {
      await updateAdminProduct(product.id, { [field]: !(product[field] ?? true) });
      await load();
      setNotice("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Не удалось изменить товар.");
    } finally { setPending(false); }
  }

  return (
    <div className="admin-layout">
      <section className="admin-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Категории</p>
            <h2>Список категорий</h2>
          </div>
        </div>
        <div className="admin-list">
          {categories.map((category) => (
            <div className="admin-row" key={category.id}>
              <span>{category.name}</span>
              <small>{category.slug}</small>
              <strong>{category.isActive ? "Включена" : "Выключена"}</strong>
            </div>
          ))}
        </div>
        <form className="admin-form" onSubmit={saveCategory}>
          <h3>Новая категория</h3>
          <div className="form-grid">
            <label>Название<input required value={categoryForm.name} onChange={(event) => setCategoryForm({ ...categoryForm, name: event.target.value })} /></label>
            <label>Адрес в каталоге<input required value={categoryForm.slug} onChange={(event) => setCategoryForm({ ...categoryForm, slug: event.target.value })} /></label>
            <label>Порядок<input required type="number" value={categoryForm.sortOrder} onChange={(event) => setCategoryForm({ ...categoryForm, sortOrder: Number(event.target.value) })} /></label>
          </div>
          <button className="secondary-link" disabled={pending} type="submit">Создать категорию</button>
        </form>
      </section>

      <section className="admin-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Товары</p>
            <h2>Управление каталогом</h2>
          </div>
          <button onClick={resetForm} disabled={pending} type="button">
            Новый товар
          </button>
        </div>
        {notice ? <p className="notice">{notice}</p> : null}
        <div className="admin-list">
          {products.map((product) => (
            <div className="admin-product-row" key={product.id}>
              <button onClick={() => selectProduct(product)} disabled={pending} type="button">
                <div className="admin-product-photo"><ProductImage src={product.image} name={product.name} /></div>
                <span>{product.name}</span>
                <small>
                  {priceLabel(product.sellingPrice, product.unit)}
                </small>
              </button>
              <button onClick={() => void toggleProduct(product, "isAvailableToday")} disabled={pending} type="button">
                {product.isAvailableToday ? "Сегодня: да" : "Сегодня: нет"}
              </button>
              <button onClick={() => void toggleProduct(product, "isActive")} disabled={pending} type="button">
                {product.isActive ? "Включен" : "Выключен"}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="admin-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{selectedProduct ? "Редактирование" : "Создание"}</p>
            <h2>{selectedProduct ? selectedProduct.name : "Новый товар"}</h2>
          </div>
        </div>
        <form className="admin-form" onSubmit={saveProduct}>
          <fieldset className="product-form-fields" disabled={pending}>
          <label>
            Категория
            <select
              value={form.categoryId}
              onChange={(event) => setForm({ ...form, categoryId: event.target.value })}
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Название
            <input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </label>
          <label>
            Адрес в каталоге
            <input
              value={form.slug}
              onChange={(event) => setForm({ ...form, slug: event.target.value })}
            />
          </label>
          <label>
            Описание
            <textarea
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </label>
          <ProductPhotoField key={selectedProductId || "new"} image={form.image} file={photo} disabled={pending}
            onChange={(file, image) => { setPhoto(file); setForm({ ...form, image }); setNotice(""); }} />
          <div className="form-grid">
            <label>
              Единица
              <select
                value={form.unit}
                onChange={(event) => setForm({ ...form, unit: event.target.value })}
              >{["kg", "g", "piece", "pack", "bunch"].map(unit => <option key={unit} value={unit}>{unitLabel(unit)}</option>)}</select>
            </label>
            <label>
              Цена для клиента
              <input
                inputMode="decimal"
                value={form.sellingPrice}
                onChange={(event) => setForm({ ...form, sellingPrice: event.target.value.replace(",", ".") })}
              />
            </label>
            <label>
              Ориентир закупки
              <input
                inputMode="decimal"
                value={form.purchasePrice}
                onChange={(event) => setForm({ ...form, purchasePrice: event.target.value.replace(",", ".") })}
              />
            </label>
            <label>
              Минимальное количество
              <input
                inputMode="decimal"
                value={form.minQuantity}
                onChange={(event) => setForm({ ...form, minQuantity: event.target.value.replace(",", ".") })}
              />
            </label>
            <label>
              Шаг количества
              <input
                inputMode="decimal"
                value={form.quantityStep}
                onChange={(event) => setForm({ ...form, quantityStep: event.target.value.replace(",", ".") })}
              />
            </label>
            <label>
              Порядок
              <input
                type="number"
                value={form.sortOrder}
                onChange={(event) => setForm({ ...form, sortOrder: Number(event.target.value) })}
              />
            </label>
          </div>
          <label>
            Предпочтения по качеству, по одному на строку
            <textarea
              value={form.qualityOptionsText}
              onChange={(event) => setForm({ ...form, qualityOptionsText: event.target.value })}
            />
          </label>
          <div className="checkbox-row">
            <label>
              <input
                checked={form.isWeighted}
                type="checkbox"
                onChange={(event) => setForm({ ...form, isWeighted: event.target.checked })}
              />
              Весовой товар
            </label>
            <label>
              <input
                checked={form.isActive}
                type="checkbox"
                onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
              />
              Включен
            </label>
            <label>
              <input
                checked={form.isAvailableToday}
                type="checkbox"
                onChange={(event) =>
                  setForm({ ...form, isAvailableToday: event.target.checked })
                }
              />
              Доступен сегодня
            </label>
          </div>
          <button className="primary-action" disabled={pending} type="submit">
            {pending ? "Сохраняем..." : "Сохранить"}
          </button>
          {notice ? <p className="notice" role="status">{notice}</p> : null}
          </fieldset>
        </form>
      </section>
    </div>
  );
}
