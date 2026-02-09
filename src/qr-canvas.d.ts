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
 * @throws {TypeError} If text is not a string
 * @throws {Error} If text is too long (max ~271 bytes for version 10-L)
 */
export function qrCanvas(text: string, opts?: QrCanvasOptions): HTMLCanvasElement;

/**
 * Generate QR code data as a raw module matrix (no canvas required).
 *
 * @param text - The text or URL to encode
 * @returns The QR code size and 2D boolean matrix
 * @throws {TypeError} If text is not a string
 * @throws {Error} If text is too long (max ~271 bytes for version 10-L)
 */
export function qrMatrix(text: string): { size: number; modules: boolean[][] };

/**
 * Encode a string as UTF-8 bytes.
 *
 * @param str - The string to encode
 * @returns Array of byte values
 */
export function utf8Bytes(str: string): number[];

export default qrCanvas;
