import { fileURLToPath } from "node:url";

/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  ...(process.env.NEXT_OUTPUT_STANDALONE === "true" ? {
    output: "standalone",
    outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url))
  } : {}),
  transpilePackages: ["@dushanbe-fresh/shared"],
  async headers() {
    return ["/order/:path*", "/orders/:path*", "/admin/:path*", "/account/:path*", "/cart", "/checkout", "/api/:path*"].map(source => ({ source, headers: [
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
      ...(["/order/:path*", "/orders/:path*"].includes(source) ? [{ key: "Referrer-Policy", value: "no-referrer" }] : [])
    ] }));
  },
  async rewrites() {
    const apiUrl = process.env.API_URL ?? `http://localhost:${process.env.API_PORT ?? 4000}/api/v1`;
    return [{ source: "/api/v1/:path*", destination: `${apiUrl.replace(/\/$/, "")}/:path*` }];
  }
};

export default nextConfig;
