import type { NextConfig } from 'next';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';

const nextConfig: NextConfig = {
  turbopack: { root: process.cwd() },
  devIndicators: false,
  // Proxy all /api/* requests to the existing backend server
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${BACKEND_URL}/api/:path*` },
      { source: '/qr.svg', destination: `${BACKEND_URL}/qr.svg` },
    ];
  },
};

export default nextConfig;
