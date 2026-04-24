declare module 'qrcode' {
  export function toCanvas(canvas: HTMLCanvasElement, text: string, opts?: { width: number }): Promise<void>;
}

declare global {
  interface Window {
    __COSTOS_EXTRA__?: {
      envio?: number;
      comision?: number;
      publicidad?: number;
      rebajas?: number;
      impuestos?: number;
    };
  }
}

export {};
