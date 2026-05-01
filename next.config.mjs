import withBundleAnalyzer from "@next/bundle-analyzer";

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
  transpilePackages: ['uuidv7'],
  serverExternalPackages: ['pino', 'pino-pretty'],
  devIndicators: false,
  ...(devOrigins ? { allowedDevOrigins: devOrigins } : {}),
  experimental: {
    optimizePackageImports: [
      '@radix-ui/react-alert-dialog',
      '@radix-ui/react-avatar',
      '@radix-ui/react-checkbox',
      '@radix-ui/react-context-menu',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-label',
      '@radix-ui/react-popover',
      '@radix-ui/react-progress',
      '@radix-ui/react-radio-group',
      '@radix-ui/react-scroll-area',
      '@radix-ui/react-select',
      '@radix-ui/react-separator',
      '@radix-ui/react-slot',
      '@radix-ui/react-switch',
      '@radix-ui/react-tooltip',
      'lucide-react',
    ],
  },
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

export default withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
})(nextConfig);
