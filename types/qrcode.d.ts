declare module 'qrcode' {
  export type QRCodeCanvasOptions = {
    width?: number;
  };

  export function toCanvas(
    canvas: HTMLCanvasElement,
    text: string,
    opts?: QRCodeCanvasOptions
  ): Promise<void>;

  const qrCode: {
    toCanvas: typeof toCanvas;
  };

  export default qrCode;
}
