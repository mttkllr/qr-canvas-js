/**
 * qr-canvas-js v1.0.0
 * Minimal, zero-dependency QR code generator for canvas
 * https://github.com/mttkllr/qr-canvas-js
 * @license MIT
 */
var QRCanvas = (function() {
    'use strict';

    function qrCanvas(text, opts) {
        opts = opts || {};
        var margin = opts.margin != null ? opts.margin : 4;
        var dark = opts.dark || "#000";
        var light = opts.light || "#fff";

        var qr = qrMake(text);
        var size = qr.size;

        var scale = opts.scale != null ? opts.scale : 6;
        var px;

        if (opts.width) {
            px = opts.width;
            scale = px / (size + margin * 2);
        } else {
            px = (size + margin * 2) * scale;
        }

        var canvas = document.createElement("canvas");
        canvas.width = px;
        canvas.height = px;

        var ctx = canvas.getContext("2d");
        ctx.fillStyle = light;
        ctx.fillRect(0, 0, px, px);

        ctx.fillStyle = dark;
        for (var y = 0; y < size; y++) {
            for (var x = 0; x < size; x++) {
                if (qr.modules[y][x]) {
                    var xStart = Math.floor((x + margin) * scale);
                    var yStart = Math.floor((y + margin) * scale);
                    var xEnd = Math.floor((x + margin + 1) * scale);
                    var yEnd = Math.floor((y + margin + 1) * scale);
                    ctx.fillRect(xStart, yStart, xEnd - xStart, yEnd - yStart);
                }
            }
        }
        return canvas;
    }

    function qrMake(text) {
        var dataBytes = utf8Bytes(text);
        var versions = [
            { v: 1, size: 21, dataCodewords: 19, dataBytesCapacity: 17, eccCodewords: 7 },
            { v: 2, size: 25, dataCodewords: 34, dataBytesCapacity: 32, eccCodewords: 10 },
            { v: 3, size: 29, dataCodewords: 55, dataBytesCapacity: 53, eccCodewords: 15 },
            { v: 4, size: 33, dataCodewords: 80, dataBytesCapacity: 78, eccCodewords: 20 },
        ];

        var ver = null;
        for (var i = 0; i < versions.length; i++) {
            if (dataBytes.length <= versions[i].dataBytesCapacity) {
                ver = versions[i];
                break;
            }
        }
        if (!ver) throw new Error("Input too long (max ~78 bytes)");

        var bits = [];
        pushBits(bits, 4, 4);
        pushBits(bits, dataBytes.length, 8);
        for (var i = 0; i < dataBytes.length; i++) pushBits(bits, dataBytes[i], 8);

        var totalDataBits = ver.dataCodewords * 8;
        var remaining = totalDataBits - bits.length;
        if (remaining > 0) pushBits(bits, 0, Math.min(4, remaining));
        while (bits.length % 8 !== 0) bits.push(0);

        var dataCodewords = [];
        for (var i = 0; i < bits.length; i += 8) {
            var cw = 0;
            for (var j = 0; j < 8; j++) cw = (cw << 1) | bits[i + j];
            dataCodewords.push(cw);
        }

        var pads = [0xEC, 0x11], pi = 0;
        while (dataCodewords.length < ver.dataCodewords) dataCodewords.push(pads[pi++ & 1]);

        var ecc = rsComputeEcc(dataCodewords, ver.eccCodewords);
        var codewords = dataCodewords.concat(ecc);

        var m = qrInitMatrix(ver.size);
        qrDrawFunctionPatterns(m, ver.v);
        qrPlaceCodewords(m, codewords);

        var bestMask = 0, bestScore = Infinity, bestModules = null;
        for (var mask = 0; mask < 8; mask++) {
            var trial = qrCloneMatrix(m);
            qrApplyMask(trial, mask);
            qrWriteFormatInfo(trial, mask);
            var score = qrPenaltyScore(trial);
            if (score < bestScore) { bestScore = score; bestMask = mask; bestModules = trial; }
        }

        return { size: ver.size, modules: bestModules.modules };
    }

    function qrInitMatrix(size) {
        var modules = [], reserved = [];
        for (var i = 0; i < size; i++) {
            modules.push(new Array(size).fill(false));
            reserved.push(new Array(size).fill(false));
        }
        return { size: size, modules: modules, reserved: reserved };
    }

    function qrCloneMatrix(m) {
        var modules = [], reserved = [];
        for (var y = 0; y < m.size; y++) {
            modules.push(m.modules[y].slice());
            reserved.push(m.reserved[y].slice());
        }
        return { size: m.size, modules: modules, reserved: reserved };
    }

    function setModule(m, x, y, dark, reserve) {
        if (x < 0 || y < 0 || x >= m.size || y >= m.size) return;
        m.modules[y][x] = !!dark;
        if (reserve !== false) m.reserved[y][x] = true;
    }

    function qrDrawFunctionPatterns(m, version) {
        var size = m.size;
        drawFinder(m, 0, 0); drawFinder(m, size - 7, 0); drawFinder(m, 0, size - 7);
        for (var i = 8; i < size - 8; i++) { setModule(m, i, 6, i % 2 === 0); setModule(m, 6, i, i % 2 === 0); }
        setModule(m, 8, 4 * version + 9, true);
        for (var i = 0; i < 9; i++) { if (i !== 6) { m.reserved[8][i] = true; m.reserved[i][8] = true; } }
        for (var i = 0; i < 8; i++) { m.reserved[i][size - 8] = true; m.reserved[size - 8][i] = true; }
        for (var x = size - 8; x < size; x++) m.reserved[8][x] = true;
        for (var y = size - 7; y < size; y++) m.reserved[y][8] = true;
        var alignPos = version === 1 ? [] : version === 2 ? [6, 18] : version === 3 ? [6, 22] : [6, 26];
        for (var i = 0; i < alignPos.length; i++) {
            for (var j = 0; j < alignPos.length; j++) {
                var ay = alignPos[i], ax = alignPos[j];
                if (!((ax <= 8 && ay <= 8) || (ax >= size - 9 && ay <= 8) || (ax <= 8 && ay >= size - 9)))
                    drawAlignment(m, ax - 2, ay - 2);
            }
        }
    }

    function drawFinder(m, x0, y0) {
        for (var y = -1; y <= 7; y++) {
            for (var x = -1; x <= 7; x++) {
                var xx = x0 + x, yy = y0 + y;
                if (xx < 0 || yy < 0 || xx >= m.size || yy >= m.size) continue;
                var onBorder = x === -1 || y === -1 || x === 7 || y === 7;
                if (onBorder) setModule(m, xx, yy, false);
                else setModule(m, xx, yy, x === 0 || y === 0 || x === 6 || y === 6 || (x >= 2 && x <= 4 && y >= 2 && y <= 4));
            }
        }
    }

    function drawAlignment(m, x0, y0) {
        for (var y = 0; y < 5; y++) for (var x = 0; x < 5; x++)
            setModule(m, x0 + x, y0 + y, x === 0 || y === 0 || x === 4 || y === 4 || (x === 2 && y === 2));
    }

    function qrPlaceCodewords(m, codewords) {
        var size = m.size, bitIndex = 0, x = size - 1, y = size - 1, dir = -1;
        while (x > 0) {
            if (x === 6) x--;
            for (var i = 0; i < size; i++) {
                var yy = y + dir * i;
                for (var xx = x; xx >= x - 1; xx--) {
                    if (m.reserved[yy][xx]) continue;
                    var byteIdx = Math.floor(bitIndex / 8), bitInByte = 7 - (bitIndex % 8);
                    m.modules[yy][xx] = byteIdx < codewords.length && ((codewords[byteIdx] >>> bitInByte) & 1) === 1;
                    bitIndex++;
                }
            }
            y += dir * (size - 1); dir *= -1; x -= 2;
        }
    }

    function qrApplyMask(m, mask) {
        for (var y = 0; y < m.size; y++) for (var x = 0; x < m.size; x++)
            if (!m.reserved[y][x] && maskBit(mask, x, y)) m.modules[y][x] = !m.modules[y][x];
    }

    function maskBit(mask, x, y) {
        switch (mask) {
            case 0: return (x + y) % 2 === 0;
            case 1: return y % 2 === 0;
            case 2: return x % 3 === 0;
            case 3: return (x + y) % 3 === 0;
            case 4: return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
            case 5: return ((x * y) % 2 + (x * y) % 3) === 0;
            case 6: return (((x * y) % 2 + (x * y) % 3) % 2) === 0;
            case 7: return (((x + y) % 2 + (x * y) % 3) % 2) === 0;
        }
        return false;
    }

    function qrWriteFormatInfo(m, mask) {
        var format = (1 << 3) | mask;
        var bits = (format << 10) | bchRemainder(format, 0x537, 10);
        bits ^= 0x5412;
        var size = m.size;
        var pos1 = [[0,8],[1,8],[2,8],[3,8],[4,8],[5,8],[7,8],[8,8],[8,7],[8,5],[8,4],[8,3],[8,2],[8,1],[8,0]];
        var pos2 = [];
        for (var y = size - 1; y >= size - 7; y--) pos2.push([8, y]);
        for (var x = size - 8; x < size; x++) pos2.push([x, 8]);
        for (var i = 0; i < 15; i++) {
            var bit = ((bits >>> (14 - i)) & 1) === 1;
            m.modules[pos1[i][1]][pos1[i][0]] = bit; m.reserved[pos1[i][1]][pos1[i][0]] = true;
            m.modules[pos2[i][1]][pos2[i][0]] = bit; m.reserved[pos2[i][1]][pos2[i][0]] = true;
        }
    }

    function qrPenaltyScore(m) {
        var size = m.size, score = 0;
        for (var y = 0; y < size; y++) { var run = 1; for (var x = 1; x < size; x++) { if (m.modules[y][x] === m.modules[y][x-1]) run++; else { if (run >= 5) score += 3 + run - 5; run = 1; } } if (run >= 5) score += 3 + run - 5; }
        for (var x = 0; x < size; x++) { var run = 1; for (var y = 1; y < size; y++) { if (m.modules[y][x] === m.modules[y-1][x]) run++; else { if (run >= 5) score += 3 + run - 5; run = 1; } } if (run >= 5) score += 3 + run - 5; }
        for (var y = 0; y < size - 1; y++) for (var x = 0; x < size - 1; x++) { var a = m.modules[y][x]; if (a === m.modules[y][x+1] && a === m.modules[y+1][x] && a === m.modules[y+1][x+1]) score += 3; }
        var dark = 0; for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) if (m.modules[y][x]) dark++;
        score += Math.floor(Math.abs((dark * 100 / (size * size)) - 50) / 5) * 10;
        return score;
    }

    function bchRemainder(value, poly, deg) {
        var v = value << deg;
        for (var i = 14; i >= deg; i--) if (v & (1 << i)) v ^= (poly << (i - deg));
        return v & ((1 << deg) - 1);
    }

    var GF_EXP = [], GF_LOG = new Array(256).fill(0);
    (function() { var x = 1; for (var i = 0; i < 255; i++) { GF_EXP[i] = x; x <<= 1; if (x & 0x100) x ^= 0x11D; } for (var i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255]; for (var i = 0; i < 255; i++) GF_LOG[GF_EXP[i]] = i; })();

    function gfMul(a, b) { return (a === 0 || b === 0) ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]]; }
    function gfPow(a, n) { return n === 0 ? 1 : a === 0 ? 0 : GF_EXP[(GF_LOG[a] * n) % 255]; }

    function rsComputeEcc(data, eccLen) {
        var gen = [1];
        for (var i = 0; i < eccLen; i++) {
            var newGen = new Array(gen.length + 1).fill(0);
            for (var j = 0; j < gen.length; j++) { newGen[j] ^= gen[j]; newGen[j + 1] ^= gfMul(gen[j], gfPow(2, i)); }
            gen = newGen;
        }
        var msg = data.concat(new Array(eccLen).fill(0));
        for (var i = 0; i < data.length; i++) {
            var coef = msg[i]; if (coef === 0) continue;
            for (var j = 0; j < gen.length; j++) msg[i + j] ^= gfMul(gen[j], coef);
        }
        return msg.slice(msg.length - eccLen);
    }

    function pushBits(arr, value, count) { for (var i = count - 1; i >= 0; i--) arr.push((value >>> i) & 1); }

    function utf8Bytes(str) {
        var out = [];
        for (var i = 0; i < str.length; i++) {
            var code = str.charCodeAt(i);
            if (code >= 0xD800 && code <= 0xDBFF && i + 1 < str.length) {
                var next = str.charCodeAt(i + 1);
                if (next >= 0xDC00 && next <= 0xDFFF) { code = 0x10000 + ((code - 0xD800) << 10) + (next - 0xDC00); i++; }
            }
            if (code < 0x80) out.push(code);
            else if (code < 0x800) { out.push(0xC0 | (code >> 6)); out.push(0x80 | (code & 0x3F)); }
            else if (code < 0x10000) { out.push(0xE0 | (code >> 12)); out.push(0x80 | ((code >> 6) & 0x3F)); out.push(0x80 | (code & 0x3F)); }
            else { out.push(0xF0 | (code >> 18)); out.push(0x80 | ((code >> 12) & 0x3F)); out.push(0x80 | ((code >> 6) & 0x3F)); out.push(0x80 | (code & 0x3F)); }
        }
        return out;
    }

    return { qrCanvas: qrCanvas };
})();
