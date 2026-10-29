import type { NextConfig } from "next";
import { getStorageBaseUrl } from "./lib/storageUrls.js";

const supabaseStorageUrl = new URL(getStorageBaseUrl());

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  images: {
    qualities: [75, 94, 95, 96, 99],
    remotePatterns: [
      ...(supabaseStorageUrl
        ? [
            {
              protocol: supabaseStorageUrl.protocol.replace(':', '') as 'http' | 'https',
              hostname: supabaseStorageUrl.hostname,
              port: supabaseStorageUrl.port,
              pathname: `${supabaseStorageUrl.pathname.replace(/\/$/, '')}/storage/v1/object/public/**`,
            },
          ]
        : []),
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
