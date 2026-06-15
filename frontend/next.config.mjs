/** @type {import('next').NextConfig} */
const BACKEND = process.env.BACKEND_URL ?? "http://localhost:8000";

const nextConfig = {
  reactStrictMode: true,
  // Self-contained server output for a slim production Docker image.
  output: "standalone",
  // Keep type-checking on (valuable), but don't let lint style-rules block builds.
  eslint: { ignoreDuringBuilds: true },
  // Proxy API calls to the FastAPI backend so the user only ever opens
  // localhost:3000 — one URL, no CORS, no second port to think about.
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${BACKEND}/api/:path*` },
      { source: "/health", destination: `${BACKEND}/health` },
    ];
  },
};

export default nextConfig;
