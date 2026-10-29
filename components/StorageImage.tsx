"use client";

import NextImage, { type ImageProps } from "next/image";
import { isSelfHostedStorageImage, resolveStorageImageUrl } from "../lib/storageUrls.js";

// Self-hosted Storage serves originals directly. This also avoids Vercel's
// optimizer rejecting migrated URLs; local and other images keep Next defaults.
export default function StorageImage({ src, unoptimized, ...props }: ImageProps) {
  const resolved = typeof src === "string" ? resolveStorageImageUrl(src) : src;
  const direct = typeof resolved === "string" && isSelfHostedStorageImage(resolved);
  return <NextImage {...props} src={resolved} unoptimized={direct || unoptimized} />;
}
