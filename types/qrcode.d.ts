declare module 'qrcode' {
  export function toCanvas(canvas: HTMLCanvasElement, text: string, opts?: { width: number }): Promise<void>;
}
