import { detectImageContentType } from "../../../lib/imageContentType.js";
import { NextResponse } from "next/server";
import { isSelfHostedStorageImage, resolveStorageImageUrl } from "../../../lib/storageUrls.js";

export async function GET(req) {
  try {
    const raw = new URL(req.url).searchParams.get("url");
    const url = resolveStorageImageUrl(raw);
    if (!url || !isSelfHostedStorageImage(url)) {
      return NextResponse.json({ error: "Only public project Storage images are supported" }, { status: 400 });
    }
    const res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(10000) });
    if (!res.ok) return NextResponse.json({ error: "fetch failed", status: res.status }, { status: 502 });
    let contentType = res.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    if (contentType && !contentType.startsWith("image/") && contentType !== "application/octet-stream") {
      await res.body?.cancel();
      return NextResponse.json({ error: "Storage did not return an image" }, { status: 502 });
    }
    const maxBytes = 10 * 1024 * 1024;
    if (Number(res.headers.get("content-length")) > maxBytes) {
      await res.body?.cancel();
      return NextResponse.json({ error: "Image too large" }, { status: 413 });
    }
    const reader = res.body?.getReader();
    if (!reader) return NextResponse.json({ error: "Empty image response" }, { status: 502 });
    const chunks = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return NextResponse.json({ error: "Image too large" }, { status: 413 });
      }
      chunks.push(Buffer.from(value));
    }
    const buffer = Buffer.concat(chunks);
    if (!contentType?.startsWith("image/")) contentType = detectImageContentType(buffer);
    if (!contentType) return NextResponse.json({ error: "Unrecognized image content" }, { status: 502 });
    const dataUrl = `data:${contentType};base64,${buffer.toString("base64")}`;
    return NextResponse.json({ dataUrl });
  } catch {
    return NextResponse.json({ error: "Storage image unavailable" }, { status: 502 });
  }
}
