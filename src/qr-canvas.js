/**
 * Minimal dependency-free QR Code generator (Byte mode), versions 1–4, ECC Level L.
 * Renders to a <canvas>.
 *
 * Usage:
 *   const canvas = qrCanvas("https://example.com", { scale: 6, margin: 4 });
 *   document.body.appendChild(canvas);
 *
 * Options:
 *   - width: target pixel width (optional, overrides scale)
 *   - scale: pixels per module (default 6)
 *   - margin: quiet zone in modules (default 4)
 *   - dark: CSS color (default "#000")
 *   - light: CSS color (default "#fff")
 */

export function qrCanvas(text, opts = {}) {
    const margin = opts.margin ?? 4;
    const dark = opts.dark ?? "#000";
    const light = opts.light ?? "#fff";

    const qr = qrMake(text); // { size, modules: 2D bool }
    const size = qr.size;

    let scale = opts.scale ?? 6;
    let px;

    if (opts.width) {
        px = opts.width;
        scale = px / (size + margin * 2);
    } else {
        px = (size + margin * 2) * scale;
    }

    const canvas = document.createElement("canvas");
    canvas.width = px;
    canvas.height = px;

    const ctx = canvas.getContext("2d");
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, px, px);

    ctx.fillStyle = dark;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            if (qr.modules[y][x]) {
                // Snap to nearest pixel to avoid aliasing (blur) caused by fractional scales.
                // Some modules may be 1px wider/taller than others, but edges will be sharp.
                const xStart = Math.floor((x + margin) * scale);
                const yStart = Math.floor((y + margin) * scale);
                const xEnd = Math.floor((x + margin + 1) * scale);
                const yEnd = Math.floor((y + margin + 1) * scale);

                ctx.fillRect(xStart, yStart, xEnd - xStart, yEnd - yStart);
            }
        }
    }
    return canvas;
}

/* ---------------------------- Core QR builder ---------------------------- */

function qrMake(text) {
    // Encode as UTF-8 bytes (Byte mode)
    const dataBytes = utf8Bytes(text);

    // Capacity (Version 1–4, Level L) in bytes for Byte mode:
    // V1: 17, V2: 32, V3: 53, V4: 78
    const versions = [
        { v: 1, size: 21, dataCodewords: 19, dataBytesCapacity: 17, eccCodewords: 7 },
        { v: 2, size: 25, dataCodewords: 34, dataBytesCapacity: 32, eccCodewords: 10 },
        { v: 3, size: 29, dataCodewords: 55, dataBytesCapacity: 53, eccCodewords: 15 },
        { v: 4, size: 33, dataCodewords: 80, dataBytesCapacity: 78, eccCodewords: 20 },
    ];

    let ver = null;
    for (const cand of versions) {
        if (dataBytes.length <= cand.dataBytesCapacity) {
            ver = cand;
            break;
        }
    }
    if (!ver) {
        throw new Error("Input too long for this minimal generator (supports up to version 4-L).");
    }

    // Build bit stream: [Mode=0100][Count][Data][Terminator][Pad to byte][Pad codewords]
    const bits = [];
    // Mode indicator: Byte mode = 0100
    pushBits(bits, 0b0100, 4);

    // Character count indicator bits for Byte mode:
    // Version 1–9 uses 8 bits
    pushBits(bits, dataBytes.length, 8);

    for (const b of dataBytes) pushBits(bits, b, 8);

    // Terminator up to 4 zeros
    const totalDataBits = ver.dataCodewords * 8;
    const remaining = totalDataBits - bits.length;
    if (remaining > 0) pushBits(bits, 0, Math.min(4, remaining));

    // Pad to byte boundary
    while (bits.length % 8 !== 0) bits.push(0);

    // Convert to codewords
    const dataCodewords = [];
    for (let i = 0; i < bits.length; i += 8) {
        let cw = 0;
        for (let j = 0; j < 8; j++) cw = (cw << 1) | bits[i + j];
        dataCodewords.push(cw);
    }

    // Pad codewords alternating 0xEC, 0x11
    const pads = [0xEC, 0x11];
    let pi = 0;
    while (dataCodewords.length < ver.dataCodewords) {
        dataCodewords.push(pads[pi++ & 1]);
    }

    // Reed-Solomon ECC (single block for these versions at Level L)
    const ecc = rsComputeEcc(dataCodewords, ver.eccCodewords);

    // Final codewords = data + ecc
    const codewords = dataCodewords.concat(ecc);

    // Build module matrix with function patterns, then place codewords, mask, add format info
    const m = qrInitMatrix(ver.size);
    qrDrawFunctionPatterns(m, ver.v);
    qrPlaceCodewords(m, codewords);

    // Choose a mask (0..7) with lowest penalty
    let bestMask = 0;
    let bestScore = Infinity;
    let bestModules = null;

    for (let mask = 0; mask < 8; mask++) {
        const trial = qrCloneMatrix(m);
        qrApplyMask(trial, mask);
        qrWriteFormatInfo(trial, mask); // Level L, mask
        const score = qrPenaltyScore(trial);
        if (score < bestScore) {
            bestScore = score;
            bestMask = mask;
            bestModules = trial;
        }
    }

    return { size: ver.size, modules: bestModules.modules };
}

