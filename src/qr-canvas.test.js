import { describe, it, expect } from "vitest";
import { qrMatrix, utf8Bytes } from "./qr-canvas.js";
import jsQR from "jsqr";

/**
 * Convert a qrMatrix result into RGBA image data suitable for jsQR.
 * Uses scale=4, margin=4 for reliable decoding.
 */
function matrixToImageData(qr, margin = 4, scale = 4) {
    const totalSize = (qr.size + margin * 2) * scale;
    const data = new Uint8ClampedArray(totalSize * totalSize * 4);

    // Fill white
    data.fill(255);

    // Draw dark modules (scaled)
    for (let y = 0; y < qr.size; y++) {
        for (let x = 0; x < qr.size; x++) {
            if (qr.modules[y][x]) {
                for (let sy = 0; sy < scale; sy++) {
                    for (let sx = 0; sx < scale; sx++) {
                        const px = ((y + margin) * scale + sy) * totalSize + ((x + margin) * scale + sx);
                        data[px * 4] = 0;     // R
                        data[px * 4 + 1] = 0; // G
                        data[px * 4 + 2] = 0; // B
                        // A stays 255
                    }
                }
            }
        }
    }

    return { data, width: totalSize, height: totalSize };
}

/**
 * Encode text as QR, then decode with jsQR and return decoded string.
 */
function roundTrip(text) {
    const qr = qrMatrix(text);
    const img = matrixToImageData(qr);
    const result = jsQR(img.data, img.width, img.height);
    if (!result) throw new Error("jsQR failed to decode QR code");
    return result.data;
}

// Expected sizes per version
const VERSION_SIZES = {
    1: 21, 2: 25, 3: 29, 4: 33, 5: 37,
    6: 41, 7: 45, 8: 49, 9: 53, 10: 57,
};

// Capacities per version (Level L, Byte mode)
const VERSION_CAPACITIES = {
    1: 17, 2: 32, 3: 53, 4: 78, 5: 106,
    6: 134, 7: 154, 8: 192, 9: 230, 10: 271,
};

describe("qrMatrix", () => {
    it("returns correct size for each version", () => {
        // Test with strings that force specific versions
        const testStrings = {
            1: "Hello",                      // 5 bytes -> v1
            2: "Hello, World! This is a test", // 28 bytes -> v2
        };

        for (const [ver, text] of Object.entries(testStrings)) {
            const qr = qrMatrix(text);
            expect(qr.size).toBe(VERSION_SIZES[ver]);
        }
    });

    it("returns a valid boolean matrix", () => {
        const qr = qrMatrix("Test");
        expect(qr.modules.length).toBe(qr.size);
        for (const row of qr.modules) {
            expect(row.length).toBe(qr.size);
            for (const cell of row) {
                expect(typeof cell).toBe("boolean");
            }
        }
    });

    it("throws TypeError for non-string input", () => {
        expect(() => qrMatrix(123)).toThrow(TypeError);
        expect(() => qrMatrix(null)).toThrow(TypeError);
        expect(() => qrMatrix(undefined)).toThrow(TypeError);
    });

    it("throws Error when input exceeds capacity", () => {
        const tooLong = "x".repeat(272);
        expect(() => qrMatrix(tooLong)).toThrow(/too long/i);
    });
});

describe("round-trip encode/decode", () => {
    // Generate test strings that fit each version
    function stringForVersion(v) {
        const prevCap = v > 1 ? VERSION_CAPACITIES[v - 1] : 0;
        // Create a string just above previous version's capacity (or short for v1)
        const len = v === 1 ? 5 : prevCap + 1;
        return "A".repeat(len);
    }

    for (let v = 1; v <= 10; v++) {
        it(`version ${v}: round-trip succeeds`, () => {
            const text = stringForVersion(v);
            const decoded = roundTrip(text);
            expect(decoded).toBe(text);
        });
    }

    it("exact capacity boundary for each version", () => {
        for (let v = 1; v <= 10; v++) {
            const text = "B".repeat(VERSION_CAPACITIES[v]);
            const decoded = roundTrip(text);
            expect(decoded).toBe(text);
        }
    });

    it("1 byte over capacity throws", () => {
        expect(() => qrMatrix("x".repeat(272))).toThrow();
    });
});

describe("UTF-8 encoding", () => {
    it("ASCII characters", () => {
        expect(roundTrip("Hello")).toBe("Hello");
    });

    it("2-byte UTF-8 (Latin characters)", () => {
        expect(roundTrip("café")).toBe("café");
    });

    it("3-byte UTF-8 (CJK characters)", () => {
        expect(roundTrip("你好")).toBe("你好");
    });

    it("4-byte UTF-8 (emoji)", () => {
        expect(roundTrip("Hi 👋")).toBe("Hi 👋");
    });

    it("mixed UTF-8", () => {
        expect(roundTrip("Hello café 你好 👋")).toBe("Hello café 你好 👋");
    });

    it("empty string", () => {
        expect(roundTrip("")).toBe("");
    });
});

describe("utf8Bytes", () => {
    it("encodes ASCII correctly", () => {
        expect(utf8Bytes("A")).toEqual([0x41]);
        expect(utf8Bytes("AB")).toEqual([0x41, 0x42]);
    });

    it("encodes 2-byte characters", () => {
        // é = U+00E9 -> 0xC3 0xA9
        expect(utf8Bytes("é")).toEqual([0xC3, 0xA9]);
    });

    it("encodes 3-byte characters", () => {
        // 你 = U+4F60 -> 0xE4 0xBD 0xA0
        expect(utf8Bytes("你")).toEqual([0xE4, 0xBD, 0xA0]);
    });

    it("encodes 4-byte characters (emoji)", () => {
        // 👋 = U+1F44B -> 0xF0 0x9F 0x91 0x8B
        expect(utf8Bytes("👋")).toEqual([0xF0, 0x9F, 0x91, 0x8B]);
    });

    it("encodes empty string", () => {
        expect(utf8Bytes("")).toEqual([]);
    });
});

describe("URLs and real-world strings", () => {
    it("short URL", () => {
        expect(roundTrip("https://example.com")).toBe("https://example.com");
    });

    it("longer URL (version 3+)", () => {
        const url = "https://example.com/path/to/resource?query=value&other=123";
        expect(roundTrip(url)).toBe(url);
    });

    it("long URL (version 7+)", () => {
        const url = "https://example.com/very/long/path/to/some/deeply/nested/resource?with=many&query=parameters&that=make&the=url&quite=long&indeed=true&and=more&stuff=here";
        expect(roundTrip(url)).toBe(url);
    });
});
