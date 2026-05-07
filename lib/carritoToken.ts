// Utilidad global para token anónimo de carrito
let carritoToken: string | null = null;
if (typeof window !== 'undefined') {
  carritoToken = localStorage.getItem('carrito_token');
  if (!carritoToken) {
    carritoToken = crypto.randomUUID();
    localStorage.setItem('carrito_token', carritoToken);
  }
}

export function getCarritoToken(): string | null {
  return carritoToken;
}