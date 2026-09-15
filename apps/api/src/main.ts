import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";
import { loadConfig } from "./config/env";

async function bootstrap() {
  const config = loadConfig();
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix("api/v1");
  app.enableCors({
    origin: config.webOrigin,
    credentials: true
  });

  await app.listen(config.port);
}

void bootstrap();