/* ---------------------------- Matrix structure ---------------------------- */

function qrInitMatrix(size) {
    // modules[y][x] = boolean (dark)
    // reserved[y][x] = boolean (true if function pattern / fixed)
    const modules = Array.from({ length: size }, () => Array(size).fill(false));
    const reserved = Array.from({ length: size }, () => Array(size).fill(false));
    return { size, modules, reserved };
}

function qrCloneMatrix(m) {
    const size = m.size;
    const modules = Array.from({ length: size }, (_, y) => m.modules[y].slice());
    const reserved = Array.from({ length: size }, (_, y) => m.reserved[y].slice());
    return { size, modules, reserved };
}

function setModule(m, x, y, dark, reserve = true) {
    if (x < 0 || y < 0 || x >= m.size || y >= m.size) return;
    m.modules[y][x] = !!dark;
    if (reserve) m.reserved[y][x] = true;
}

/* ---------------------------- Function patterns ---------------------------- */

function qrDrawFunctionPatterns(m, version) {
    const size = m.size;

    // Finder patterns 7x7 + separators
    drawFinder(m, 0, 0);
    drawFinder(m, size - 7, 0);
    drawFinder(m, 0, size - 7);

    // Timing patterns
    for (let i = 8; i < size - 8; i++) {
        setModule(m, i, 6, i % 2 === 0, true);
        setModule(m, 6, i, i % 2 === 0, true);
    }

    // Dark module (version 1+): (8, 4*version + 9) in 0-index coords? Spec: (row=4v+9, col=8)
    setModule(m, 8, 4 * version + 9, true, true);

    // Reserve format info areas
    // Around top-left finder
    for (let i = 0; i < 9; i++) {
        if (i !== 6) { // timing line already reserved but keep consistent
            m.reserved[8][i] = true;
            m.reserved[i][8] = true;
        }
    }
    // Around top-right
    for (let i = 0; i < 8; i++) m.reserved[i][size - 8] = true;
    // Around bottom-left
    for (let i = 0; i < 8; i++) m.reserved[size - 8][i] = true;

    // Reserve Format Information copy 2 (Top-Right & Bottom-Left)
    // Top-Right (Horizontal): Row 8, Cols size-8 .. size-1
    for (let x = size - 8; x < size; x++) m.reserved[8][x] = true;
    // Bottom-Left (Vertical): Col 8, Rows size-7 .. size-1
    for (let y = size - 7; y < size; y++) m.reserved[y][8] = true;

    // Alignment patterns for versions 2–4
    const alignPos = alignmentPositions(version);
    if (alignPos.length) {
        for (const y of alignPos) {
            for (const x of alignPos) {
                // skip if overlaps finder
                const nearFinder =
                    (x <= 8 && y <= 8) ||
                    (x >= size - 9 && y <= 8) ||
                    (x <= 8 && y >= size - 9);
                if (!nearFinder) drawAlignment(m, x - 2, y - 2);
            }
        }
    }

    // Reserve version info (not needed for v < 7)
}

