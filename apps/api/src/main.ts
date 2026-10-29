import "reflect-metadata";

import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";
import { loadConfig } from "./config/env";
import { configureLocalProxy } from "./config/local-proxy";

async function bootstrap() {
  const config = loadConfig();

  process.env.DATABASE_URL ??= config.databaseUrl;

  const app = await NestFactory.create(AppModule);
  configureLocalProxy(app);

  app.setGlobalPrefix("api/v1");
  app.enableCors({
    origin: config.webOrigin,
    credentials: true
  });

  await app.listen(config.port, config.host);
}

void bootstrap();
