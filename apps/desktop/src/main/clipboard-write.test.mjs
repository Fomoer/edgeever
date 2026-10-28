import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileClipboard, writeImageClipboard, writeRichClipboard, writeTextClipboard } from "./clipboard-write.mjs";

const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
  0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41,
  0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
  0x00, 0x00, 0x03, 0x00, 0x01, 0x18, 0xdd, 0x8d,
  0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
  0x44, 0xae, 0x42, 0x60, 0x82,
]);

class TestClipboardItem {
  constructor(data) {
    this.data = data;
  }
}

describe("writeTextClipboard", () => {
  test("awaits and verifies the Electron 44 text clipboard API", async () => {
    const calls = [];
    const clipboard = {
      writeText: async (value) => { calls.push(["writeText", value]); },
      readText: async () => {
        calls.push(["readText"]);
        return "Hello";
      },
    };

    await expect(writeTextClipboard(clipboard, "Hello")).resolves.toBe(true);
    expect(calls).toEqual([
      ["writeText", "Hello"],
      ["readText"],
    ]);
  });

  test("does not report success when the written text cannot be read back", async () => {
    const clipboard = {
      writeText: async () => {},
      readText: async () => "",
    };

    await expect(writeTextClipboard(clipboard, "Hello")).resolves.toBe(false);
  });

  test("rejects malformed text input", async () => {
    const clipboard = { writeText: async () => {}, readText: async () => "" };
    await expect(writeTextClipboard(clipboard, null)).rejects.toThrow(
      "Clipboard value must be a string",
    );
  });
});

describe("writeImageClipboard", () => {
  test("writes PNG bytes and verifies the image is on the clipboard", async () => {
    const writes = [];
    const clipboard = {
      write: async (value) => writes.push(value),
      has: async (type) => type === "image/png",
    };

    await expect(writeImageClipboard(clipboard, TestClipboardItem, PNG)).resolves.toBe(true);
    expect(writes).toHaveLength(1);
    const blob = writes[0][0].data["image/png"];
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("image/png");
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(PNG);
  });

  test("does not report success when the image cannot be read back", async () => {
    const clipboard = {
      write: async () => {},
      has: async () => false,
    };

    await expect(writeImageClipboard(clipboard, TestClipboardItem, PNG)).resolves.toBe(false);
  });

  test("rejects a non-image payload and ignores bytes that are not a PNG", async () => {
    const clipboard = { write: async () => {}, has: async () => true };
    await expect(writeImageClipboard(clipboard, TestClipboardItem, "nope")).rejects.toThrow(
      "Clipboard image must be PNG bytes",
    );
    await expect(writeImageClipboard(clipboard, TestClipboardItem, Uint8Array.from([1, 2, 3]))).resolves.toBe(false);
    await expect(writeImageClipboard(clipboard, TestClipboardItem, new Uint8Array())).resolves.toBe(false);
  });

  test("desktop image copy is wired through the main process", () => {
    const main = readFileSync(new URL("./index.mjs", import.meta.url), "utf8");
    const preload = readFileSync(new URL("../preload/index.cjs", import.meta.url), "utf8");
    expect(main).toContain('ipcMain.handle("desktop:copy-image"');
    expect(preload).toContain('ipcRenderer.invoke("desktop:copy-image"');
  });
});

