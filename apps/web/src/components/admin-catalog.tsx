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
  updateAdminCategory,
  uploadProductImage,
  ProductPhoto
} from "@/lib/api";
import { priceLabel, unitLabel } from "@/lib/format";
import { ProductGalleryField } from "./product-gallery-field";
import { productPhotos } from "@/lib/product-gallery";
import { ProductImage } from "./product-image";
import { CatalogDialog } from "./catalog-dialog";
import { ProductPhotoField } from "./product-photo-field";
import { categoryDescendantIds } from "@dushanbe-fresh/shared";

const emptyCategory = { name: "", nameTj: "", slug: "", sortOrder: 0, imageUrl: "", iconUrl: "", parentId: "", isVisible: true };

const emptyProduct = {
  categoryId: "",
  name: "",
  nameTj: "",
  slug: "",
  description: "",
  descriptionTj: "",
  image: "",
  unit: "kg",
  sellingPrice: "0.00",
  purchasePrice: "0.00",
  isWeighted: true,
  minQuantity: "0.500",
  quantityStep: "0.500",
  isActive: true,
  isAvailableToday: true,
  sortOrder: 0
};

export function AdminCatalog() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [form, setForm] = useState(emptyProduct);
  const [categoryForm, setCategoryForm] = useState(emptyCategory);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [categoryFile, setCategoryFile] = useState<File | null>(null);
  const [categoryIconFile, setCategoryIconFile] = useState<File | null>(null);
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const [photos, setPhotos] = useState<ProductPhoto[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
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
    setPhotos(productPhotos(product));
    setNotice("");
    setSelectedProductId(product.id);
    setForm({
      categoryId: product.category.id,
      name: product.name,
      nameTj: product.nameTj ?? "",
      slug: product.slug,
      description: product.description ?? "",
      descriptionTj: product.descriptionTj ?? "",
      image: product.image ?? "",
      unit: product.unit,
      sellingPrice: product.sellingPrice,
      purchasePrice: product.purchasePrice ?? "0.00",
      isWeighted: product.isWeighted,
      minQuantity: product.minQuantity,
      quantityStep: product.quantityStep,
      isActive: product.isActive ?? true,
      isAvailableToday: product.isAvailableToday ?? true,
      sortOrder: product.sortOrder ?? 0
    });
  }

  function resetForm() {
    setPhotos([]);
    setSelectedProductId("");
    setForm({
      ...emptyProduct,
      categoryId: categories[0]?.id ?? ""
    });
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setNotice("");

    const payload = {
      ...form,
      images: photos
    };

    try {
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
      const [imageUrl, iconUrl] = await Promise.all([
        categoryFile ? uploadProductImage(categoryFile, "category") : categoryForm.imageUrl,
        categoryIconFile ? uploadProductImage(categoryIconFile, "category-icon") : categoryForm.iconUrl
      ]);
      const payload = { ...categoryForm, imageUrl: imageUrl || null, iconUrl: iconUrl || null,
        parentId: categoryForm.parentId || null, nameTj: categoryForm.nameTj || null };
      if (selectedCategoryId) await updateAdminCategory(selectedCategoryId, payload);
      else await createAdminCategory(payload);
      setCategoryForm(emptyCategory); setCategoryFile(null); setCategoryIconFile(null);
      await load();
      setNotice(selectedCategoryId ? "Категория обновлена." : "Категория создана.");
      setPanel(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Не удалось сохранить категорию. Проверьте поля формы.");
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
            onClick={() => { setSelectedCategoryId(""); setCategoryForm(emptyCategory); setCategoryFile(null); setCategoryIconFile(null); setNotice(""); setPanel("category"); }}><Plus size={18} aria-hidden="true" />Категория</button>
          <button className="primary-action" type="button" disabled={pending || loading}
            onClick={() => { resetForm(); setNotice(""); setPanel("product"); }}><Plus size={18} aria-hidden="true" />Новый товар</button>
        </div>
      </div>
      <div className="category-tabs catalog-admin__categories" aria-label="Категории товаров">
        <button type="button" className={!categoryFilter ? "is-active" : ""} aria-pressed={!categoryFilter} onClick={() => setCategoryFilter("")}>Все</button>
        {categories.map(category => <button key={category.id} type="button" aria-pressed={categoryFilter === category.id}
          className={categoryFilter === category.id ? "is-active" : ""} onClick={() => setCategoryFilter(category.id)}>
          {category.name}{category.isActive === false ? " (выключена)" : category.isVisible === false ? " (скрыта)" : ""}
        </button>)}
      </div>
      {categoryFilter ? <div className="catalog-admin__category-actions">
        <button className="secondary-link" type="button" disabled={pending} onClick={() => {
          const category = categories.find(item => item.id === categoryFilter);
          if (!category) return;
          setSelectedCategoryId(category.id); setCategoryFile(null); setCategoryIconFile(null); setNotice("");
          setCategoryForm({ name: category.name, nameTj: category.nameTj || "", slug: category.slug, sortOrder: category.sortOrder,
            imageUrl: category.imageUrl || "", iconUrl: category.iconUrl || "", parentId: category.parentId || "", isVisible: category.isVisible ?? true });
          setPanel("category");
        }}><Pencil size={18} aria-hidden="true" />Редактировать категорию</button>
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
      {panel === "category" ? <CatalogDialog title={selectedCategoryId ? "Редактирование категории" : "Новая категория"} busy={pending} onClose={() => { setPanel(null); setCategoryFile(null); setCategoryIconFile(null); }}>
        <form className="admin-form" onSubmit={saveCategory}>
          <fieldset className="product-form-fields" disabled={pending}>
          <div className="form-grid">
            <label>Название<input required value={categoryForm.name} onChange={(event) => setCategoryForm({ ...categoryForm, name: event.target.value })} /></label>
            <label>Название на таджикском<input value={categoryForm.nameTj} onChange={event => setCategoryForm({ ...categoryForm, nameTj: event.target.value })} /></label>
            <label>Адрес в каталоге<input required value={categoryForm.slug} onChange={(event) => setCategoryForm({ ...categoryForm, slug: event.target.value })} /></label>
            <label>Порядок<input required type="number" value={categoryForm.sortOrder} onChange={(event) => setCategoryForm({ ...categoryForm, sortOrder: Number(event.target.value) })} /></label>
            <label>Родительская категория<select value={categoryForm.parentId} onChange={event => setCategoryForm({ ...categoryForm, parentId: event.target.value })}>
              <option value="">Без родителя</option>
              {categories.filter(category => !selectedCategoryId || !categoryDescendantIds(categories, selectedCategoryId).includes(category.id))
                .map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select></label>
          </div>
          <div className="category-media-fields"><ProductPhotoField label="Фото категории" image={categoryForm.imageUrl} file={categoryFile} disabled={pending}
            onChange={(file, imageUrl) => { setCategoryFile(file); setCategoryForm(current => ({ ...current, imageUrl })); }} />
          <ProductPhotoField label="Иконка категории" removeLabel="Убрать иконку" image={categoryForm.iconUrl} file={categoryIconFile} disabled={pending}
            onChange={(file, iconUrl) => { setCategoryIconFile(file); setCategoryForm(current => ({ ...current, iconUrl })); }} /></div>
          <small>Без загруженного фото используется стандартное изображение категории, если оно предусмотрено.</small>
          <small>Иконка независима от фото. Желательно квадратное изображение с прозрачным фоном; отображается размером 36 пикселей.</small>
          <label className="checkbox-field"><input type="checkbox" checked={categoryForm.isVisible}
            onChange={event => setCategoryForm({ ...categoryForm, isVisible: event.target.checked })} />Показывать на сайте</label>
          <small>Скрывает категорию и её подразделы из меню и карточек. Товары и их доступность не изменяются.</small>
          <button className="secondary-link" disabled={pending} type="submit">{selectedCategoryId ? "Сохранить категорию" : "Создать категорию"}</button>
          {notice ? <p className="notice" role="status">{notice}</p> : null}
          </fieldset>
        </form>
      </CatalogDialog> : null}
      {panel === "product" ? <CatalogDialog title={selectedProduct ? selectedProduct.name : "Новый товар"} busy={pending || uploadingPhotos}
        onClose={() => { setPanel(null); setPhotos([]); }}>
        <form className="admin-form" onSubmit={saveProduct}>
          <fieldset className="product-form-fields" disabled={pending || uploadingPhotos}>
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
            Название на таджикском
            <input value={form.nameTj} onChange={event => setForm({ ...form, nameTj: event.target.value })} />
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
          <label>Описание на таджикском
            <textarea value={form.descriptionTj} onChange={event => setForm({ ...form, descriptionTj: event.target.value })} />
          </label>
          </section>
          <section className="catalog-form-section"><h3>Фото</h3>
          <ProductGalleryField key={selectedProductId || "new"} images={photos} disabled={pending}
            onChange={setPhotos} onUploading={setUploadingPhotos} />
          </section>
          <section className="catalog-form-section"><h3>Цена и количество</h3>
          {selectedProduct?.lastPriceChange ? <small className="catalog-price-history">
            Последнее изменение: {priceLabel(selectedProduct.lastPriceChange.oldPrice, form.unit)} → {priceLabel(selectedProduct.lastPriceChange.newPrice, form.unit)}
            {selectedProduct.priceDrop ? ` · Стало дешевле на ${selectedProduct.priceDrop.discountPercent}%` : ""}
          </small> : null}
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
          <button className="primary-action" disabled={pending || uploadingPhotos} type="submit">
            {pending ? "Сохраняем..." : "Сохранить"}
          </button>
          <button className="secondary-link" disabled={pending || uploadingPhotos} type="button" onClick={() => { setPanel(null); setPhotos([]); }}>Отмена</button>
          </div>
          {notice ? <p className="notice" role="status">{notice}</p> : null}
          </fieldset>
        </form>
      </CatalogDialog> : null}
    </div>
  );
}
