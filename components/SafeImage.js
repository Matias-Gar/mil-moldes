"use client";
import { useEffect, useRef, useState } from "react";
let NextImage = null;
if (typeof window !== "undefined") {
  // Importar next/image solo en el cliente
  NextImage = require("next/image").default;
}
export default function SafeImage(props) {
  const [isClient, setIsClient] = useState(false);
  useEffect(() => { setIsClient(true); }, []);
  if (!isClient || !NextImage) return <div style={{width:props.width, height:props.height, background:'#eee', borderRadius:'50%'}} />;
  return <NextImage {...props} />;
}