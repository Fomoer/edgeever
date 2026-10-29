import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QRCodeSVG } from "qrcode.react";
import { shareQrCodeFileName, shareQrCodePngBlob } from "./ShareQrCode.tsx";

const source = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

describe("share link QR code", () => {
  test("is offered in both share dialogs only for links without a password", () => {
    for (const [dialog, hint] of [["ShareMemoDialog.tsx", "sharing.qrCodeHint"], ["ShareNotebookDialog.tsx", "sharing.qrCodeNotebookHint"]]) {
      const code = source(dialog);
      expect(code).toContain(`{share.passwordProtected ? null : (\n              <ShareQrCode key={\`qr-\${share.token}\`} url={shareUrl} hint={t("${hint}")} />`);
      // A sibling keyed with the bare token (SharePasswordControls) would make React duplicate rows.
      expect(code.match(/key=\{share\.token\}/g)?.length ?? 0).toBeLessThanOrEqual(1);
    }
  });

  test("renders an accessible SVG with dark modules on white and no native tooltip", () => {
    const component = source("ShareQrCode.tsx");
    expect(component).toContain('bgColor="#ffffff"');
    expect(component).toContain('fgColor="#000000"');
    expect(component).toContain('aria-label={t("sharing.qrCodeLabel")}');
    expect(component).not.toMatch(/\btitle=/);

    const markup = renderToStaticMarkup(createElement(QRCodeSVG, {
      value: "https://notes.example/share/abc",
      size: 176,
      level: "M",
      marginSize: 0,
      role: "img",
      "aria-label": "QR code for the share link",
    }));
    expect(markup).toStartWith("<svg");
    expect(markup).toContain('role="img"');
    expect(markup).toContain('aria-label="QR code for the share link"');
    expect(markup).not.toContain("<title");
    expect(markup).toContain("<path");
  });

  test("offers PNG and SVG downloads of a print-size code with a quiet zone", () => {
    const component = source("ShareQrCode.tsx");
    expect(component).toContain('t("sharing.qrCodeDownloadPng")');
    expect(component).toContain('t("sharing.qrCodeDownloadSvg")');
    expect(component).toContain("marginSize={QR_DOWNLOAD_MARGIN}");

    const markup = renderToStaticMarkup(createElement(QRCodeSVG, {
      value: "https://notes.example/share/abc",
      size: 1024,
      level: "M",
      marginSize: 4,
      xmlns: "http://www.w3.org/2000/svg",
    }));
    expect(markup).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(markup).toContain('width="1024"');
  });

  test("names the downloaded file after the share address", () => {
    expect(shareQrCodeFileName("https://notes.example/share/meeting-notes", "png")).toBe("edgeever-share-qr-meeting-notes.png");
    expect(shareQrCodeFileName("https://notes.example/share/notebook/abc_DEF-1", "svg")).toBe("edgeever-share-qr-abc_DEF-1.svg");
    expect(shareQrCodeFileName("https://notes.example/s/%3Cx%3E", "png")).toBe("edgeever-share-qr-3Cx3E.png");
    expect(shareQrCodeFileName("not a url", "png")).toBe("edgeever-share-qr.png");
  });

  test("exports 1024 physical pixels at different screen densities without resizing the source", async () => {
    const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
    try {
      for (const ratio of [1, 1.25, 2, 3]) {
        const sourceCanvas = { width: 1024 * ratio, height: 1024 * ratio };
        let drawnSource;
        const context = {
          imageSmoothingEnabled: true,
          drawImage(source) { drawnSource = source; },
        };
        const exportCanvas = {
          width: 0,
          height: 0,
          getContext: () => context,
          toBlob(callback, type) {
            callback(new Blob([`${this.width}x${this.height}`], { type }));
          },
        };
        Object.defineProperty(globalThis, "document", {
          configurable: true,
          value: { createElement: () => exportCanvas },
        });

        const blob = await shareQrCodePngBlob(sourceCanvas);
        expect(blob.type).toBe("image/png");
        expect(await blob.text()).toBe("1024x1024");
        expect(drawnSource).toBe(sourceCanvas);
        expect(context.imageSmoothingEnabled).toBe(false);
        expect(sourceCanvas.width).toBe(1024 * ratio);
        expect(sourceCanvas.height).toBe(1024 * ratio);
      }
    } finally {
      if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
      else delete globalThis.document;
    }
  });
});
