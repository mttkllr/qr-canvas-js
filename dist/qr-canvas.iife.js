// qr-canvas-js v1.1.0 | MIT
var QRCanvas = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/qr-canvas.js
  var qr_canvas_exports = {};
  __export(qr_canvas_exports, {
    default: () => qr_canvas_default,
    qrCanvas: () => qrCanvas,
    qrMatrix: () => qrMatrix,
    utf8Bytes: () => utf8Bytes
  });
  function qrCanvas(text, opts = {}) {
    if (typeof text !== "string") throw new TypeError("text must be a string");
    const margin = opts.margin ?? 4;
    if (margin < 0) throw new RangeError("margin must be >= 0");
    const dark = opts.dark ?? "#000";
    const light = opts.light ?? "#fff";
    const qr = qrMake(text);
    const size = qr.size;
    let scale = opts.scale ?? 6;
    if (opts.scale !== void 0 && opts.scale <= 0) throw new RangeError("scale must be > 0");
    let px;
    if (opts.width) {
      if (opts.width <= 0) throw new RangeError("width must be > 0");
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
  function qrMatrix(text) {
    if (typeof text !== "string") throw new TypeError("text must be a string");
    const qr = qrMake(text);
    return { size: qr.size, modules: qr.modules };
  }
  function qrMake(text) {
    const dataBytes = utf8Bytes(text);
    const versions = [
      { v: 1, size: 21, totalDataCW: 19, capacity: 17, eccPerBlock: 7, g1Blocks: 1, g1DataCW: 19, g2Blocks: 0, g2DataCW: 0 },
      { v: 2, size: 25, totalDataCW: 34, capacity: 32, eccPerBlock: 10, g1Blocks: 1, g1DataCW: 34, g2Blocks: 0, g2DataCW: 0 },
      { v: 3, size: 29, totalDataCW: 55, capacity: 53, eccPerBlock: 15, g1Blocks: 1, g1DataCW: 55, g2Blocks: 0, g2DataCW: 0 },
      { v: 4, size: 33, totalDataCW: 80, capacity: 78, eccPerBlock: 20, g1Blocks: 1, g1DataCW: 80, g2Blocks: 0, g2DataCW: 0 },
      { v: 5, size: 37, totalDataCW: 108, capacity: 106, eccPerBlock: 26, g1Blocks: 1, g1DataCW: 108, g2Blocks: 0, g2DataCW: 0 },
      { v: 6, size: 41, totalDataCW: 136, capacity: 134, eccPerBlock: 18, g1Blocks: 2, g1DataCW: 68, g2Blocks: 0, g2DataCW: 0 },
      { v: 7, size: 45, totalDataCW: 156, capacity: 154, eccPerBlock: 20, g1Blocks: 2, g1DataCW: 78, g2Blocks: 0, g2DataCW: 0 },
      { v: 8, size: 49, totalDataCW: 194, capacity: 192, eccPerBlock: 24, g1Blocks: 2, g1DataCW: 97, g2Blocks: 0, g2DataCW: 0 },
      { v: 9, size: 53, totalDataCW: 232, capacity: 230, eccPerBlock: 30, g1Blocks: 2, g1DataCW: 116, g2Blocks: 0, g2DataCW: 0 },
      { v: 10, size: 57, totalDataCW: 274, capacity: 271, eccPerBlock: 18, g1Blocks: 2, g1DataCW: 68, g2Blocks: 2, g2DataCW: 69 }
    ];
    let ver = null;
    for (const cand of versions) {
      if (dataBytes.length <= cand.capacity) {
        ver = cand;
        break;
      }
    }
    if (!ver) {
      throw new Error("Input too long (max ~271 bytes at version 10-L).");
    }
    const bits = [];
    pushBits(bits, 4, 4);
    const countBits = ver.v <= 9 ? 8 : 16;
    pushBits(bits, dataBytes.length, countBits);
    for (const b of dataBytes) pushBits(bits, b, 8);
    const totalDataBits = ver.totalDataCW * 8;
    const remaining = totalDataBits - bits.length;
    if (remaining > 0) pushBits(bits, 0, Math.min(4, remaining));
    while (bits.length % 8 !== 0) bits.push(0);
    const dataCodewords = [];
    for (let i = 0; i < bits.length; i += 8) {
      let cw = 0;
      for (let j = 0; j < 8; j++) cw = cw << 1 | bits[i + j];
      dataCodewords.push(cw);
    }
    const pads = [236, 17];
    let pi = 0;
    while (dataCodewords.length < ver.totalDataCW) {
      dataCodewords.push(pads[pi++ & 1]);
    }
    const codewords = computeInterleavedCodewords(dataCodewords, ver);
    const m = qrInitMatrix(ver.size);
    qrDrawFunctionPatterns(m, ver.v);
    qrPlaceCodewords(m, codewords);
    let bestMask = 0;
    let bestScore = Infinity;
    let bestModules = null;
    for (let mask = 0; mask < 8; mask++) {
      const trial = qrCloneMatrix(m);
      qrApplyMask(trial, mask);
      qrWriteFormatInfo(trial, mask);
      if (ver.v >= 7) qrWriteVersionInfo(trial, ver.v);
      const score = qrPenaltyScore(trial);
      if (score < bestScore) {
        bestScore = score;
        bestMask = mask;
        bestModules = trial;
      }
    }
    return { size: ver.size, modules: bestModules.modules };
  }
  function computeInterleavedCodewords(dataCodewords, ver) {
    const totalBlocks = ver.g1Blocks + ver.g2Blocks;
    if (totalBlocks === 1) {
      const ecc = rsComputeEcc(dataCodewords, ver.eccPerBlock);
      return dataCodewords.concat(ecc);
    }
    const blocks = [];
    let offset = 0;
    for (let i = 0; i < ver.g1Blocks; i++) {
      blocks.push(dataCodewords.slice(offset, offset + ver.g1DataCW));
      offset += ver.g1DataCW;
    }
    for (let i = 0; i < ver.g2Blocks; i++) {
      blocks.push(dataCodewords.slice(offset, offset + ver.g2DataCW));
      offset += ver.g2DataCW;
    }
    const eccBlocks = blocks.map((block) => rsComputeEcc(block, ver.eccPerBlock));
    const maxDataLen = Math.max(ver.g1DataCW, ver.g2DataCW || 0);
    const interleavedData = [];
    for (let i = 0; i < maxDataLen; i++) {
      for (let b = 0; b < totalBlocks; b++) {
        if (i < blocks[b].length) {
          interleavedData.push(blocks[b][i]);
        }
      }
    }
    const interleavedEcc = [];
    for (let i = 0; i < ver.eccPerBlock; i++) {
      for (let b = 0; b < totalBlocks; b++) {
        interleavedEcc.push(eccBlocks[b][i]);
      }
    }
    return interleavedData.concat(interleavedEcc);
  }
  function qrInitMatrix(size) {
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
  function qrDrawFunctionPatterns(m, version) {
    const size = m.size;
    drawFinder(m, 0, 0);
    drawFinder(m, size - 7, 0);
    drawFinder(m, 0, size - 7);
    for (let i = 8; i < size - 8; i++) {
      setModule(m, i, 6, i % 2 === 0, true);
      setModule(m, 6, i, i % 2 === 0, true);
    }
    setModule(m, 8, 4 * version + 9, true, true);
    for (let i = 0; i < 9; i++) {
      if (i !== 6) {
        m.reserved[8][i] = true;
        m.reserved[i][8] = true;
      }
    }
    for (let i = 0; i < 8; i++) m.reserved[i][size - 8] = true;
    for (let i = 0; i < 8; i++) m.reserved[size - 8][i] = true;
    for (let x = size - 8; x < size; x++) m.reserved[8][x] = true;
    for (let y = size - 7; y < size; y++) m.reserved[y][8] = true;
    const alignPos = alignmentPositions(version);
    if (alignPos.length) {
      for (const y of alignPos) {
        for (const x of alignPos) {
          const nearFinder = x <= 8 && y <= 8 || x >= size - 9 && y <= 8 || x <= 8 && y >= size - 9;
          if (!nearFinder) drawAlignment(m, x - 2, y - 2);
        }
      }
    }
    if (version >= 7) {
      for (let x = 0; x < 6; x++) {
        for (let y = size - 11; y <= size - 9; y++) {
          m.reserved[y][x] = true;
        }
      }
      for (let x = size - 11; x <= size - 9; x++) {
        for (let y = 0; y < 6; y++) {
          m.reserved[y][x] = true;
        }
      }
    }
  }
  function drawFinder(m, x0, y0) {
    for (let y = -1; y <= 7; y++) {
      for (let x = -1; x <= 7; x++) {
        const xx = x0 + x, yy = y0 + y;
        const inBounds = xx >= 0 && yy >= 0 && xx < m.size && yy < m.size;
        if (!inBounds) continue;
        const onBorder = x === -1 || y === -1 || x === 7 || y === 7;
        if (onBorder) {
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
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        const isBorder = x === 0 || y === 0 || x === 4 || y === 4;
        const isCenter = x === 2 && y === 2;
        setModule(m, x0 + x, y0 + y, isBorder || isCenter, true);
      }
    }
  }
  function alignmentPositions(version) {
    if (version === 1) return [];
    const size = version * 4 + 17;
    const numAlign = Math.floor(version / 7) + 2;
    const step = Math.floor((version * 8 + numAlign * 3 + 5) / (numAlign * 4 - 4)) * 2;
    const result = [6];
    for (let pos = size - 7; result.length < numAlign; pos -= step)
      result.splice(1, 0, pos);
    return result;
  }
  function qrPlaceCodewords(m, codewords) {
    const size = m.size;
    let bitIndex = 0;
    let x = size - 1;
    let y = size - 1;
    let dir = -1;
    while (x > 0) {
      if (x === 6) x--;
      for (let i = 0; i < size; i++) {
        const yy = y + dir * i;
        for (let xx = x; xx >= x - 1; xx--) {
          if (m.reserved[yy][xx]) continue;
          const bit = getBitFromCodewords(codewords, bitIndex++);
          m.modules[yy][xx] = bit;
        }
      }
      y += dir * (size - 1);
      dir *= -1;
      x -= 2;
    }
  }
  function getBitFromCodewords(codewords, bitIndex) {
    const byteIndex = Math.floor(bitIndex / 8);
    const bitInByte = 7 - bitIndex % 8;
    if (byteIndex >= codewords.length) return false;
    return (codewords[byteIndex] >>> bitInByte & 1) === 1;
  }
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
    switch (mask) {
      case 0:
        return (x + y) % 2 === 0;
      case 1:
        return y % 2 === 0;
      case 2:
        return x % 3 === 0;
      case 3:
        return (x + y) % 3 === 0;
      case 4:
        return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
      case 5:
        return x * y % 2 + x * y % 3 === 0;
      case 6:
        return (x * y % 2 + x * y % 3) % 2 === 0;
      case 7:
        return ((x + y) % 2 + x * y % 3) % 2 === 0;
      default:
        return false;
    }
  }
  function qrWriteFormatInfo(m, mask) {
    const ecBits = 1;
    const format = ecBits << 3 | mask;
    let bits = format << 10 | bchRemainder(format, 1335, 10);
    bits ^= 21522;
    const size = m.size;
    const get = (i) => (bits >>> i & 1) === 1;
    const positions = [];
    for (let x = 0; x <= 5; x++) positions.push([x, 8]);
    positions.push([7, 8]);
    positions.push([8, 8]);
    for (let y = 7; y >= 0; y--) {
      if (y === 6) continue;
      positions.push([8, y]);
    }
    const positions2 = [];
    for (let y = size - 1; y >= size - 7; y--) positions2.push([8, y]);
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
  function qrWriteVersionInfo(m, version) {
    let bits = version << 12 | bchRemainder(version, 7973, 12);
    const size = m.size;
    for (let i = 0; i < 18; i++) {
      const bit = (bits >>> i & 1) === 1;
      const row = Math.floor(i / 3);
      const col = size - 11 + i % 3;
      m.modules[row][col] = bit;
      m.reserved[row][col] = true;
      m.modules[col][row] = bit;
      m.reserved[col][row] = true;
    }
  }
  function qrPenaltyScore(m) {
    const size = m.size;
    let score = 0;
    for (let y = 0; y < size; y++) {
      let run = 1;
      for (let x = 1; x < size; x++) {
        if (m.modules[y][x] === m.modules[y][x - 1]) run++;
        else {
          score += runPenalty(run);
          run = 1;
        }
      }
      score += runPenalty(run);
    }
    for (let x = 0; x < size; x++) {
      let run = 1;
      for (let y = 1; y < size; y++) {
        if (m.modules[y][x] === m.modules[y - 1][x]) run++;
        else {
          score += runPenalty(run);
          run = 1;
        }
      }
      score += runPenalty(run);
    }
    for (let y = 0; y < size - 1; y++) {
      for (let x = 0; x < size - 1; x++) {
        const a = m.modules[y][x];
        if (a === m.modules[y][x + 1] && a === m.modules[y + 1][x] && a === m.modules[y + 1][x + 1]) {
          score += 3;
        }
      }
    }
    const pattern = [1, 0, 1, 1, 1, 0, 1];
    score += finderLikePenalty(m, pattern);
    let darkCount = 0;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (m.modules[y][x]) darkCount++;
    const total = size * size;
    const k = Math.abs(darkCount * 100 / total - 50);
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
          if ((getCell(i + j) ? 1 : 0) !== pat[j]) {
            match = false;
            break;
          }
        }
        if (match) {
          const before = i - 4 >= 0 && [0, 1, 2, 3].every((k) => !getCell(i - 1 - k));
          const after = i + 7 + 4 <= length && [0, 1, 2, 3].every((k) => !getCell(i + 7 + k));
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
  var GF_EXP = (() => {
    const exp = new Array(512).fill(0);
    let x = 1;
    for (let i = 0; i < 255; i++) {
      exp[i] = x;
      x <<= 1;
      if (x & 256) x ^= 285;
    }
    for (let i = 255; i < 512; i++) exp[i] = exp[i - 255];
    return exp;
  })();
  var GF_LOG = (() => {
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
    return GF_EXP[GF_LOG[a] * n % 255];
  }
  function bchRemainder(value, poly, polyDegree) {
    let v = value << polyDegree;
    for (let i = 17; i >= polyDegree; i--) {
      if (v & 1 << i) v ^= poly << i - polyDegree;
    }
    return v & (1 << polyDegree) - 1;
  }
  function pushBits(arr, value, count) {
    for (let i = count - 1; i >= 0; i--) arr.push(value >>> i & 1);
  }
  function utf8Bytes(str) {
    const out = [];
    for (let i = 0; i < str.length; i++) {
      let code = str.charCodeAt(i);
      if (code >= 55296 && code <= 56319 && i + 1 < str.length) {
        const next = str.charCodeAt(i + 1);
        if (next >= 56320 && next <= 57343) {
          code = 65536 + (code - 55296 << 10) + (next - 56320);
          i++;
        }
      }
      if (code < 128) {
        out.push(code);
      } else if (code < 2048) {
        out.push(192 | code >> 6);
        out.push(128 | code & 63);
      } else if (code < 65536) {
        out.push(224 | code >> 12);
        out.push(128 | code >> 6 & 63);
        out.push(128 | code & 63);
      } else {
        out.push(240 | code >> 18);
        out.push(128 | code >> 12 & 63);
        out.push(128 | code >> 6 & 63);
        out.push(128 | code & 63);
      }
    }
    return out;
  }
  var qr_canvas_default = qrCanvas;
  return __toCommonJS(qr_canvas_exports);
})();
