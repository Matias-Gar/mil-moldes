export {};

declare global {
  interface Window {
    __COSTOS_EXTRA__?: {
      envio?: number;
      comision?: number;
      publicidad?: number;
      rebajas?: number;
      impuestos?: number;
    };
    qz?: {
      websocket?: unknown;
      configs?: {
        create?: (...args: unknown[]) => unknown;
        [key: string]: unknown;
      };
      print?: unknown;
      [key: string]: unknown;
    };
  }
}
