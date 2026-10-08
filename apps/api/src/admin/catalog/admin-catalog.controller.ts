import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query } from "@nestjs/common";

import { CatalogService } from "../../catalog/catalog.service";
import {
  parseCategoryInput,
  parseCategoryUpdateInput,
  parseProductInput,
  parseProductUpdateInput
} from "../../catalog/catalog.validation";

import { Roles } from "../../auth/staff.guard";

@Roles("admin")
@Controller("admin")
export class AdminCatalogController {
  constructor(@Inject(CatalogService) private readonly catalogService: CatalogService) {}

  @Get("categories")
  listCategories() {
    return this.catalogService.listAdminCategories();
  }

  @Post("categories")
  createCategory(@Body() body: Record<string, unknown>) {
    return this.catalogService.createAdminCategory(parseCategoryInput(body));
  }

  @Patch("categories/:id")
  updateCategory(@Param("id") id: string, @Body() body: Record<string, unknown>) {
    return this.catalogService.updateAdminCategory(id, parseCategoryUpdateInput(body));
  }

  @Get("products")
  listProducts(@Query("category") category?: string, @Query("search") search?: string) {
    return this.catalogService.listAdminProducts({ category, search });
  }

  @Delete("categories/:id")
  deleteCategory(@Param("id") id: string) {
    return this.catalogService.deleteAdminCategory(id);
  }

  @Delete("products/:id")
  deleteProduct(@Param("id") id: string) {
    return this.catalogService.deleteAdminProduct(id);
  }

  @Post("products")
  createProduct(@Body() body: Record<string, unknown>) {
    return this.catalogService.createAdminProduct(parseProductInput(body));
  }

  @Patch("products/:id")
  updateProduct(@Param("id") id: string, @Body() body: Record<string, unknown>) {
    return this.catalogService.updateAdminProduct(id, parseProductUpdateInput(body));
  }
}
