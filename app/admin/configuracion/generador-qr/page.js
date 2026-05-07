"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Download, ImagePlus, Link as LinkIcon, Palette, QrCode, RotateCcw, Upload, X } from "lucide-react";

const DEFAULTS = {
  text: "https://mil-moldes.com",
  foreground: "#111827",
  background: "#ffffff",
  accent: "#16a34a",
  eyeColor: "#111827",
  eyeShape: "rounded",
  moduleShape: "rounded",
  size: 900,
  margin: 28,
  logoSize: 22,
  logoPadding: 10,
  correction: "H",
  transparent: false,
  outputMode: "qr",
  brandName: "Mil Moldes",
  subtitle: "Cuenta de empresa de WhatsApp",
  footerText: "Escanea este codigo para iniciar un chat de WhatsApp con Mil Moldes.",
  posterBackground: "#171717",
  posterCard: "#ffffff",
  centerBadge: "whatsapp",
};

const moduleShapes = [
  { value: "square", label: "Cuadrado" },
  { value: "rounded", label: "Redondeado" },
  { value: "circle", label: "Circular" },
  { value: "soft", label: "Suave" },
];

const eyeShapes = [
  { value: "square", label: "Cuadrado" },
  { value: "rounded", label: "Redondeado" },
  { value: "circle", label: "Circular" },
];

function drawRoundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
  ctx.fill();
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";

  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !current) {
      current = next;
    } else {
      lines.push(current);
      current = word;
    }
  });
  if (current) lines.push(current);

  lines.forEach((line, index) => {
    ctx.fillText(line, x, y + index * lineHeight);
  });
  return lines.length * lineHeight;
}

function drawModule(ctx, shape, x, y, size) {
  if (shape === "circle") {
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size * 0.42, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (shape === "rounded") {
    drawRoundRect(ctx, x + size * 0.08, y + size * 0.08, size * 0.84, size * 0.84, size * 0.22);
    return;
  }
  if (shape === "soft") {
    drawRoundRect(ctx, x + size * 0.14, y + size * 0.14, size * 0.72, size * 0.72, size * 0.34);
    return;
  }
  ctx.fillRect(x, y, size, size);
}

function isFinder(row, col, count) {
  const inTop = row < 7;
  const inLeft = col < 7;
  const inRight = col >= count - 7;
  const inBottom = row >= count - 7;
  return (inTop && inLeft) || (inTop && inRight) || (inBottom && inLeft);
}

function drawEye(ctx, shape, x, y, size, color, background) {
  ctx.fillStyle = color;
  if (shape === "circle") {
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = background;
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size * 0.34, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size * 0.18, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  const radius = shape === "rounded" ? size * 0.2 : 0;
  drawRoundRect(ctx, x, y, size, size, radius);
  ctx.fillStyle = background;
  drawRoundRect(ctx, x + size * 0.16, y + size * 0.16, size * 0.68, size * 0.68, radius * 0.75);
  ctx.fillStyle = color;
  drawRoundRect(ctx, x + size * 0.32, y + size * 0.32, size * 0.36, size * 0.36, radius * 0.55);
}

function drawCircleImage(ctx, image, x, y, size) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(image, x, y, size, size);
  ctx.restore();
}

function drawWhatsappBadge(ctx, x, y, size) {
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#111111";
  ctx.lineWidth = size * 0.08;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size * 0.27, Math.PI * 0.12, Math.PI * 1.78);
  ctx.lineTo(x + size * 0.34, y + size * 0.74);
  ctx.lineTo(x + size * 0.43, y + size * 0.67);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x + size * 0.41, y + size * 0.38);
  ctx.quadraticCurveTo(x + size * 0.47, y + size * 0.54, x + size * 0.6, y + size * 0.6);
  ctx.stroke();
}

