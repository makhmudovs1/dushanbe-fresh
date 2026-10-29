import type { INestApplication } from "@nestjs/common";

export function localProxyReady(env: Record<string, string | undefined> = process.env) {
  return env.CUSTOMER_TRUST_LOCAL_PROXY === "true" && ["127.0.0.1", "::1"].includes(env.API_HOST ?? "127.0.0.1");
}

export function configureLocalProxy(app: INestApplication, env: Record<string, string | undefined> = process.env) {
  if (env.CUSTOMER_TRUST_LOCAL_PROXY !== "true") return;
  if (!localProxyReady(env)) throw new Error("Trusted local proxy requires a loopback API bind");
  const server: { set(name: string, value: string[]): void } = app.getHttpAdapter().getInstance();
  // Opt-in only after Web is loopback-bound too; never trust arbitrary forwarded headers.
  server.set("trust proxy", ["127.0.0.1/32", "::1/128"]);
}
