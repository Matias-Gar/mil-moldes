import { useEffect } from "react";

export default function QZTrayLoader() {
  useEffect(() => {
    if (typeof window !== "undefined" && !window.qz) {
      const script = document.createElement("script");
      script.src = "/qz-tray.js";
      script.async = true;
      script.onload = () => {
        setTimeout(() => {
          if (window.qz) {
            // console.log("✅ QZ Tray script loaded, window.qz disponible");
          } else {
            // console.error("❌ QZ Tray script loaded pero window.qz sigue undefined");
          }
        }, 500);
      };
      script.onerror = () => {
        // console.error("❌ Error cargando el script de QZ Tray");
      };
      document.body.appendChild(script);
    } else if (window.qz) {
      // console.log("✅ QZ Tray ya estaba disponible en window.qz");
    }
  }, []);
  return null;
}
