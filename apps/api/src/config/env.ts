export type AppConfig = {
  databaseUrl: string;
  port: number;
  host: string;
  webOrigin: string;
};

export function loadConfig(): AppConfig {
  return {
    databaseUrl:
      process.env.DATABASE_URL ??
      "postgresql://dushanbe_fresh:dushanbe_fresh@localhost:5432/dushanbe_fresh?schema=public",
    port: Number(process.env.API_PORT ?? 4000),
    host: process.env.API_HOST ?? "127.0.0.1",
    webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:3000"
  };
}
