import { ChevronDown, Download, QrCode } from "lucide-react";
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { canvasToPngBlob, downloadBlob } from "@/lib/infographic-image-export";

// Large enough for print, with the standard four-module quiet zone around it.
const QR_DOWNLOAD_SIZE = 1024;
const QR_DOWNLOAD_MARGIN = 4;

export const shareQrCodePngBlob = (source: HTMLCanvasElement) => {
  // QRCodeCanvas scales its backing store by devicePixelRatio. Export physical
  // pixels at a fixed size regardless of screen density or browser zoom.
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = QR_DOWNLOAD_SIZE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas");
  context.imageSmoothingEnabled = false;
  context.drawImage(source, 0, 0, QR_DOWNLOAD_SIZE, QR_DOWNLOAD_SIZE);
  return canvasToPngBlob(canvas);
};

/** File name from the last path segment of the link: the custom address or the token. */
export const shareQrCodeFileName = (url: string, extension: "png" | "svg") => {
  let segment = "";
  try {
    segment = new URL(url).pathname.split("/").filter(Boolean).at(-1) ?? "";
  } catch {
    // Keep the generic name for a value that is not a URL.
  }
  const safe = segment.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 48);
  return `edgeever-share-qr${safe ? `-${safe}` : ""}.${extension}`;
};

/**
 * Scannable share link for opening a share on another device. Callers render it
 * only for links without a password, so the code never stands in for one.
 */
export const ShareQrCode = ({ url, hint }: { url: string; hint: string }) => {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const downloadPng = async () => {
    if (!canvasRef.current) return;
    downloadBlob(await shareQrCodePngBlob(canvasRef.current), shareQrCodeFileName(url, "png"));
  };

  const downloadSvg = () => {
    if (!svgRef.current) return;
    const markup = new XMLSerializer().serializeToString(svgRef.current);
    downloadBlob(new Blob([markup], { type: "image/svg+xml;charset=utf-8" }), shareQrCodeFileName(url, "svg"));
  };

  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="group -ml-2.5">
          <QrCode className="h-4 w-4" aria-hidden="true" />
          {t("sharing.qrCode")}
          <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" aria-hidden="true" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">
        <figure className="flex flex-col items-center gap-2">
          {/* Keep dark modules on white in every theme so phone cameras can read the code. */}
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <QRCodeSVG
              value={url}
              size={176}
              level="M"
              marginSize={0}
              bgColor="#ffffff"
              fgColor="#000000"
              role="img"
              aria-label={t("sharing.qrCodeLabel")}
            />
          </div>
          <figcaption className="text-center text-xs leading-5 text-muted-foreground">{hint}</figcaption>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void downloadPng()}>
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              {t("sharing.qrCodeDownloadPng")}
            </Button>
            <Button variant="outline" size="sm" onClick={downloadSvg}>
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              {t("sharing.qrCodeDownloadSvg")}
            </Button>
          </div>
          {/* Download sources: the same code at print size with a quiet zone. */}
          <div hidden aria-hidden="true">
            <QRCodeCanvas
              ref={canvasRef}
              value={url}
              size={QR_DOWNLOAD_SIZE}
              level="M"
              marginSize={QR_DOWNLOAD_MARGIN}
              bgColor="#ffffff"
              fgColor="#000000"
            />
            <QRCodeSVG
              ref={svgRef}
              value={url}
              size={QR_DOWNLOAD_SIZE}
              level="M"
              marginSize={QR_DOWNLOAD_MARGIN}
              bgColor="#ffffff"
              fgColor="#000000"
              xmlns="http://www.w3.org/2000/svg"
            />
          </div>
        </figure>
      </CollapsibleContent>
    </Collapsible>
  );
};