function drawFinder(m, x0, y0) {
    // Outer 7x7
    for (let y = -1; y <= 7; y++) {
        for (let x = -1; x <= 7; x++) {
            const xx = x0 + x, yy = y0 + y;
            const inBounds = xx >= 0 && yy >= 0 && xx < m.size && yy < m.size;
            if (!inBounds) continue;

            const onBorder = x === -1 || y === -1 || x === 7 || y === 7;
            if (onBorder) {
                // separator (light)
                setModule(m, xx, yy, false, true);
            } else {
                const isOuter = x === 0 || y === 0 || x === 6 || y === 6;
                const isInner = x >= 2 && x <= 4 && y >= 2 && y <= 4;
                setModule(m, xx, yy, isOuter || isInner, true);
            }
        }
    }
}

function drawAlignment(m, x0, y0) {
    // 5x5 alignment pattern
    for (let y = 0; y < 5; y++) {
        for (let x = 0; x < 5; x++) {
            const isBorder = x === 0 || y === 0 || x === 4 || y === 4;
            const isCenter = x === 2 && y === 2;
            setModule(m, x0 + x, y0 + y, isBorder || isCenter, true);
        }
    }
}

function alignmentPositions(version) {
    // For v=1: none
    // v=2: [6, 18]
    // v=3: [6, 22]
    // v=4: [6, 26]
    if (version === 1) return [];
    if (version === 2) return [6, 18];
    if (version === 3) return [6, 22];
    if (version === 4) return [6, 26];
    return [];
}

/* ---------------------------- Data placement ---------------------------- */

function qrPlaceCodewords(m, codewords) {
    const size = m.size;
    let bitIndex = 0;

    let x = size - 1;
    let y = size - 1;
    let dir = -1; // up initially

    while (x > 0) {
        if (x === 6) x--; // skip timing column

        for (let i = 0; i < size; i++) {
            const yy = y + dir * i;

            for (let xx = x; xx >= x - 1; xx--) {
                if (m.reserved[yy][xx]) continue;

                const bit = getBitFromCodewords(codewords, bitIndex++);
                m.modules[yy][xx] = bit;
                // do not reserve, data cells are maskable
            }
        }

        y += dir * (size - 1);
        dir *= -1;
        x -= 2;
    }
}

function getBitFromCodewords(codewords, bitIndex) {
    const byteIndex = Math.floor(bitIndex / 8);
    const bitInByte = 7 - (bitIndex % 8);
    if (byteIndex >= codewords.length) return false;
    return ((codewords[byteIndex] >>> bitInByte) & 1) === 1;
}

/* ---------------------------- Masking + format info ---------------------------- */

function qrApplyMask(m, mask) {
    const size = m.size;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            if (m.reserved[y][x]) continue;
            if (maskBit(mask, x, y)) m.modules[y][x] = !m.modules[y][x];
        }
    }
}

function maskBit(mask, x, y) {
    // 8 mask patterns
    switch (mask) {
        case 0: return (x + y) % 2 === 0;
        case 1: return y % 2 === 0;
        case 2: return x % 3 === 0;
        case 3: return (x + y) % 3 === 0;
        case 4: return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
        case 5: return ((x * y) % 2 + (x * y) % 3) === 0;
        case 6: return (((x * y) % 2 + (x * y) % 3) % 2) === 0;
        case 7: return (((x + y) % 2 + (x * y) % 3) % 2) === 0;
        default: return false;
    }
}

