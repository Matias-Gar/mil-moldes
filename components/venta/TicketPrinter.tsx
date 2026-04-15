"use client";
// Extiende el tipo Window para incluir qz
declare global {
  interface Window {
    qz?: {
      websocket?: unknown;
      configs?: {
        create?: (...args: any[]) => any;
        [key: string]: unknown;
      };
      print?: unknown;
      [key: string]: unknown;
    };
  }
}
import React, { useImperativeHandle, forwardRef, useRef, useState } from 'react';
import jsPDF from 'jspdf';
import { CONFIG } from '../../lib/config';
import { fetchStoreSettings } from '../../lib/storeSettings';

interface TicketItem {
  nombre?: string;
  producto_nombre?: string;
  cantidad?: number;
  cant?: number;
  precio_unitario?: number;
  precio?: number;
  precio_pack?: number;
  precio_original?: number;
  descuento_item?: number;
  promocion?: {
    tipo?: string;
    valor?: number;
    descripcion?: string;
  } | null;
  promocion_aplicada?: {
    tipo?: string;
    valor?: number;
    descripcion?: string;
  } | null;
  color?: string;
}

interface TicketSnapshot {
  fecha?: string;
  venta?: { id?: string | number };
  cliente_nombre?: string;
  cliente_nit?: string;
  modo_pago?: string;
  requiere_factura?: boolean;
  items?: TicketItem[];
  subtotal?: number;
  descuento?: number;
  envio?: number;
  comision?: number;
  publicidad?: number;
  rebajas?: number;
  impuestos?: number;
  cobrar_impuestos?: boolean;
  total?: number;
  pago?: number;
  cambio?: number;
}


interface TicketPrinterProps {
  carrito: TicketItem[];
  clienteNombre: string;
  clienteNIT: string;
  modoPago: string;
  requiereFactura: boolean;
  subtotal: number;
  totalDescuento: number;
  total: number;
  envio?: number;
  comision?: number;
  publicidad?: number;
  rebajas?: number;
  impuestos?: number;
  cobrarImpuestos?: boolean;
  pago: number;
  cambio: number;
  ultimoTicket?: TicketSnapshot;
  setUltimoTicket: (t: TicketSnapshot) => void;
}

export interface TicketPrinterHandle {
  printComprobante: () => Promise<void>;
}

function limpiarTexto(texto?: string) {
  if (!texto) return '';
  return texto
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, '')
    .trim();
}

function calcularItem(item: TicketItem) {
  const precioOriginal = Number(
    item.precio_original ??
    item.precio_unitario ??
    item.precio ??
    0
  );

  const descuento = Number(item.descuento_item ?? 0);

  const precioFinal = Math.max(precioOriginal - descuento, 0);
  const precioFinalRedondeado = Number(precioFinal.toFixed(2));
  const tieneDescuento = descuento > 0;

  return {
    ...item,
    precioOriginal,
    descuento,
    precioFinal: precioFinalRedondeado,
    tieneDescuento
  };
}

