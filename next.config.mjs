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

// Baseline security headers applied on all routes.
// Intentionally deferred (separate sprints):
//   - Strict-Transport-Security (HSTS): add after HTTPS deployment is confirmed
//   - Content-Security-Policy script-src: requires nonce-based middleware
//   - Permissions-Policy: not in this baseline
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['uuidv7'],
  serverExternalPackages: ['pino', 'pino-pretty', 'pg-boss', 'pg'],
  devIndicators: false,
  eslint: { ignoreDuringBuilds: true },
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
    const entries = [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];

    if (!isProd) {
      // Prepend security headers; keep existing Cache-Control dev header
      entries.push({
        source: "/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      });
    }

    return entries;
  },
};

export default withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
})(nextConfig);
