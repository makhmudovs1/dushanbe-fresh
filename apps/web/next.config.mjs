/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@dushanbe-fresh/shared"],
  async rewrites() {
    const apiUrl = process.env.API_URL ?? `http://localhost:${process.env.API_PORT ?? 4000}/api/v1`;
    return [{ source: "/api/v1/:path*", destination: `${apiUrl.replace(/\/$/, "")}/:path*` }];
  }
};

export default nextConfig;
