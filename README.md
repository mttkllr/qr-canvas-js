# qr-canvas-js

Minimal, zero-dependency QR code generator for canvas.

- No dependencies
- ~400 lines of code
- Supports QR versions 1-4 (up to 78 bytes of data)
- ECC Level L
- UTF-8 encoding (Byte mode)
- TypeScript definitions included

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

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `scale` | number | 6 | Pixels per module |
| `margin` | number | 4 | Quiet zone in modules |
| `width` | number | - | Target width in pixels (overrides scale) |
| `dark` | string | `"#000"` | Dark module color (CSS) |
| `light` | string | `"#fff"` | Light module color (CSS) |

## Example

See `example.html` for an interactive demo.

## Limitations

- Supports QR versions 1-4 only (max ~78 bytes)
- ECC Level L only (lowest error correction)
- Byte mode encoding only

## License

MIT
