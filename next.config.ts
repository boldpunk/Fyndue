import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Yandex Metrika (components/analytics/yandex-metrika.tsx): tag, beacons,
// Webvisor's socket and workers, and its player that frames the site.
const METRIKA = "https://mc.yandex.ru https://mc.yandex.com https://mc.yandex.uz https://yastatic.net";
const METRIKA_FRAMERS = "https://metrika.yandex.ru https://metrika.yandex.com https://metrika.yandex.uz https://*.webvisor.com";

// Inline scripts are needed by Next.js hydration and next-themes' no-flash
// script; moving to a nonce-based CSP is tracked in docs/roadmap.md (Phase 7).
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} ${METRIKA}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https://lh3.googleusercontent.com ${METRIKA}`,
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws:" : ""} ${METRIKA} wss://mc.yandex.ru wss://mc.yandex.com`,
  `frame-src ${METRIKA}`,
  "worker-src 'self' blob:",
  // Only Metrika's Webvisor player may show the site in a frame.
  `frame-ancestors 'self' ${METRIKA_FRAMERS}`,
  "base-uri 'self'",
  "form-action 'self' https://accounts.google.com",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // Document uploads (≤ 10 MB) go through a Server Action; leave room for multipart overhead.
    serverActions: { bodySizeLimit: "11mb" },
    proxyClientMaxBodySize: "11mb",
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
