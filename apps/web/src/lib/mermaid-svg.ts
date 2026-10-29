/** beautiful-mermaid draws node labels at 13px. Wide diagrams shrink into the note column, but node text stays between these sizes. */
export const MERMAID_DRAWN_NODE_TEXT_PX = 13;
export const MERMAID_NODE_TEXT_MIN_PX = 8;
export const MERMAID_NODE_TEXT_MAX_PX = 12;
export const MERMAID_NODE_TEXT_PX = MERMAID_NODE_TEXT_MAX_PX;
export const MERMAID_NODE_TEXT_SCALE = MERMAID_NODE_TEXT_MAX_PX / MERMAID_DRAWN_NODE_TEXT_PX;

export const mermaidDisplayScale = (viewBoxWidth: number, containerWidth: number) => {
  const maxScale = MERMAID_NODE_TEXT_MAX_PX / MERMAID_DRAWN_NODE_TEXT_PX;
  const minScale = MERMAID_NODE_TEXT_MIN_PX / MERMAID_DRAWN_NODE_TEXT_PX;
  if (!Number.isFinite(viewBoxWidth) || viewBoxWidth <= 0) return maxScale;
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) return maxScale;
  return Math.min(maxScale, Math.max(minScale, containerWidth / viewBoxWidth));
};

const SVG_ROOT_TAG = /<svg\b([^>]*)>/i;
const NUMERIC_LENGTH_ATTRIBUTE = /\b(width|height)\s*=\s*(["'])(\d+(?:\.\d+)?)(px)?\2/gi;

export const scaleMermaidSvg = (
  svg: string,
  scale = MERMAID_NODE_TEXT_SCALE,
) => {
  if (!Number.isFinite(scale) || scale <= 0 || scale === 1) return svg;

  return svg.replace(SVG_ROOT_TAG, (_match, attributes: string) => {
    const scaled = attributes.replace(NUMERIC_LENGTH_ATTRIBUTE, (_attribute, name: string, quote: string, value: string, unit = "") => {
      const length = Number.parseFloat(value);
      const next = Math.round(length * scale * 100) / 100;
      return `${name}=${quote}${next}${unit}${quote}`;
    });
    return `<svg${scaled}>`;
  });
};

export interface MermaidSvgPresentation {
  width: number;
  height: number;
  backgroundColor: string | null;
  foregroundColor: string | null;
}

const DEFAULT_WIDTH = 1600;
const DEFAULT_HEIGHT = 900;

const toPositiveNumber = (value: string | null | undefined) => {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const normalizeCssColor = (value: string | null | undefined) => {
  const color = value?.trim();
  if (!color) return null;

  return /^(?:#[\da-f]{3,8}|(?:rgb|hsl)a?\([\d\s.,%+-]+\)|[a-z]+)$/i.test(color) ? color : null;
};

const readCssVariable = (style: string | null | undefined, name: string) => {
  const match = style?.match(new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`, "i"));
  return normalizeCssColor(match?.[1]);
};

const readPresentation = ({
  width,
  height,
  viewBox,
  style,
}: {
  width?: string | null;
  height?: string | null;
  viewBox?: string | null;
  style?: string | null;
}): MermaidSvgPresentation => {
  const viewBoxParts = viewBox?.trim().split(/[\s,]+/).map(Number) ?? [];
  const viewBoxWidth = viewBoxParts.length === 4 && viewBoxParts.every(Number.isFinite) && viewBoxParts[2] > 0
    ? viewBoxParts[2]
    : null;
  const viewBoxHeight = viewBoxParts.length === 4 && viewBoxParts.every(Number.isFinite) && viewBoxParts[3] > 0
    ? viewBoxParts[3]
    : null;

  return {
    width: viewBoxWidth ?? toPositiveNumber(width) ?? DEFAULT_WIDTH,
    height: viewBoxHeight ?? toPositiveNumber(height) ?? DEFAULT_HEIGHT,
    backgroundColor: readCssVariable(style, "--bg"),
    foregroundColor: readCssVariable(style, "--fg"),
  };
};

const readPresentationFromMarkup = (svg: string) => {
  const rootAttributes = svg.match(/<svg\b([^>]*)>/i)?.[1] ?? "";
  const readAttribute = (name: string) =>
    rootAttributes.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "i"))?.[2] ?? null;

  return readPresentation({
    width: readAttribute("width"),
    height: readAttribute("height"),
    viewBox: readAttribute("viewBox"),
    style: readAttribute("style"),
  });
};

export const getMermaidSvgPresentation = (svg: string): MermaidSvgPresentation => {
  if (typeof DOMParser !== "undefined") {
    const document = new DOMParser().parseFromString(svg, "image/svg+xml");
    const root = document.documentElement;
    if (root.tagName.toLowerCase() === "svg" && !document.querySelector("parsererror")) {
      return readPresentation({
        width: root.getAttribute("width"),
        height: root.getAttribute("height"),
        viewBox: root.getAttribute("viewBox"),
        style: root.getAttribute("style"),
      });
    }
  }

  return readPresentationFromMarkup(svg);
};

export const resolveMermaidViewerBackground = (
  svgBackgroundColor: string | null,
  paletteBackgroundColor: string
) => svgBackgroundColor ?? paletteBackgroundColor;

export const normalizeMermaidSvgForViewer = (
  svg: string,
  presentation = getMermaidSvgPresentation(svg)
) => {
  if (typeof DOMParser === "undefined" || typeof XMLSerializer === "undefined") return svg;

  const parser = new DOMParser();
  const document = parser.parseFromString(svg, "image/svg+xml");
  let root: Element | null = document.documentElement;
  if (document.querySelector("parsererror")) {
    // Official Mermaid labels can contain HTML void tags such as <br>. Inline
    // SVG accepts them, but a standalone SVG image requires well-formed XML.
    // Parse in an inert HTML document, then serialize the SVG with XHTML
    // namespaces and closed void tags before handing it to the image viewer.
    root = parser.parseFromString(svg, "text/html").body.firstElementChild;
    if (root?.namespaceURI !== "http://www.w3.org/2000/svg") return svg;
  }
  if (root?.tagName.toLowerCase() !== "svg") return svg;

  // Mermaid emits width="100%", which gives Blob-backed images incorrect intrinsic dimensions.
  root.setAttribute("width", String(presentation.width));
  root.setAttribute("height", String(presentation.height));
  return new XMLSerializer().serializeToString(root);
};
