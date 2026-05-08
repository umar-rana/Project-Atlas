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

// Content-Security-Policy directives. Uses 'unsafe-inline' for script/style
// because Next.js App Router injects inline hydration scripts and runtime style
// tags; tightening to nonces requires a middleware-based nonce pipeline.
// 'unsafe-eval' is added in development only (Next.js dev runtime / React
// Refresh require it).
const CSP_DIRECTIVES = {
  "default-src": ["'self'"],
  "script-src": [
    "'self'",
    "'unsafe-inline'",
    ...(isProd ? [] : ["'unsafe-eval'"]),
    "https://*.clerk.accounts.dev",
    "https://*.clerk.com",
    "https://challenges.cloudflare.com",
  ],
  "style-src": ["'self'", "'unsafe-inline'"],
  "img-src": ["'self'", "data:", "blob:", "https:"],
  "font-src": ["'self'", "data:"],
  "connect-src": [
    "'self'",
    "https://*.clerk.accounts.dev",
    "https://*.clerk.com",
    "https://clerk-telemetry.com",
    "https://api.anthropic.com",
    "https://*.r2.cloudflarestorage.com",
    "https://accounts.google.com",
    "https://oauth2.googleapis.com",
    "https://www.googleapis.com",
    "https://api.resend.com",
    ...(isProd ? [] : ["ws:", "wss:"]),
  ],
  "frame-src": [
    "'self'",
    "https://challenges.cloudflare.com",
    "https://*.clerk.com",
    "https://*.clerk.accounts.dev",
  ],
  "worker-src": ["'self'", "blob:"],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"],
  "frame-ancestors": ["'self'"],
  ...(isProd ? { "upgrade-insecure-requests": [] } : {}),
};

const CSP_VALUE = Object.entries(CSP_DIRECTIVES)
  .map(([directive, sources]) =>
    sources.length === 0 ? directive : `${directive} ${sources.join(" ")}`,
  )
  .join("; ");

const PERMISSIONS_POLICY = [
  "accelerometer=()",
  "autoplay=()",
  "camera=()",
  "display-capture=()",
  "encrypted-media=()",
  "fullscreen=(self)",
  "geolocation=()",
  "gyroscope=()",
  "magnetometer=()",
  "microphone=()",
  "midi=()",
  "payment=()",
  "picture-in-picture=()",
  "publickey-credentials-get=()",
  "screen-wake-lock=()",
  "sync-xhr=()",
  "usb=()",
  "xr-spatial-tracking=()",
].join(", ");

const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Content-Security-Policy", value: CSP_VALUE },
  { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
  ...(isProd
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains; preload",
        },
      ]
    : []),
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
