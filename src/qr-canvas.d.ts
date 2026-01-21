export interface QrCanvasOptions {
  /** Pixels per module (default: 6) */
  scale?: number;
  /** Quiet zone in modules (default: 4) */
  margin?: number;
  /** Target width in pixels (overrides scale) */
  width?: number;
  /** Dark module color, any CSS color (default: "#000") */
  dark?: string;
  /** Light module color, any CSS color (default: "#fff") */
  light?: string;
}

/**
 * Generate a QR code and render it to a canvas element.
 *
 * @param text - The text or URL to encode
 * @param opts - Optional configuration
 * @returns A canvas element containing the QR code
 * @throws Error if text is too long (max ~78 bytes for version 4-L)
 */
export function qrCanvas(text: string, opts?: QrCanvasOptions): HTMLCanvasElement;

export default qrCanvas;
