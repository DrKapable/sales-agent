import type { NextConfig } from "next";

const commonSecurityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" }
];

const nextConfig: NextConfig = {
  agentRules: false,
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: commonSecurityHeaders },
      { source: "/admin/:path*", headers: [{ key: "X-Frame-Options", value: "DENY" }] },
      { source: "/widget", headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *" }] }
    ];
  }
};

export default nextConfig;