function qrWriteFormatInfo(m, mask) {
    // Format info = [EC level][mask] BCH(15,5)
    // EC level bits: L = 01
    const ecBits = 0b01;
    const format = (ecBits << 3) | mask; // 5 bits

    let bits = (format << 10) | bchRemainder(format, 0b10100110111, 10);
    bits ^= 0b101010000010010; // mask

    // Place 15 bits
    // bit 14 is MSB
    const size = m.size;
    const get = (i) => ((bits >>> i) & 1) === 1;

    // Standard mapping for 15 format bits:
    // - (8,0..5), (8,7), (8,8), (7,8..0 excluding 6)
    const positions = [];
    // (8,0..5)
    for (let x = 0; x <= 5; x++) positions.push([x, 8]);
    // (8,7)
    positions.push([7, 8]);
    // (8,8)
    positions.push([8, 8]);
    // (7..0,8) skipping y=6
    for (let y = 7; y >= 0; y--) {
        if (y === 6) continue;
        positions.push([8, y]);
    }

    // Mirror (top-right and bottom-left)
    const positions2 = [];
    // Bits 14..8: Bottom-Left (Vertical, Col 8)
    // Map MSB (14) to (size-1, 8) ... Bit 8 to (size-7, 8)
    for (let y = size - 1; y >= size - 7; y--) positions2.push([8, y]);

    // Bits 7..0: Top-Right (Horizontal, Row 8)
    // Map Bit 7 to (8, size-8) ... Bit 0 to (8, size-1)
    for (let x = size - 8; x <= size - 1; x++) positions2.push([x, 8]);

    for (let i = 0; i < 15; i++) {
        const bit = get(14 - i);
        const [x1, y1] = positions[i];
        m.modules[y1][x1] = bit;
        m.reserved[y1][x1] = true;

        const [x2, y2] = positions2[i];
        m.modules[y2][x2] = bit;
        m.reserved[y2][x2] = true;
    }
}

/* ---------------------------- Penalty scoring (mask selection) ---------------------------- */

function qrPenaltyScore(m) {
    const size = m.size;
    let score = 0;

    // N1: adjacent modules in row/col with same color
    for (let y = 0; y < size; y++) {
        let run = 1;
        for (let x = 1; x < size; x++) {
            if (m.modules[y][x] === m.modules[y][x - 1]) run++;
            else { score += runPenalty(run); run = 1; }
        }
        score += runPenalty(run);
    }
    for (let x = 0; x < size; x++) {
        let run = 1;
        for (let y = 1; y < size; y++) {
            if (m.modules[y][x] === m.modules[y - 1][x]) run++;
            else { score += runPenalty(run); run = 1; }
        }
        score += runPenalty(run);
    }

    // N2: 2x2 blocks
    for (let y = 0; y < size - 1; y++) {
        for (let x = 0; x < size - 1; x++) {
            const a = m.modules[y][x];
            if (a === m.modules[y][x + 1] && a === m.modules[y + 1][x] && a === m.modules[y + 1][x + 1]) {
                score += 3;
            }
        }
    }

    // N3: finder-like patterns in rows/cols (1:1:3:1:1 with 4 light modules)
    const pattern = [1, 0, 1, 1, 1, 0, 1]; // 1011101
    score += finderLikePenalty(m, pattern);

    // N4: balance of dark modules
    let darkCount = 0;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (m.modules[y][x]) darkCount++;
    const total = size * size;
    const k = Math.abs((darkCount * 100 / total) - 50);
    score += Math.floor(k / 5) * 10;

    return score;
}

function runPenalty(run) {
    if (run >= 5) return 3 + (run - 5);
    return 0;
}

function finderLikePenalty(m, pat) {
    const size = m.size;
    let score = 0;

    const checkLine = (getCell, length) => {
        for (let i = 0; i <= length - 7; i++) {
            let match = true;
            for (let j = 0; j < 7; j++) {
                if ((getCell(i + j) ? 1 : 0) !== pat[j]) { match = false; break; }
            }
            if (match) {
                // Check for 4 light modules before or after
                const before = i - 4 >= 0 && [0, 1, 2, 3].every(k => !getCell(i - 1 - k));
                const after = i + 7 + 4 <= length && [0, 1, 2, 3].every(k => !getCell(i + 7 + k));
                if (before || after) score += 40;
            }
        }
    };

    for (let y = 0; y < size; y++) {
        checkLine((x) => m.modules[y][x], size);
    }
    for (let x = 0; x < size; x++) {
        checkLine((y) => m.modules[y][x], size);
    }
    return score;
}

