export type AppConfig = {
  databaseUrl: string;
  port: number;
  webOrigin: string;
};

export function loadConfig(): AppConfig {
  return {
    databaseUrl:
      process.env.DATABASE_URL ??
      "postgresql://dushanbe_fresh:dushanbe_fresh@localhost:5432/dushanbe_fresh?schema=public",
    port: Number(process.env.API_PORT ?? 4000),
    webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:3000"
  };
}
