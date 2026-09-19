import { Controller, Get, Inject, Param, Query } from "@nestjs/common";

import { CatalogService } from "./catalog.service";

@Controller()
export class CatalogController {
  constructor(@Inject(CatalogService) private readonly catalogService: CatalogService) {}

  @Get("categories")
  listCategories() {
    return this.catalogService.listPublicCategories();
  }

  @Get("products")
  listProducts(@Query("category") category?: string, @Query("search") search?: string) {
    return this.catalogService.listPublicProducts({ category, search });
  }

  @Get("products/:slug")
  getProduct(@Param("slug") slug: string) {
    return this.catalogService.getPublicProductBySlug(slug);
  }
}
