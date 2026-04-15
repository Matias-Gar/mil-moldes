// Configuración global de la aplicación.

const WHATSAPP_BUSINESS_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "59177434023";
const NOTIFICATION_EMAIL = process.env.NEXT_PUBLIC_NOTIFICATION_EMAIL || "garblac01@gmail.com";

export const CONFIG = {
  // WhatsApp Business
  WHATSAPP_BUSINESS: WHATSAPP_BUSINESS_NUMBER,
  WHATSAPP_BUSINESS_DISPLAY: "+59177434023",
  NOTIFICATION_EMAIL: NOTIFICATION_EMAIL,
  
  // Nombre del negocio
  BUSINESS_NAME: "Tienda Online",
  // Dirección, teléfono y NIT (editar según datos reales de la tienda)
  BUSINESS_ADDRESS: "Av. Principal 123, Ciudad",
  BUSINESS_PHONE: "+591 77434023",
  BUSINESS_NIT: "123456789",
  
  // Configuración de promociones
  PROMOCIONES: {
    MOSTRAR_PORCENTAJE: true,
    MOSTRAR_MONTO: true,
    COLOR_DESCUENTO: "text-red-600",
    COLOR_PRECIO_PROMOCIONAL: "text-green-600"
  },
  
  // Configuración de inventario
  INVENTARIO: {
    STOCK_MINIMO_ALERTA: 3,
    STOCK_CRITICO_ALERTA: 1
  }
};

// Funciones de utilidad para WhatsApp
export const whatsappUtils = {
  // Crear URL de WhatsApp con mensaje
  createWhatsAppURL: (numero, mensaje) => {
    const encodedMessage = encodeURIComponent(mensaje);
    return `https://wa.me/${numero}?text=${encodedMessage}`;
  },
  
  // Abrir WhatsApp con mensaje
  openWhatsApp: (numero, mensaje) => {
    const url = whatsappUtils.createWhatsAppURL(numero, mensaje);
    window.open(url, '_blank');
  },
  
  // Enviar mensaje al WhatsApp Business
  sendToBusinessWhatsApp: (mensaje) => {
    const phone = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || CONFIG.WHATSAPP_BUSINESS;
    if (!phone) {
      throw new Error("No hay número de WhatsApp configurado.");
    }
    whatsappUtils.openWhatsApp(phone, mensaje);
  },

  createMailtoURL: (email, subject, body) => {
    const params = new URLSearchParams({
      subject: subject || "Notificación de stock",
      body: body || "",
    });
    return `mailto:${email}?${params.toString()}`;
  },

  sendStockAlertEmail: ({ to, subject, body }) => {
    const email = to || CONFIG.NOTIFICATION_EMAIL;
    if (!email) {
      throw new Error("No hay correo configurado para notificaciones.");
    }
    window.location.href = whatsappUtils.createMailtoURL(email, subject, body);
  }
};