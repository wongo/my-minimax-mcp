import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { writeFile, unlink } from "node:fs/promises";
import { detectMimeType, toBase64DataUrl } from "../src/utils/image.js";

describe("image utilities", () => {
  describe("detectMimeType", () => {
    it("returns correct MIME for .jpg", () => {
      assert.strictEqual(detectMimeType("photo.jpg"), "image/jpeg");
    });

    it("returns correct MIME for .jpeg", () => {
      assert.strictEqual(detectMimeType("photo.jpeg"), "image/jpeg");
    });

    it("returns correct MIME for .png", () => {
      assert.strictEqual(detectMimeType("image.png"), "image/png");
    });

    it("returns correct MIME for .webp", () => {
      assert.strictEqual(detectMimeType("image.webp"), "image/webp");
    });

    it("throws for unsupported format", () => {
      assert.throws(
        () => detectMimeType("file.gif"),
        /Unsupported image format/,
      );
    });

    it("throws for .bmp format", () => {
      assert.throws(
        () => detectMimeType("file.bmp"),
        /Unsupported image format/,
      );
    });
  });

  describe("toBase64DataUrl", () => {
    it("passes through existing data URLs", async () => {
      const input = "data:image/png;base64,abc123";
      const result = await toBase64DataUrl(input);
      assert.strictEqual(result, input);
    });

    it("converts local PNG file to base64 data URL", async () => {
      const tempPath = "/tmp/test-image-utils.png";
      const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

      try {
        await writeFile(tempPath, pngBytes);
        const result = await toBase64DataUrl(tempPath);
        assert.ok(result.startsWith("data:image/png;base64,"));
        const base64Part = result.split(",")[1];
        assert.strictEqual(Buffer.from(base64Part, "base64").toString("hex"), pngBytes.toString("hex"));
      } finally {
        await unlink(tempPath).catch(() => {});
      }
    });

    it("converts local JPEG file to base64 data URL", async () => {
      const tempPath = "/tmp/test-image-utils.jpg";
      const jpgBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

      try {
        await writeFile(tempPath, jpgBytes);
        const result = await toBase64DataUrl(tempPath);
        assert.ok(result.startsWith("data:image/jpeg;base64,"));
      } finally {
        await unlink(tempPath).catch(() => {});
      }
    });

    it("strips @ prefix from file paths", async () => {
      const tempPath = "/tmp/test-image-utils-at.png";
      const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

      try {
        await writeFile(tempPath, pngBytes);
        const result = await toBase64DataUrl("@/tmp/test-image-utils-at.png");
        assert.ok(result.startsWith("data:image/png;base64,"));
      } finally {
        await unlink(tempPath).catch(() => {});
      }
    });

    it("throws for files exceeding 20MB", async () => {
      const tempPath = "/tmp/test-oversized.png";

      try {
        const largeBuffer = Buffer.alloc(21 * 1024 * 1024);
        await writeFile(tempPath, largeBuffer);

        await assert.rejects(
          () => toBase64DataUrl(tempPath),
          /Image exceeds 20MB limit/,
        );
      } finally {
        await unlink(tempPath).catch(() => {});
      }
    });

    it("throws for unsupported local file format", async () => {
      const tempPath = "/tmp/test-image-utils.gif";
      await writeFile(tempPath, Buffer.from([0x47, 0x49, 0x46]));

      try {
        await assert.rejects(
          () => toBase64DataUrl(tempPath),
          /Unsupported image format/,
        );
      } finally {
        await unlink(tempPath).catch(() => {});
      }
    });

    it("throws for non-existent file", async () => {
      await assert.rejects(
        () => toBase64DataUrl("/tmp/nonexistent-image-12345.png"),
        /ENOENT/,
      );
    });

    // Data URL validation tests (Codex R-HIGH)
    it("rejects data URLs with unsupported MIME type (GIF)", async () => {
      await assert.rejects(
        () => toBase64DataUrl("data:image/gif;base64,R0lGODlh"),
        /Unsupported data URL format: image\/gif/,
      );
    });

    it("rejects data URLs with unsupported MIME type (SVG)", async () => {
      await assert.rejects(
        () => toBase64DataUrl("data:image/svg+xml;base64,PHN2Zz4="),
        /Unsupported data URL format: image\/svg\+xml/,
      );
    });

    it("rejects oversized data URLs", async () => {
      // Create a base64 string that decodes to > 20MB
      const bigBase64 = Buffer.alloc(21 * 1024 * 1024).toString("base64");
      await assert.rejects(
        () => toBase64DataUrl(`data:image/png;base64,${bigBase64}`),
        /Image exceeds 20MB limit/,
      );
    });

    it("accepts valid JPEG data URL", async () => {
      const result = await toBase64DataUrl("data:image/jpeg;base64,/9j/4A==");
      assert.strictEqual(result, "data:image/jpeg;base64,/9j/4A==");
    });

    it("accepts valid WebP data URL", async () => {
      const result = await toBase64DataUrl("data:image/webp;base64,UklGR");
      assert.strictEqual(result, "data:image/webp;base64,UklGR");
    });

    // HTTP fetch MIME validation tests (Codex R-MEDIUM)
    describe("HTTP fetch", () => {
      let originalFetch: typeof globalThis.fetch;
      let mockFetch: ReturnType<typeof mock.fn>;

      beforeEach(() => {
        originalFetch = globalThis.fetch;
        mockFetch = mock.fn();
        globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;
      });

      afterEach(() => {
        globalThis.fetch = originalFetch;
      });

      it("accepts URL with image/png Content-Type", async () => {
        const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
        mockFetch.mock.mockImplementation(async () => ({
          ok: true,
          headers: new Headers({ "Content-Type": "image/png" }),
          arrayBuffer: async () => pngBytes.buffer.slice(pngBytes.byteOffset, pngBytes.byteOffset + pngBytes.byteLength),
        }));

        const result = await toBase64DataUrl("https://example.com/image.png");
        assert.ok(result.startsWith("data:image/png;base64,"));
      });

      it("rejects URL with unsupported Content-Type (text/html)", async () => {
        const htmlBytes = Buffer.from("<html>");
        mockFetch.mock.mockImplementation(async () => ({
          ok: true,
          headers: new Headers({ "Content-Type": "text/html" }),
          arrayBuffer: async () => htmlBytes.buffer.slice(htmlBytes.byteOffset, htmlBytes.byteOffset + htmlBytes.byteLength),
        }));

        await assert.rejects(
          () => toBase64DataUrl("https://example.com/page.html"),
          /Unsupported image Content-Type: text\/html/,
        );
      });

      it("rejects URL with missing Content-Type", async () => {
        const bytes = Buffer.from([0x00]);
        mockFetch.mock.mockImplementation(async () => ({
          ok: true,
          headers: new Headers(),
          arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        }));

        await assert.rejects(
          () => toBase64DataUrl("https://example.com/unknown"),
          /Unsupported image Content-Type: missing/,
        );
      });

      it("rejects URL with image/gif Content-Type", async () => {
        const gifBytes = Buffer.from([0x47, 0x49, 0x46]);
        mockFetch.mock.mockImplementation(async () => ({
          ok: true,
          headers: new Headers({ "Content-Type": "image/gif" }),
          arrayBuffer: async () => gifBytes.buffer.slice(gifBytes.byteOffset, gifBytes.byteOffset + gifBytes.byteLength),
        }));

        await assert.rejects(
          () => toBase64DataUrl("https://example.com/anim.gif"),
          /Unsupported image Content-Type: image\/gif/,
        );
      });

      it("throws on HTTP error", async () => {
        mockFetch.mock.mockImplementation(async () => ({
          ok: false,
          status: 404,
        }));

        await assert.rejects(
          () => toBase64DataUrl("https://example.com/missing.png"),
          /Failed to fetch image: HTTP 404/,
        );
      });
    });
  });
});
