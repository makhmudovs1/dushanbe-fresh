import { Injectable, NotFoundException } from "@nestjs/common";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

export abstract class ImageStorage {
  abstract put(key: string, content: Buffer): Promise<void>;
  abstract get(key: string): Promise<Buffer>;
}

@Injectable()
export class LocalImageStorage extends ImageStorage {
  private readonly directory: string;
  constructor() {
    super();
    const configured = process.env.PRODUCT_IMAGES_DIR;
    if (process.env.NODE_ENV === "production" && (!configured || !isAbsolute(configured))) {
      throw new Error("PRODUCT_IMAGES_DIR must be an absolute persistent volume path in production");
    }
    this.directory = resolve(configured ?? "var/product-images");
  }
  async put(key: string, content: Buffer) {
    await mkdir(this.directory, { recursive: true });
    await writeFile(resolve(this.directory, key), content, { flag: "wx" });
  }
  async get(key: string) {
    try { return await readFile(resolve(this.directory, key)); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new NotFoundException("Фотография не найдена.");
      throw error;
    }
  }
}