describe("writeFileClipboard", () => {
  const clipboardWith = (writes, has = async (type) => type === "text/uri-list") => ({
    write: async (value) => writes.push(value),
    has,
  });

  const writtenPath = (writes) => fileURLToPath(String(writes.at(-1)[0].data["text/uri-list"]).trim());

  test("copies the original filename inside the clipboard directory", async () => {
    const directory = await mkdtemp(join(tmpdir(), "edgeever-clipboard-"));
    const writes = [];
    try {
      const bytes = Uint8Array.from([1, 2, 3, 4]);
      await expect(writeFileClipboard(clipboardWith(writes), TestClipboardItem, {
        bytes,
        filename: "notes/报告.pdf",
      }, { directory })).resolves.toBe(true);
      const path = writtenPath(writes);
      expect(relative(directory, path).startsWith("..")).toBe(false);
      expect(basename(path)).toBe("报告.pdf");
      expect(new Uint8Array(await readFile(path))).toEqual(bytes);
      expect(writes[0][0].data["text/uri-list"].endsWith("\r\n")).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("keeps only the latest copied file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "edgeever-clipboard-"));
    const writes = [];
    try {
      await writeFileClipboard(clipboardWith(writes), TestClipboardItem, {
        bytes: Uint8Array.from([1]),
        filename: "first.txt",
      }, { directory });
      const first = writtenPath(writes);
      await writeFileClipboard(clipboardWith(writes), TestClipboardItem, {
        bytes: Uint8Array.from([2]),
        filename: "second.txt",
      }, { directory });
      await expect(stat(first)).rejects.toThrow();
      expect(new Uint8Array(await readFile(writtenPath(writes)))).toEqual(Uint8Array.from([2]));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("drops path segments and refuses an empty or oversized payload", async () => {
    const directory = await mkdtemp(join(tmpdir(), "edgeever-clipboard-"));
    const writes = [];
    try {
      await expect(writeFileClipboard(clipboardWith(writes), TestClipboardItem, {
        bytes: Uint8Array.from([9]),
        filename: "../../etc/passwd",
      }, { directory })).resolves.toBe(true);
      expect(basename(writtenPath(writes))).toBe("passwd");
      expect(relative(directory, writtenPath(writes)).startsWith("..")).toBe(false);

      await expect(writeFileClipboard(clipboardWith(writes), TestClipboardItem, {
        bytes: Uint8Array.from([]),
        filename: "..",
      }, { directory })).resolves.toBe(false);
      await expect(writeFileClipboard(clipboardWith(writes), TestClipboardItem, {
        bytes: Uint8Array.from([1, 2, 3, 4]),
        filename: "big.bin",
      }, { directory, maxBytes: 3 })).resolves.toBe(false);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("removes the file when the clipboard does not keep it", async () => {
    const directory = await mkdtemp(join(tmpdir(), "edgeever-clipboard-"));
    const writes = [];
    try {
      await expect(writeFileClipboard(clipboardWith(writes, async () => false), TestClipboardItem, {
        bytes: Uint8Array.from([1]),
        filename: "gone.txt",
      }, { directory })).resolves.toBe(false);
      await expect(stat(writtenPath(writes))).rejects.toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("rejects malformed file input", async () => {
    const clipboard = { write: async () => {}, has: async () => true };
    await expect(writeFileClipboard(clipboard, TestClipboardItem, {
      bytes: "nope",
      filename: "a.txt",
    }, { directory: "/tmp" })).rejects.toThrow("Clipboard file must be bytes");
    await expect(writeFileClipboard(clipboard, TestClipboardItem, {
      bytes: Uint8Array.from([1]),
      filename: 12,
    }, { directory: "/tmp" })).rejects.toThrow("Clipboard filename must be a string");
  });

  test("desktop file copy is wired through the main process", () => {
    const main = readFileSync(new URL("./index.mjs", import.meta.url), "utf8");
    const preload = readFileSync(new URL("../preload/index.cjs", import.meta.url), "utf8");
    expect(main).toContain('ipcMain.handle("desktop:copy-file"');
    expect(preload).toContain('ipcRenderer.invoke("desktop:copy-file"');
  });
});

describe("writeRichClipboard", () => {
  test("writes and verifies both rich HTML and plain text with the Electron 44 API", async () => {
    const writes = [];
    const clipboard = {
      write: async (value) => writes.push(value),
      readText: async () => "Hello",
      has: async (type) => type === "text/html",
    };

    await expect(writeRichClipboard(clipboard, TestClipboardItem, {
      html: "<strong>Hello</strong>",
      plainText: "Hello",
    })).resolves.toBe(true);
    expect(writes).toEqual([[
      new TestClipboardItem({
        "text/html": "<strong>Hello</strong>",
        "text/plain": "Hello",
      }),
    ]]);
  });

  test("does not report success when rich HTML is missing after the write", async () => {
    const clipboard = {
      write: async () => {},
      readText: async () => "Hello",
      has: async () => false,
    };

    await expect(writeRichClipboard(clipboard, TestClipboardItem, {
      html: "<strong>Hello</strong>",
      plainText: "Hello",
    })).resolves.toBe(false);
  });

  test("rejects malformed renderer input", async () => {
    const clipboard = { write: async () => {}, readText: async () => "", has: async () => false };
    await expect(writeRichClipboard(clipboard, TestClipboardItem, { html: "<p>Hello</p>" })).rejects.toThrow(
      "Clipboard HTML and plain text must be strings",
    );
  });
});