/* ---------------------------- Reed-Solomon (GF(256)) ---------------------------- */

function rsComputeEcc(data, eccLen) {
    const gen = rsGeneratorPoly(eccLen);
    const msg = data.concat(new Array(eccLen).fill(0));

    for (let i = 0; i < data.length; i++) {
        const coef = msg[i];
        if (coef === 0) continue;
        for (let j = 0; j < gen.length; j++) {
            msg[i + j] ^= gfMul(gen[j], coef);
        }
    }
    return msg.slice(msg.length - eccLen);
}

function rsGeneratorPoly(degree) {
    let poly = [1];
    for (let i = 0; i < degree; i++) {
        poly = rsPolyMul(poly, [1, gfPow(2, i)]);
    }
    return poly;
}

function rsPolyMul(p, q) {
    const out = new Array(p.length + q.length - 1).fill(0);
    for (let i = 0; i < p.length; i++) {
        for (let j = 0; j < q.length; j++) {
            out[i + j] ^= gfMul(p[i], q[j]);
        }
    }
    return out;
}

// GF(256) with primitive polynomial 0x11D
const GF_EXP = (() => {
    const exp = new Array(512).fill(0);
    let x = 1;
    for (let i = 0; i < 255; i++) {
        exp[i] = x;
        x <<= 1;
        if (x & 0x100) x ^= 0x11D;
    }
    for (let i = 255; i < 512; i++) exp[i] = exp[i - 255];
    return exp;
})();

const GF_LOG = (() => {
    const log = new Array(256).fill(0);
    for (let i = 0; i < 255; i++) log[GF_EXP[i]] = i;
    return log;
})();

function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function gfPow(a, n) {
    if (n === 0) return 1;
    if (a === 0) return 0;
    return GF_EXP[(GF_LOG[a] * n) % 255];
}

/* ---------------------------- BCH for format info ---------------------------- */

function bchRemainder(value, poly, polyDegree) {
    // value is 5-bit format (ec+mask)
    // poly is 0b10100110111 (degree 10)
    let v = value << polyDegree;
    for (let i = 14; i >= polyDegree; i--) {
        if (v & (1 << i)) v ^= (poly << (i - polyDegree));
    }
    return v & ((1 << polyDegree) - 1);
}

/* ---------------------------- Bit helpers + UTF-8 ---------------------------- */

function pushBits(arr, value, count) {
    for (let i = count - 1; i >= 0; i--) arr.push((value >>> i) & 1);
}

function utf8Bytes(str) {
    const out = [];
    for (let i = 0; i < str.length; i++) {
        let code = str.charCodeAt(i);

        // surrogate pair
        if (code >= 0xD800 && code <= 0xDBFF && i + 1 < str.length) {
            const next = str.charCodeAt(i + 1);
            if (next >= 0xDC00 && next <= 0xDFFF) {
                code = 0x10000 + ((code - 0xD800) << 10) + (next - 0xDC00);
                i++;
            }
        }

        if (code < 0x80) {
            out.push(code);
        } else if (code < 0x800) {
            out.push(0xC0 | (code >> 6));
            out.push(0x80 | (code & 0x3F));
        } else if (code < 0x10000) {
            out.push(0xE0 | (code >> 12));
            out.push(0x80 | ((code >> 6) & 0x3F));
            out.push(0x80 | (code & 0x3F));
        } else {
            out.push(0xF0 | (code >> 18));
            out.push(0x80 | ((code >> 12) & 0x3F));
            out.push(0x80 | ((code >> 6) & 0x3F));
            out.push(0x80 | (code & 0x3F));
        }
    }
    return out;
}

export default qrCanvas;
