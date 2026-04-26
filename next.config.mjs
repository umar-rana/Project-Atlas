/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';

const devOrigins = (() => {
  if (isProd) return undefined;
  const origins = new Set(['localhost', '127.0.0.1', '0.0.0.0']);
  if (process.env.REPLIT_DEV_DOMAIN) {
    origins.add(process.env.REPLIT_DEV_DOMAIN);
  }
  origins.add('*.replit.dev');
  origins.add('*.repl.co');
  return Array.from(origins);
})();

const nextConfig = {
  reactStrictMode: true,
  ...(devOrigins ? { allowedDevOrigins: devOrigins } : {}),
  async headers() {
    if (isProd) return [];
    return [
      {
        source: "/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
