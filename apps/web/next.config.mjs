/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@dushanbe-fresh/shared"],
  async headers() {
    return [{ source: "/order/:path*", headers: [
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
      { key: "Referrer-Policy", value: "no-referrer" }
    ] }];
  },
  async rewrites() {
    const apiUrl = process.env.API_URL ?? `http://localhost:${process.env.API_PORT ?? 4000}/api/v1`;
    return [{ source: "/api/v1/:path*", destination: `${apiUrl.replace(/\/$/, "")}/:path*` }];
  }
};

export default nextConfig;
