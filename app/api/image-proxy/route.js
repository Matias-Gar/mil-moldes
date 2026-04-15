import { NextResponse } from "next/server";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const url = searchParams.get("url");
    if (!url || !(url.startsWith("http://") || url.startsWith("https://"))) {
      return NextResponse.json({ error: "invalid url" }, { status: 400 });
    }

    const res = await fetch(url);
    if (!res.ok) return NextResponse.json({ error: "fetch failed", status: res.status }, { status: 502 });

    const buffer = await res.arrayBuffer();
    const b64 = Buffer.from(buffer).toString("base64");
    const contentType = res.headers.get("content-type") || "image/jpeg";
    const dataUrl = `data:${contentType};base64,${b64}`;
    return NextResponse.json({ dataUrl });
  } catch (err) {
    return NextResponse.json({ error: "exception", message: String(err) }, { status: 500 });
  }
}
