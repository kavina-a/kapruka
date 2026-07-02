import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "static2.kapruka.com" },
      { protocol: "https", hostname: "static.kapruka.com" },
      { protocol: "https", hostname: "www.kapruka.com" },
      { protocol: "https", hostname: "partnercentral.kapruka.com" },
    ],
  },
  // The MCP SDK is server-only; keep it out of the client bundle.
  serverExternalPackages: ["@modelcontextprotocol/sdk"],
};

export default nextConfig;
