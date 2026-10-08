"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";

import {
  Category,
  createAdminCategory,
  createAdminProduct,
  deleteAdminCategory,
  deleteAdminProduct,
  getAdminCategories,
  getAdminProducts,
  Product,
  updateAdminProduct,
  uploadProductImage
} from "@/lib/api";
import { priceLabel, unitLabel } from "@/lib/format";
import { ProductPhotoField } from "./product-photo-field";
import { ProductImage } from "./product-image";
import { CatalogDialog } from "./catalog-dialog";

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
  const [panel, setPanel] = useState<"product" | "category" | null>(null);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<{ kind: "product" | "category"; id: string; name: string } | null>(null);

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
        categoryId: nextCategories.some(category => category.id === current.categoryId) ? current.categoryId : nextCategories[0]?.id || ""
      }));
    } catch {
      setNotice("Не удалось загрузить каталог. Повторите попытку.");
    } finally { setLoading(false); }
  }

  function selectProduct(product: Product) {
    setPanel("product");
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
      setPanel(null);
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
      setPanel(null);
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

  async function confirmDelete() {
    if (!deleting || pending) return;
    setPending(true);
    setNotice("");
    try {
      if (deleting.kind === "product") await deleteAdminProduct(deleting.id);
      else {
        await deleteAdminCategory(deleting.id);
        if (categoryFilter === deleting.id) setCategoryFilter("");
      }
      await load();
      setNotice(deleting.kind === "product" ? "Товар удалён из каталога." : "Категория удалена.");
      setDeleting(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Не удалось удалить. Попробуйте ещё раз.");
    } finally { setPending(false); }
  }

  return (
    <div className="catalog-admin">
      <div className="catalog-admin__toolbar">
        <h2>Товары <small>{products.length}</small></h2>
        <div className="catalog-admin__actions">
          <button className="secondary-link" type="button" disabled={pending}
            onClick={() => { setNotice(""); setPanel("category"); }}><Plus size={18} aria-hidden="true" />Категория</button>
          <button className="primary-action" type="button" disabled={pending || loading}
            onClick={() => { resetForm(); setNotice(""); setPanel("product"); }}><Plus size={18} aria-hidden="true" />Новый товар</button>
        </div>
      </div>
      <div className="category-tabs catalog-admin__categories" aria-label="Категории товаров">
        <button type="button" className={!categoryFilter ? "is-active" : ""} aria-pressed={!categoryFilter} onClick={() => setCategoryFilter("")}>Все</button>
        {categories.map(category => <button key={category.id} type="button" aria-pressed={categoryFilter === category.id}
          className={categoryFilter === category.id ? "is-active" : ""} onClick={() => setCategoryFilter(category.id)}>
          {category.name}{category.isActive === false ? " (выключена)" : ""}
        </button>)}
      </div>
      {categoryFilter ? <div className="catalog-admin__category-actions">
        <button type="button" className="catalog-delete-category" disabled={pending}
          onClick={() => {
            const category = categories.find(category => category.id === categoryFilter);
            if (category) { setNotice(""); setDeleting({ kind: "category", id: category.id, name: category.name }); }
          }}><Trash2 size={18} aria-hidden="true" />Удалить категорию</button>
      </div> : null}
      {notice && !panel && !deleting ? <p className="notice" role="status">{notice}</p> : null}
      {loading ? <p role="status">Загружаем каталог...</p> : <>
        <div className="catalog-admin__columns" aria-hidden="true"><span>Товар</span><span>Цена для клиента</span><span>Сегодня</span><span>Включён</span><span /></div>
        <div className="catalog-admin__products" role="list" aria-label="Товары">
          {products.filter(product => !categoryFilter || product.category.id === categoryFilter).map(product =>
            <div className="catalog-admin__row" role="listitem" key={product.id}>
              <div className="catalog-admin__identity">
                <div className="admin-product-photo"><ProductImage src={product.image} name={product.name} /></div>
                <div><strong>{product.name}</strong><small>{product.category.name}</small></div>
              </div>
              <span className="catalog-admin__price">{priceLabel(product.sellingPrice, product.unit)}</span>
              <label className="catalog-admin__toggle"><input type="checkbox" checked={product.isAvailableToday ?? true} disabled={pending}
                aria-label={`Доступен сегодня: ${product.name}`} onChange={() => void toggleProduct(product, "isAvailableToday")} /><span>Сегодня</span></label>
              <label className="catalog-admin__toggle"><input type="checkbox" checked={product.isActive ?? true} disabled={pending}
                aria-label={`Включён: ${product.name}`} onChange={() => void toggleProduct(product, "isActive")} /><span>Включён</span></label>
              <div className="catalog-admin__row-actions"><button className="catalog-icon-action" type="button" disabled={pending} title="Редактировать товар"
                aria-label={`Редактировать: ${product.name}`} onClick={() => selectProduct(product)}><Pencil size={18} aria-hidden="true" /></button>
              <button className="catalog-icon-action catalog-delete-icon" type="button" disabled={pending} title="Удалить товар"
                aria-label={`Удалить товар: ${product.name}`} onClick={() => { setNotice(""); setDeleting({ kind: "product", id: product.id, name: product.name }); }}><Trash2 size={18} aria-hidden="true" /></button></div>
            </div>)}
        </div>
        {!products.some(product => !categoryFilter || product.category.id === categoryFilter) ? <p className="catalog-admin__empty">Товаров пока нет.</p> : null}
      </>}
      {deleting ? <CatalogDialog title={deleting.kind === "product" ? "Удалить товар?" : "Удалить категорию?"} busy={pending}
        onClose={() => { setDeleting(null); setNotice(""); }}>
        <p><strong>{deleting.name}</strong></p>
        <p>{deleting.kind === "product" ? "Товар исчезнет из каталога и списка админки. Данные в существующих заказах сохранятся." :
          "Категория исчезнет из каталога и списка админки. Сначала перенесите или удалите все её товары, включая выключенные."}</p>
        {notice ? <p className="notice" role="alert">{notice}</p> : null}
        <div className="catalog-form-actions">
          <button type="button" className="secondary-link" disabled={pending} onClick={() => { setDeleting(null); setNotice(""); }}>Отмена</button>
          <button type="button" className="catalog-danger-action" disabled={pending} onClick={() => void confirmDelete()}>{pending ? "Удаляем..." : "Удалить"}</button>
        </div>
      </CatalogDialog> : null}
      {panel === "category" ? <CatalogDialog title="Новая категория" busy={pending} onClose={() => setPanel(null)}>
        <form className="admin-form" onSubmit={saveCategory}>
          <fieldset className="product-form-fields" disabled={pending}>
          <div className="form-grid">
            <label>Название<input required value={categoryForm.name} onChange={(event) => setCategoryForm({ ...categoryForm, name: event.target.value })} /></label>
            <label>Адрес в каталоге<input required value={categoryForm.slug} onChange={(event) => setCategoryForm({ ...categoryForm, slug: event.target.value })} /></label>
            <label>Порядок<input required type="number" value={categoryForm.sortOrder} onChange={(event) => setCategoryForm({ ...categoryForm, sortOrder: Number(event.target.value) })} /></label>
          </div>
          <button className="secondary-link" disabled={pending} type="submit">Создать категорию</button>
          {notice ? <p className="notice" role="status">{notice}</p> : null}
          </fieldset>
        </form>
      </CatalogDialog> : null}
      {panel === "product" ? <CatalogDialog title={selectedProduct ? selectedProduct.name : "Новый товар"} busy={pending}
        onClose={() => { setPanel(null); setPhoto(null); }}>
        <form className="admin-form" onSubmit={saveProduct}>
          <fieldset className="product-form-fields" disabled={pending}>
          <section className="catalog-form-section"><h3>Основное</h3>
          <div className="form-grid">
          <label>
            Категория
            <select
              required
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
              required
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </label>
          <label>
            Адрес в каталоге
            <input
              required
              value={form.slug}
              onChange={(event) => setForm({ ...form, slug: event.target.value })}
            />
          </label>
          </div>
          <label>
            Описание
            <textarea
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </label>
          </section>
          <section className="catalog-form-section"><h3>Фото</h3>
          <ProductPhotoField key={selectedProductId || "new"} image={form.image} file={photo} disabled={pending}
            onChange={(file, image) => { setPhoto(file); setForm({ ...form, image }); setNotice(""); }} />
          </section>
          <section className="catalog-form-section"><h3>Цена и количество</h3>
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
          </section>
          <section className="catalog-form-section"><h3>Качество</h3>
          <label>
            Предпочтения по качеству, по одному на строку
            <textarea
              value={form.qualityOptionsText}
              onChange={(event) => setForm({ ...form, qualityOptionsText: event.target.value })}
            />
          </label>
          </section>
          <section className="catalog-form-section"><h3>Доступность</h3>
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
          </section>
          <div className="catalog-form-actions">
          <button className="primary-action" disabled={pending} type="submit">
            {pending ? "Сохраняем..." : "Сохранить"}
          </button>
          <button className="secondary-link" disabled={pending} type="button" onClick={() => { setPanel(null); setPhoto(null); }}>Отмена</button>
          </div>
          {notice ? <p className="notice" role="status">{notice}</p> : null}
          </fieldset>
        </form>
      </CatalogDialog> : null}
    </div>
  );
}
