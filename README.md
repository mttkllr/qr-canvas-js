# qr-canvas-js

Minimal, zero-dependency QR code generator for canvas.

- No dependencies
- ~700 lines of code (~3.4KB gzipped)
- Supports QR versions 1–10 (up to 271 bytes of data)
- ECC Level L
- UTF-8 encoding (Byte mode)
- TypeScript definitions included

Unlike qrious (71KB), qr-canvas-js is under 9KB minified with zero dependencies.

## Usage

### ES Module

```js
import { qrCanvas } from 'qr-canvas-js';

const canvas = qrCanvas('https://example.com');
document.body.appendChild(canvas);
```

### Script Tag

```html
<script src="dist/qr-canvas.min.js"></script>
<script>
  const canvas = QRCanvas.qrCanvas('https://example.com', {
    scale: 8,
    margin: 2
  });
  document.body.appendChild(canvas);
</script>
```

### Raw Matrix (no canvas)

```js
import { qrMatrix } from 'qr-canvas-js';

const { size, modules } = qrMatrix('Hello');
// modules[y][x] is true for dark, false for light
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `scale` | number | 6 | Pixels per module |
| `margin` | number | 4 | Quiet zone in modules |
| `width` | number | - | Target width in pixels (overrides scale) |
| `dark` | string | `"#000"` | Dark module color (CSS) |
| `light` | string | `"#fff"` | Light module color (CSS) |

## What fits

| Content | Bytes | Version |
|---------|-------|---------|
| Short URL (`https://example.com`) | 19 | 1 |
| UUID | 36 | 2 |
| Tweet-length text (140 chars) | 140 | 7 |
| Long URL with query params | ~200 | 9 |
| Max capacity | 271 | 10 |

## Error handling

Throws an `Error` if the input exceeds 271 bytes (version 10-L capacity). Throws a `TypeError` if `text` is not a string.

```js
try {
  qrCanvas(longString);
} catch (e) {
  console.error(e.message); // "Input too long (max ~271 bytes at version 10-L)."
}
```

## ECC Level

This library uses ECC Level L, which provides ~7% error correction. This is ideal for screen display where codes are rendered perfectly. For printed codes that may be damaged or partially obscured, consider a library that supports higher ECC levels (M, Q, or H).

## Example

See `example.html` for an interactive demo.

## Limitations

- Supports QR versions 1–10 only (max ~271 bytes)
- ECC Level L only (lowest error correction)
- Byte mode encoding only

## License

MIT