function readImage(src) {
  return new Promise((resolve, reject) => {
    if (!src) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function drawQrGraphic(ctx, text, settings, logo, x, y, size, options = {}) {
  const QRCode = await import("qrcode");
  const qr = QRCode.create(text, { errorCorrectionLevel: settings.correction });
  const count = qr.modules.size;
  const margin = Number(options.margin ?? settings.margin ?? 0);
  const drawable = size - margin * 2;
  const cell = drawable / count;
  const background = options.background ?? (settings.transparent ? "rgba(255,255,255,0)" : settings.background);

  if (options.paintBackground !== false && !settings.transparent) {
    ctx.fillStyle = background;
    ctx.fillRect(x, y, size, size);
  }

  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (!qr.modules.get(col, row) || isFinder(row, col, count)) continue;
      const progress = (row + col) / (count * 2);
      ctx.fillStyle = progress > 0.58 ? settings.accent : settings.foreground;
      drawModule(ctx, settings.moduleShape, x + margin + col * cell, y + margin + row * cell, cell);
    }
  }

  const eyeSize = cell * 7;
  drawEye(ctx, settings.eyeShape, x + margin, y + margin, eyeSize, settings.eyeColor, background || settings.background);
  drawEye(ctx, settings.eyeShape, x + margin + (count - 7) * cell, y + margin, eyeSize, settings.eyeColor, background || settings.background);
  drawEye(ctx, settings.eyeShape, x + margin, y + margin + (count - 7) * cell, eyeSize, settings.eyeColor, background || settings.background);

  if (options.centerBadge === "whatsapp") {
    const badgeSize = size * 0.2;
    drawWhatsappBadge(ctx, x + (size - badgeSize) / 2, y + (size - badgeSize) / 2, badgeSize);
  } else if (options.centerBadge === "logo" && logo) {
    const logoSize = size * (Number(settings.logoSize || 0) / 100);
    const padding = size * (Number(settings.logoPadding || 0) / 1000);
    const logoX = x + (size - logoSize) / 2;
    const logoY = y + (size - logoSize) / 2;
    ctx.fillStyle = settings.background;
    drawRoundRect(ctx, logoX - padding, logoY - padding, logoSize + padding * 2, logoSize + padding * 2, logoSize * 0.18);
    ctx.drawImage(logo, logoX, logoY, logoSize, logoSize);
  }
}

export default function GeneradorQrPage() {
  const canvasRef = useRef(null);
  const fileRef = useRef(null);
  const [settings, setSettings] = useState(() => ({ ...DEFAULTS }));
  const [logo, setLogo] = useState("");
  const [status, setStatus] = useState("");

  const qrText = settings.text.trim() || " ";

  const update = (field, value) => {
    setSettings((prev) => ({ ...DEFAULTS, ...prev, [field]: value }));
    setStatus("");
  };

  const drawQr = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      const ctx = canvas.getContext("2d");
      const logoImage = await readImage(logo);

      if (settings.outputMode === "poster") {
        canvas.width = 1080;
        canvas.height = 1920;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = settings.posterBackground;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const cardX = 100;
        const cardY = 390;
        const cardW = 880;
        const cardH = 940;
        ctx.fillStyle = "rgba(0,0,0,0.22)";
        drawRoundRect(ctx, cardX + 8, cardY + 18, cardW, cardH, 24);
        ctx.fillStyle = settings.posterCard;
        drawRoundRect(ctx, cardX, cardY, cardW, cardH, 24);

        const avatarSize = 150;
        const avatarX = (canvas.width - avatarSize) / 2;
        const avatarY = cardY - avatarSize / 2;
        ctx.fillStyle = settings.posterCard;
        ctx.beginPath();
        ctx.arc(canvas.width / 2, cardY, avatarSize / 2 + 10, 0, Math.PI * 2);
        ctx.fill();
        if (logoImage) {
          drawCircleImage(ctx, logoImage, avatarX, avatarY, avatarSize);
        } else {
          ctx.fillStyle = "#111111";
          ctx.beginPath();
          ctx.arc(canvas.width / 2, cardY, avatarSize / 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#ffffff";
          ctx.font = "900 46px Arial, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("SW", canvas.width / 2, cardY + 3);
        }

        ctx.fillStyle = "#111111";
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        ctx.font = "500 58px Arial, sans-serif";
          ctx.fillText(settings.brandName || "Mil Moldes", canvas.width / 2, cardY + 185);

        ctx.fillStyle = "#6b7280";
        ctx.font = "400 40px Arial, sans-serif";
        ctx.fillText(settings.subtitle || "Cuenta de empresa de WhatsApp", canvas.width / 2, cardY + 250);

        await drawQrGraphic(ctx, qrText, settings, logoImage, cardX + 250, cardY + 330, 380, {
          margin: 0,
          background: settings.posterCard,
          paintBackground: false,
          centerBadge: settings.centerBadge,
        });

        ctx.fillStyle = "#9ca3af";
        ctx.font = "400 48px Arial, sans-serif";
        ctx.textAlign = "left";
        drawWrappedText(ctx, settings.footerText, 145, 1595, 790, 72);
        return;
      }

      const size = Number(settings.size || 900);
      canvas.width = size;
      canvas.height = size;
      ctx.clearRect(0, 0, size, size);
      await drawQrGraphic(ctx, qrText, settings, logoImage, 0, 0, size, {
        centerBadge: logoImage ? "logo" : "none",
      });
    } catch (error) {
      setStatus(error?.message || "No se pudo generar el QR.");
    }
  }, [logo, qrText, settings]);

  useEffect(() => {
    drawQr();
  }, [drawQr]);

  const handleLogo = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setLogo(String(reader.result || ""));
      setStatus("Logo cargado.");
    };
    reader.readAsDataURL(file);
  };

  const downloadPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = settings.outputMode === "poster" ? "qr-whatsapp-mil-moldes.png" : "qr-mil-moldes.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const copyPng = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !navigator.clipboard || !window.ClipboardItem) {
      setStatus("Tu navegador no permite copiar imagenes desde aqui.");
      return;
    }
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setStatus("QR copiado como imagen.");
    });
  };

  const reset = () => {
    setSettings(DEFAULTS);
    setLogo("");
    setStatus("Diseno reiniciado.");
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="min-h-screen bg-slate-100 p-4 text-slate-900 md:p-7">
      <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
        <section className="space-y-5">
          <header className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                <QrCode className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-slate-950">Generador de QR</h1>
                <p className="text-sm text-slate-600">Disena un QR para enlaces, redes, pagos, formularios o promociones.</p>
              </div>
            </div>
          </header>

          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4">
              <SelectField
                label="Formato"
                value={settings.outputMode}
                options={[
                  { value: "qr", label: "QR solo" },
                  { value: "poster", label: "Tarjeta WhatsApp" },
                ]}
                onChange={(value) => update("outputMode", value)}
              />
            </div>
            <label className="mb-2 flex items-center gap-2 text-sm font-black uppercase text-slate-600">
              <LinkIcon className="h-4 w-4" />
              Link o texto
            </label>
            <textarea
              value={settings.text}
              onChange={(event) => update("text", event.target.value)}
              rows={4}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              placeholder="Pega aqui tu link, WhatsApp, Instagram, formulario, pago, etc."
            />
          </div>

          {settings.outputMode === "poster" && (
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-lg font-black">Texto de la tarjeta</h2>
              <TextField label="Titulo" value={settings.brandName} onChange={(value) => update("brandName", value)} />
              <TextField label="Subtitulo" value={settings.subtitle} onChange={(value) => update("subtitle", value)} />
              <label className="block">
                <span className="mb-1 block text-xs font-black uppercase text-slate-500">Texto inferior</span>
                <textarea
                  value={settings.footerText}
                  onChange={(event) => update("footerText", event.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
              </label>
            </div>
          )}

          <div className="grid gap-5 md:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-black">
                <Palette className="h-5 w-5 text-emerald-700" />
                Colores
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <ColorField label="Principal" value={settings.foreground} onChange={(value) => update("foreground", value)} />
                <ColorField label="Acento" value={settings.accent} onChange={(value) => update("accent", value)} />
                <ColorField label="Esquinas" value={settings.eyeColor} onChange={(value) => update("eyeColor", value)} />
                <ColorField label="Fondo" value={settings.background} onChange={(value) => update("background", value)} disabled={settings.transparent} />
                {settings.outputMode === "poster" && (
                  <>
                    <ColorField label="Poster" value={settings.posterBackground} onChange={(value) => update("posterBackground", value)} />
                    <ColorField label="Tarjeta" value={settings.posterCard} onChange={(value) => update("posterCard", value)} />
                  </>
                )}
              </div>
              {settings.outputMode === "qr" && (
                <label className="mt-4 flex items-center gap-2 text-sm font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={settings.transparent}
                    onChange={(event) => update("transparent", event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  Fondo transparente
                </label>
              )}
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-lg font-black">Forma</h2>
              <SelectField label="Puntos" value={settings.moduleShape} options={moduleShapes} onChange={(value) => update("moduleShape", value)} />
              <SelectField label="Esquinas" value={settings.eyeShape} options={eyeShapes} onChange={(value) => update("eyeShape", value)} />
              <SelectField
                label="Correccion"
                value={settings.correction}
                options={[
                  { value: "M", label: "Media" },
                  { value: "Q", label: "Alta" },
                  { value: "H", label: "Maxima para logo" },
                ]}
                onChange={(value) => update("correction", value)}
              />
              {settings.outputMode === "poster" && (
                <SelectField
                  label="Centro del QR"
                  value={settings.centerBadge}
                  options={[
                    { value: "whatsapp", label: "Icono WhatsApp" },
                    { value: "logo", label: "Logo cargado" },
                    { value: "none", label: "Sin centro" },
                  ]}
                  onChange={(value) => update("centerBadge", value)}
                />
              )}
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            {settings.outputMode === "qr" && (
              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="mb-4 text-lg font-black">Medidas</h2>
                <RangeField label="Tamano" value={settings.size} min={400} max={1600} step={50} suffix="px" onChange={(value) => update("size", Number(value))} />
                <RangeField label="Margen" value={settings.margin} min={0} max={90} step={2} suffix="px" onChange={(value) => update("margin", Number(value))} />
              </div>
            )}

            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-black">
                <ImagePlus className="h-5 w-5 text-emerald-700" />
                Logo
              </h2>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800"
                >
                  <Upload className="h-4 w-4" />
                  Subir logo
                </button>
                {logo && (
                  <button
                    type="button"
                    onClick={() => {
                      setLogo("");
                      if (fileRef.current) fileRef.current.value = "";
                    }}
                    className="inline-flex items-center gap-2 rounded-lg bg-slate-200 px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-300"
                  >
                    <X className="h-4 w-4" />
                    Quitar
                  </button>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogo} />
              {settings.outputMode === "qr" && (
                <>
                  <RangeField label="Tamano logo" value={settings.logoSize} min={8} max={32} step={1} suffix="%" onChange={(value) => update("logoSize", Number(value))} />
                  <RangeField label="Fondo logo" value={settings.logoPadding} min={0} max={28} step={1} suffix="" onChange={(value) => update("logoPadding", Number(value))} />
                </>
              )}
            </div>
          </div>
        </section>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-black">Vista previa</h2>
              <button type="button" onClick={reset} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900" title="Reiniciar">
                <RotateCcw className="h-5 w-5" />
              </button>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <canvas
                ref={canvasRef}
                className={`mx-auto w-full rounded shadow-sm ${settings.outputMode === "poster" ? "aspect-[9/16] max-h-[720px] bg-slate-950 object-contain" : "aspect-square bg-white"}`}
              />
            </div>
            {status && <p className="mt-3 rounded bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">{status}</p>}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={downloadPng} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-black text-white hover:bg-emerald-700">
                <Download className="h-4 w-4" />
                PNG
              </button>
              <button type="button" onClick={copyPng} className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-black text-white hover:bg-slate-800">
                <Copy className="h-4 w-4" />
                Copiar
              </button>
            </div>
            <p className="mt-3 text-xs text-slate-500">Para logos grandes usa correccion maxima. Antes de imprimir, prueba el QR con tu celular.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function ColorField({ label, value, onChange, disabled = false }) {
  const safeValue = /^#[0-9a-f]{6}$/i.test(String(value || "")) ? value : "#000000";

  return (
    <label className={`block ${disabled ? "opacity-50" : ""}`}>
      <span className="mb-1 block text-xs font-black uppercase text-slate-500">{label}</span>
      <span
        className="flex overflow-hidden rounded-lg border border-slate-300 shadow-sm"
        style={{ backgroundColor: disabled ? "#94a3b8" : safeValue }}
      >
        <input type="color" value={safeValue} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="h-10 w-12 border-0 bg-transparent p-1" />
        <input
          type="text"
          value={String(value || "")}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="min-w-0 flex-1 bg-transparent px-2 text-sm font-black uppercase text-white outline-none placeholder:text-white/70 disabled:text-white"
          style={{ textShadow: "0 1px 2px rgba(0,0,0,0.75)" }}
        />
      </span>
    </label>
  );
}

function TextField({ label, value, onChange }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-xs font-black uppercase text-slate-500">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
      />
    </label>
  );
}

function SelectField({ label, value, options, onChange }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-xs font-black uppercase text-slate-500">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold outline-none focus:border-emerald-500">
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function RangeField({ label, value, min, max, step, suffix, onChange }) {
  return (
    <label className="mt-3 block">
      <span className="mb-1 flex items-center justify-between text-xs font-black uppercase text-slate-500">
        <span>{label}</span>
        <span className="text-slate-900">{value}{suffix}</span>
      </span>
      <input type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(event.target.value)} className="w-full accent-emerald-600" />
    </label>
  );
}