const TicketPrinter = forwardRef<TicketPrinterHandle, TicketPrinterProps>((props, ref) => {
  const ticketRef = useRef<HTMLDivElement>(null);
  // QZ Tray deshabilitado en esta vista
  // const [qzStatus, setQzStatus] = useState<'checking'|'ok'|'fail'>('checking');
  // const [printers, setPrinters] = useState<string[]>([]);


  // QZ Tray deshabilitado completamente en esta vista

  async function getReceiptBranding() {
    const cfg = CONFIG as unknown as {
      WHATSAPP_BUSINESS: string;
      NOMBRE_NEGOCIO: string;
      BUSINESS_NAME?: string;
      BUSINESS_ADDRESS?: string;
      BUSINESS_PHONE?: string;
      BUSINESS_NIT?: string;
      DIRECCION_COMERCIAL?: string;
    };

    try {
      const settings = await fetchStoreSettings();
      const storeName = limpiarTexto(settings?.store_name) || limpiarTexto(cfg.BUSINESS_NAME || cfg.NOMBRE_NEGOCIO || 'Tienda');
      const storeAddress = limpiarTexto(settings?.store_address) || cfg.BUSINESS_ADDRESS || cfg.DIRECCION_COMERCIAL || '';
      const whatsappDigits = String(settings?.whatsapp_number || cfg.WHATSAPP_BUSINESS || '').replace(/\D/g, '');
      const whatsappDisplay = whatsappDigits ? `+${whatsappDigits}` : (cfg.BUSINESS_PHONE || '');
      const whatsappUrl = whatsappDigits
        ? `https://wa.me/${whatsappDigits}?text=Hola%2C%20quiero%20informacion`
        : '';

      return {
        storeName,
        businessAddress: storeAddress,
        businessNit: cfg.BUSINESS_NIT || '',
        whatsappDisplay,
        whatsappUrl,
      };
    } catch {
      const storeName = limpiarTexto(cfg.BUSINESS_NAME || cfg.NOMBRE_NEGOCIO || 'Tienda');
      const whatsappDigits = String(cfg.WHATSAPP_BUSINESS || '').replace(/\D/g, '');
      return {
        storeName,
        businessAddress: cfg.BUSINESS_ADDRESS || cfg.DIRECCION_COMERCIAL || '',
        businessNit: cfg.BUSINESS_NIT || '',
        whatsappDisplay: whatsappDigits ? `+${whatsappDigits}` : (cfg.BUSINESS_PHONE || ''),
        whatsappUrl: whatsappDigits ? `https://wa.me/${whatsappDigits}?text=Hola%2C%20quiero%20informacion` : '',
      };
    }
  }

  // replicamos funciones desde Página original
  async function printTicketAsPDF(ticketSnapshot: TicketSnapshot) {
    // console.log('printTicketAsPDF init', { ticketSnapshot });

    if (!ticketSnapshot || typeof ticketSnapshot !== 'object') {
      // console.warn('printTicketAsPDF: ticketSnapshot inválido');
      return false;
    }

    const items = Array.isArray(ticketSnapshot.items) ? ticketSnapshot.items : [];

    if (items.length === 0) {/* console.warn('printTicketAsPDF: no hay items', items); */}

    try {
      const branding = await getReceiptBranding();
      const PAPER_WIDTH = 72; // cambia a 58 / 80 si quieres
      const MARGIN = 2;
      const CONTENT_WIDTH = PAPER_WIDTH - MARGIN * 2;

      const doc = new jsPDF({ unit: 'mm', format: [PAPER_WIDTH, 340] });
      let y = 6;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text('COMPROBANTE TIENDA', PAPER_WIDTH / 2, y, { align: 'center' });
      y += 3;
      doc.setFontSize(7);
      doc.text(branding.storeName || 'Tienda', PAPER_WIDTH / 2, y, { align: 'center' });
      y += 3;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      if (branding.businessAddress) {
        doc.text('Direccion:', 5, y); y += 3;
        doc.text(branding.businessAddress, 5, y, { maxWidth: CONTENT_WIDTH }); y += 4;
      }
      if (branding.whatsappDisplay) {
        doc.text(`Contacto WhatsApp: ${branding.whatsappDisplay}`, 5, y); y += 4;
      }
      doc.line(5, y, PAPER_WIDTH - 5, y); y += 4;

      doc.text(`Fecha: ${ticketSnapshot.fecha || new Date().toLocaleString()}`, MARGIN, y); y += 3;
      doc.text(`Cliente: ${ticketSnapshot.cliente_nombre || '-'}`, MARGIN, y); y += 3;
      doc.text(`Pago: ${ticketSnapshot.modo_pago || '-'}`, MARGIN, y); y += 3;
      doc.line(MARGIN, y, PAPER_WIDTH - MARGIN, y); y += 3;

      doc.setFont('courier', 'bold');
      doc.setFontSize(7);
      doc.text('Cant', MARGIN, y);
      doc.text('Detalle', MARGIN + 10, y);
      doc.text('Bs', PAPER_WIDTH - MARGIN, y, { align: 'right' });
      y += 3;
      doc.setLineWidth(0.1);
      doc.line(MARGIN, y, PAPER_WIDTH - MARGIN, y);
      y += 3;

      doc.setFont('courier', 'normal');
      for (const rawItem of items) {
        const item = calcularItem(rawItem);
        const nombre = limpiarTexto(item.nombre || item.producto_nombre) || 'Producto';
        const qty = item.cantidad || item.cant || 1;
        const descuentoItem = item.descuento;
        const precioFinal = item.precioFinal;
        const promocion = item.promocion || item.promocion_aplicada;

        const itemLabel = `${qty}x ${nombre}${item.color ? ` (${item.color})` : ''}`;
        const itemLines = doc.splitTextToSize(itemLabel, CONTENT_WIDTH - 25);

        doc.setFont('courier', 'bold');
        const lineHeight = 2.8; // más compacto
        doc.text(itemLines[0], MARGIN, y);
        doc.text(`Bs ${precioFinal.toFixed(2)}`, PAPER_WIDTH - MARGIN, y, { align: 'right' });
        if (itemLines.length > 1) {
          doc.setFont('courier', 'normal');
          for (let i = 1; i < itemLines.length; i++) {
            doc.text(itemLines[i], MARGIN, y + i * lineHeight);
          }
        }
        y += itemLines.length * lineHeight;

        if (item.tieneDescuento) {
          const promoLabel = limpiarTexto(promocion?.descripcion) || 'Promo';
          doc.setFont('courier', 'normal');
          doc.text(`-${descuentoItem.toFixed(2)} (${promoLabel})`, PAPER_WIDTH - MARGIN, y, { align: 'right' });
          y += 3;
        }
      }

      if (items.length === 0) {
        doc.text('Sin items para imprimir', MARGIN, y); y += 4;
      }

      y += 2;
      doc.line(MARGIN, y, PAPER_WIDTH - MARGIN, y);
      y += 3;

      const total = Number(ticketSnapshot.total || 0);
      const subtotal = Number(ticketSnapshot.subtotal || total);
      const descuento = Number(ticketSnapshot.descuento || 0);
      const envio = Number(ticketSnapshot.envio || 0);
      const comision = Number(ticketSnapshot.comision || 0);
      const publicidad = Number(ticketSnapshot.publicidad || 0);
      const rebajas = Number(ticketSnapshot.rebajas || 0);
      const impuestos = Number(ticketSnapshot.impuestos || 0);
      const pago = Number(ticketSnapshot.pago || 0);
      const cambio = Number(ticketSnapshot.cambio || 0);

      doc.setFont('courier', 'bold');
      doc.text('SUBTOTAL', MARGIN, y); doc.text(`Bs ${subtotal.toFixed(2)}`, PAPER_WIDTH - MARGIN, y, { align: 'right' }); y += 2.5;
      if (descuento > 0) { doc.text('DESC', MARGIN, y); doc.text(`-Bs ${descuento.toFixed(2)}`, PAPER_WIDTH - MARGIN, y, { align: 'right' }); y += 2.5; }
      if (envio > 0) { doc.text('ENVIO', MARGIN, y); doc.text(`+Bs ${envio.toFixed(2)}`, PAPER_WIDTH - MARGIN, y, { align: 'right' }); y += 2.5; }
      if (comision > 0) { doc.text('COMISION', MARGIN, y); doc.text(`+Bs ${comision.toFixed(2)}`, PAPER_WIDTH - MARGIN, y, { align: 'right' }); y += 2.5; }
      if (publicidad > 0) { doc.text('PUBLICIDAD', MARGIN, y); doc.text(`-Bs ${publicidad.toFixed(2)}`, PAPER_WIDTH - MARGIN, y, { align: 'right' }); y += 2.5; }
      if (rebajas > 0) { doc.text('REBAJAS', MARGIN, y); doc.text(`-Bs ${rebajas.toFixed(2)}`, PAPER_WIDTH - MARGIN, y, { align: 'right' }); y += 2.5; }
      if (impuestos > 0) { doc.text('IVA+IT (16%)', MARGIN, y); doc.text(`+Bs ${impuestos.toFixed(2)}`, PAPER_WIDTH - MARGIN, y, { align: 'right' }); y += 2.5; }
      doc.text('TOTAL', MARGIN, y); doc.text(`Bs ${total.toFixed(2)}`, PAPER_WIDTH - MARGIN, y, { align: 'right' }); y += 2.5;
      doc.text('PAGO', MARGIN, y); doc.text(`Bs ${pago.toFixed(2)}`, PAPER_WIDTH - MARGIN, y, { align: 'right' }); y += 2.5;
      doc.text('CAMBIO', MARGIN, y); doc.text(`Bs ${cambio.toFixed(2)}`, PAPER_WIDTH - MARGIN, y, { align: 'right' }); y += 4;

      try {
        // QR de contacto Whatsapp y comprobante digital
        const qrModule = await import('qrcode');
        const qr = qrModule as { toCanvas: (canvas: HTMLCanvasElement, text: string, opts?: { width: number }) => Promise<void> };
        const qrCanvasWA = document.createElement('canvas');
        const qrCanvasDigital = document.createElement('canvas');
        const whatsappUrl = branding.whatsappUrl || 'https://wa.me/59177434023?text=Hola%2C%20quiero%20informacion';
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : 'https://streetwear.example');
        const digitalUrl = `${appUrl.replace(/\/+$/, '')}/admin/ventas/comprobante/${ticketSnapshot?.venta?.id || '0000'}`;

        await qr.toCanvas(qrCanvasWA, whatsappUrl, { width: 100 });
        await qr.toCanvas(qrCanvasDigital, digitalUrl, { width: 100 });

        const qrImgWA = qrCanvasWA.toDataURL('image/png');
        const qrImgDigital = qrCanvasDigital.toDataURL('image/png');

        const qrSize = 18;
        const gap = 4;
        const startX = (PAPER_WIDTH - qrSize * 2 - gap) / 2;

        doc.addImage(qrImgWA, 'PNG', startX, y, qrSize, qrSize);
        doc.addImage(qrImgDigital, 'PNG', startX + qrSize + gap, y, qrSize, qrSize);
        y += qrSize + 3;

        doc.setFontSize(6);
        doc.text('WhatsApp', startX + qrSize / 2, y, { align: 'center' });
        doc.text('Comprobante digital', startX + qrSize + gap + qrSize / 2, y, { align: 'center' });
        y += 4;
      } catch (err) {
        // console.warn('qrcode no disponible, omitiendo QR', err);
      }

      doc.setFontSize(6);
      doc.text('¡Gracias por su compra!', PAPER_WIDTH / 2, y, { align: 'center' });
      y += 5;

      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);

      let iframe = document.getElementById('ticket-print-iframe') as HTMLIFrameElement | null;
      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'ticket-print-iframe';
        iframe.style.position = 'fixed';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        iframe.style.visibility = 'hidden';
        document.body.appendChild(iframe);
      }

      iframe.src = url;

      iframe.onload = () => {
        setTimeout(() => {
          try {
            iframe?.contentWindow?.focus();
            iframe?.contentWindow?.print();
          } catch (err) {
            // console.warn('Error al imprimir desde iframe interno', err);
          } finally {
            URL.revokeObjectURL(url);
          }
        }, 500);
      };

      return true;
    } catch (err) {
      // console.error('printTicketAsPDF error', err);
      return false;
    }
  }

  async function printComprobanteThermal(ticketSnapshot: TicketSnapshot) {
    // Chequeo robusto de QZ Tray 2.2.6
    if (!window.qz || !window.qz.websocket || !window.qz.configs || !window.qz.print) {
      // console.warn('qz-tray no está disponible o la API es incorrecta; se usará impresión estándar');
      return false;
    }
    try {
      const branding = await getReceiptBranding();
      const lines: string[] = [];
      lines.push('\x1b@'); // init escpos
      lines.push('\x1b!\x00');
      // Centrado
      lines.push('\x1b\x61\x01');
      lines.push('================================');
      lines.push('      COMPROBANTE DE VENTA      ');
      lines.push((branding.storeName || 'Tienda').toUpperCase());
      if (branding.businessAddress) lines.push(branding.businessAddress);
      if (branding.whatsappDisplay) lines.push(`WhatsApp: ${branding.whatsappDisplay}`);
      if (branding.businessNit) lines.push(`NIT: ${branding.businessNit}`);
      lines.push('================================');
      lines.push('');
      // Izquierda
      lines.push('\x1b\x61\x00');
      lines.push(`Fecha:    ${ticketSnapshot?.fecha || new Date().toLocaleString()}`);
      lines.push(`Cliente:  ${ticketSnapshot?.cliente_nombre || '-'}`);
      if (ticketSnapshot?.cliente_nit) lines.push(`NIT/CI:   ${ticketSnapshot.cliente_nit}`);
      lines.push(`Método:   ${ticketSnapshot?.modo_pago || '-'}`);
      lines.push('--------------------------------');
      // Encabezado de productos
      lines.push('Cant  Detalle                   Bs');
      lines.push('--------------------------------');
      for (const item of ticketSnapshot?.items || []) {
        const cantidad = item.cantidad || item.cant || 1;
        let nombre = item.nombre || item.producto_nombre || 'Producto';
        if (item.color) nombre += ` (${item.color})`;
        const itemCalc = calcularItem(item);
        const precioFinal = itemCalc.precioFinal.toFixed(2);
        // Ajusta el ancho para que no se corte el nombre
        let detalle = `${cantidad}`.padEnd(5) + nombre.padEnd(25).substring(0,25) + precioFinal.padStart(7);
        lines.push(detalle);
        if (itemCalc.descuento > 0) {
          lines.push(`  PROMO: ${(item.promocion?.descripcion || 'Descuento').substring(0,18)} -${itemCalc.descuento.toFixed(2)}`);
          lines.push(`  ANTES: ${itemCalc.precioOriginal.toFixed(2)}`);
        }
      }
      if (!ticketSnapshot?.items || ticketSnapshot.items.length === 0) {
        lines.push('Sin items para imprimir');
      }
      lines.push('--------------------------------');
      // Totales alineados y destacados
      const total = Number(ticketSnapshot?.total || 0);
      const subtotal = Number(ticketSnapshot?.subtotal || total);
      const descuento = Number(ticketSnapshot?.descuento || 0);
      const envio = Number(ticketSnapshot?.envio || 0);
      const comision = Number(ticketSnapshot?.comision || 0);
      const publicidad = Number(ticketSnapshot?.publicidad || 0);
      const rebajas = Number(ticketSnapshot?.rebajas || 0);
      const impuestos = Number(ticketSnapshot?.impuestos || 0);
      const pago = Number(ticketSnapshot?.pago || 0);
      const cambio = Number(ticketSnapshot?.cambio || 0);
      lines.push('');
      lines.push('         RESUMEN DE PAGO        ');
      lines.push('--------------------------------');
      lines.push(`SUBTOTAL:           Bs ${subtotal.toFixed(2)}`);
      if (descuento > 0) lines.push(`DESCUENTO:        -Bs ${descuento.toFixed(2)}`);
      if (envio > 0) lines.push(`ENVÍO:            +Bs ${envio.toFixed(2)}`);
      if (comision > 0) lines.push(`COMISIÓN:         +Bs ${comision.toFixed(2)}`);
      if (publicidad > 0) lines.push(`PUBLICIDAD:       -Bs ${publicidad.toFixed(2)}`);
      if (rebajas > 0) lines.push(`REBAJAS:          -Bs ${rebajas.toFixed(2)}`);
      if (impuestos > 0) lines.push(`IVA+IT (16%):     +Bs ${impuestos.toFixed(2)}`);
      lines.push('--------------------------------');
      lines.push(`TOTAL:              Bs ${total.toFixed(2)}`);
      lines.push(`PAGO:               Bs ${pago.toFixed(2)}`);
      lines.push(`CAMBIO:             Bs ${cambio.toFixed(2)}`);
      lines.push('');
      // Centrado
      lines.push('\x1b\x61\x01');
      lines.push('¡GRACIAS POR SU COMPRA!');
      lines.push('');
      // Varias líneas en blanco antes del corte
      lines.push('');
      lines.push('');
      lines.push('');
      // Corte total y parcial (probar ambos)
      lines.push('\x1dV\x00'); // corte total
      lines.push('\x1dV\x01'); // corte parcial
      // Comando apertura de caja (solo comprobante)
      // \x1b\x70\x00\x19\xFA es el típico para la mayoría de térmicas
      lines.push('\x1bp\x00\x19\xFA');
      // Volver a izquierda
      lines.push('\x1b\x61\x00');
      const qzApi = window.qz;
      const config = typeof qzApi?.configs?.create === 'function' ? qzApi.configs.create('POS-80C') : undefined;
      if (!config || !qzApi?.print) {
        // console.warn('qz-tray config o función print no disponible');
        return false;
      }
      if (typeof qzApi.print === 'function') {
        await qzApi.print(config, lines);
      }
      return true;
    } catch (err) {
      // console.warn('printComprobanteThermal error', err);
      return false;
    }
  }

  async function printComprobante() {
    if (!props.modoPago) return alert('Selecciona un método de pago antes de imprimir');
    if (props.modoPago === 'efectivo' && Number(props.pago || 0) < Number(props.total || 0)) {
      return alert('El pago recibido es insuficiente');
    }
    if ((!props.carrito || props.carrito.length === 0) && !props.ultimoTicket) return alert('No hay productos para imprimir');
    const ticket = (props.ultimoTicket && (!props.carrito || props.carrito.length === 0))
      ? props.ultimoTicket
      : {
          fecha: new Date().toLocaleString(),
          cliente_nombre: props.clienteNombre,
          cliente_nit: props.clienteNIT,
          modo_pago: props.modoPago,
          requiere_factura: props.requiereFactura,
          items: (props.carrito || []).map(it => ({
            ...it,
            precio_original: it.precio_original ?? it.precio ?? it.precio_unitario ?? 0,
            precio_unitario: it.precio_unitario ?? it.precio ?? 0,
            descuento_item: it.descuento_item || 0,
            promocion: it.promocion_aplicada || null
          })),
          subtotal: props.subtotal,
          descuento: props.totalDescuento,
          envio: props.envio || 0,
          comision: props.comision || 0,
          publicidad: props.publicidad || 0,
          rebajas: props.rebajas || 0,
          impuestos: props.impuestos || 0,
          cobrar_impuestos: props.cobrarImpuestos || false,
          total: props.total,
          pago: props.pago,
          cambio: props.cambio
        };
    props.setUltimoTicket(ticket);
    try {
      // Solo imprimir usando HTML/PDF, sin QZ Tray térmica en esta opción
      const pdfOk = await printTicketAsPDF(ticket);
      if (pdfOk) return;
      // fallback: imprimir el HTML generado (sin PDF) usando iframe invisible
      const printContainer = ticketRef.current;
      if (printContainer) {
        const html = printContainer.innerHTML;
        const ticketHTML = `
          <!doctype html>
          <html>
            <head>
              <meta charset="utf-8">
              <style>
                @page { size: 80mm auto; margin: 0; }
                html, body { margin: 0; padding: 0; font-family: Arial, sans-serif; }
                body { width: 80mm; margin: 0; padding: 0; }
                .ticket-wrapper { width: 80mm; margin: 0; padding: 0; }
              </style>
            </head>
            <body>
              <div class="ticket-wrapper">${html}</div>
            </body>
          </html>
        `;
        
        let fallbackIframe = document.getElementById('ticket-fallback-iframe') as HTMLIFrameElement | null;
        if (!fallbackIframe) {
          fallbackIframe = document.createElement('iframe');
          fallbackIframe.id = 'ticket-fallback-iframe';
          fallbackIframe.style.position = 'fixed';
          fallbackIframe.style.width = '0';
          fallbackIframe.style.height = '0';
          fallbackIframe.style.border = '0';
          fallbackIframe.style.visibility = 'hidden';
          document.body.appendChild(fallbackIframe);
        }

        const fallbackDoc = fallbackIframe.contentDocument || fallbackIframe.contentWindow?.document;
        if (fallbackDoc) {
          fallbackDoc.open();
          fallbackDoc.write(ticketHTML);
          fallbackDoc.close();
          
          setTimeout(() => {
            try {
              fallbackIframe?.contentWindow?.focus();
              fallbackIframe?.contentWindow?.print();
            } catch (err) {
              // console.warn('fallback print call failed', err);
            }
          }, 500);
        }
      }
    } catch (err) {
      // console.warn('printComprobante error', err);
      alert('Error al intentar imprimir el comprobante');
    }
  }

  useImperativeHandle(ref, () => ({ printComprobante }));

  return (
    <>
      {/* QZ Tray oculto/deshabilitado en esta vista */}
      <div id="ticket-print" ref={ticketRef} className="hidden print:block" />
    </>
  );
});

TicketPrinter.displayName = 'TicketPrinter';

export default TicketPrinter;
