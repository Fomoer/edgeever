import {
  Circle,
  Color,
  Ellipse,
  FabricObject,
  Gradient,
  Group,
  Line,
  Path,
  Pattern,
  Polygon,
  Rect,
  Textbox,
  Triangle,
} from "fabric";
import {
  PosterDocumentSchema,
  type PosterDocument,
  type PosterElement,
  type PosterPaintGradient,
} from "@edgeever/shared";
import { TEMPLATES, sourceOf, templatesFor } from "./vendor/qiaomu/templates";
import { BadgeBox } from "./vendor/qiaomu/badge";
import { resolvePair, usePairing } from "./vendor/qiaomu/typeset";
import { POSTER_FONTS, loadDesignFonts } from "./fonts";
import { matchesImageSlot, type ImageSlot } from "../poster-image-replacement";
import { composePosterTemplate, posterTemplateHeaderHeight } from "../poster-template-content";
import {
  paperListCurrentCopy,
  posterTemplateSampleCopy,
  posterTemplateSelectionCopy,
} from "./paper-list-content";
export { PLATFORMS, platformFor } from "./vendor/qiaomu/platforms";
export { posterTemplateSampleCopy };
export const DESIGN_TEMPLATES = TEMPLATES;
export { templatesFor };
const hex = (color: string | undefined) =>
  `#${new Color(color || "#000000").toHex()}`;
const paint = (object: FabricObject) =>
  typeof object.fill === "string" && object.fill
    ? object.fill
    : object.fill instanceof Gradient
      ? hex(object.fill.colorStops[0]?.color)
      : "rgba(0,0,0,0)";
export function gradientFromFabric(
  value: Gradient<"linear" | "radial">,
  width: number,
  height: number,
): PosterPaintGradient {
  const c = value.coords as {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    r1?: number;
    r2?: number;
  };
  return {
    kind: value.type,
    from: hex(value.colorStops[0]?.color),
    to: hex(value.colorStops.at(-1)?.color),
    angle: 90,
    stops: value.colorStops.map((stop) => ({
      offset: stop.offset,
      color: stop.color,
      opacity: (stop as typeof stop & { opacity?: number }).opacity,
    })),
    coords: {
      x1: c.x1 / width,
      y1: c.y1 / height,
      x2: c.x2 / width,
      y2: c.y2 / height,
      ...(value.type === "radial"
        ? {
            r1: (c.r1 ?? 0) / Math.max(width, height),
            r2: (c.r2 ?? 0) / Math.max(width, height),
          }
        : {}),
    },
  };
}
export function posterPrimitiveFromObject(
  object: FabricObject,
  index: number,
): PosterElement | null {
  if (object.fill instanceof Pattern) return null; // Film grain is a generated raster tile, not editable vector source.
  const roleValue = (object as FabricObject & { qcRole?: string }).qcRole;
  const role =
    roleValue === "title" || roleValue === "subtitle" || roleValue === "badge"
      ? roleValue
      : "decor";
  const pos = object.getPointByOrigin("left", "top");
  const options = {
    id: `design_${index}`,
    name: (object as FabricObject & { qcName?: string }).qcName ?? role,
    role,
    x: pos.x,
    y: pos.y,
    width: Math.max(1, object.width * Math.abs(object.scaleX)),
    height: Math.max(1, object.height * Math.abs(object.scaleY)),
    rotation: object.angle % 360,
    opacity: object.opacity,
    locked: false,
    ...(object.stroke && typeof object.stroke === "string"
      ? { stroke: object.stroke, strokeWidth: object.strokeWidth }
      : {}),
    ...(object.shadow
      ? {
          shadow: {
            color: object.shadow.color,
            blur: object.shadow.blur,
            offsetX: object.shadow.offsetX,
            offsetY: object.shadow.offsetY,
          },
        }
      : {}),
    ...(object.fill instanceof Gradient
      ? {
          gradient: gradientFromFabric(
            object.fill,
            Math.max(1, object.width),
            Math.max(1, object.height),
          ),
        }
      : {}),
  } satisfies Partial<PosterElement>;
  if (object instanceof Textbox)
    return {
      ...options,
      type: "text",
      text: object.text,
      sourceText: sourceOf(object),
      fill: paint(object),
      fontSize: object.fontSize * Math.abs(object.scaleY),
      fontFamily: object.fontFamily,
      fontWeight: ["bold", "700", "800", "900"].includes(
        String(object.fontWeight),
      )
        ? "bold"
        : "normal",
      fontStyle: object.fontStyle === "italic" ? "italic" : "normal",
      textAlign:
        object.textAlign === "center" || object.textAlign === "right"
          ? object.textAlign
          : "left",
      lineHeight: object.lineHeight,
      charSpacing: object.charSpacing,
      ...(object instanceof BadgeBox
        ? {
            badge: {
              background: hex(object.badgeBg),
              padX: object.padX,
              padY: object.padY,
              radius: object.radius,
            },
          }
        : {}),
    };
  if (object instanceof Rect)
    return {
      ...options,
      type: "rect",
      fill: paint(object),
      radius: object.rx * Math.abs(object.scaleX),
    };
  if (object instanceof Circle || object instanceof Ellipse)
    return { ...options, type: "ellipse", fill: paint(object) };
  let path: string | undefined;
  if (object instanceof Path)
    path = object.path.map((command) => command.join(" ")).join(" ");
  if (object instanceof Line)
    path = `M ${object.x1} ${object.y1} L ${object.x2} ${object.y2}`;
  if (object instanceof Polygon)
    path =
      object.points
        .map((point, i) => `${i ? "L" : "M"} ${point.x} ${point.y}`)
        .join(" ") + " Z";
  if (object instanceof Triangle)
    path = `M ${object.width / 2} 0 L ${object.width} ${object.height} L 0 ${object.height} Z`;
  if (!path) throw new Error(`Unsupported design primitive: ${object.type}`);
  return { ...options, type: "path", path, fill: paint(object) };
}
export function posterCopy(document: PosterDocument) {
  if (document.copy) return paperListCurrentCopy(document, document.copy);
  const text = document.elements.filter((element) => element.type === "text");
  const title =
    text.find(
      (element) => element.role === "title" || element.id === "heading",
    ) ?? text[0];
  const subtitle =
    text.find(
      (element) => element.role === "subtitle" || element.id === "subtitle",
    ) ?? text[1];
  const badge = text.find((element) => element.role === "badge");
  return {
    title: title?.sourceText ?? title?.text ?? "",
    subtitle: subtitle?.sourceText ?? subtitle?.text ?? "",
    badge: badge?.sourceText ?? badge?.text ?? "",
  };
}
export async function buildPosterDesign(input: {
  id: string;
  title: string;
  subtitle: string;
  badge?: string;
  points?: string[];
  width: number;
  height: number;
  zh: boolean;
  palette?: { bg?: string; ink?: string; accent?: string };
}): Promise<PosterDocument> {
  const template =
    TEMPLATES.find((entry) => entry.id === input.id) ?? TEMPLATES[0]!;
  const pairing = input.zh
      ? resolvePair(template.id, (family) =>
          POSTER_FONTS.some((font) => font.family === family),
        )
      : {
          title:
            template.id === "newspaper" || template.id === "folio" || template.id === "paper-list"
              ? "DM Serif Display"
              : "Inter",
          body: "Inter",
          titleBold: true,
          missing: [],
        };
  await loadDesignFonts([pairing.title, pairing.body, "DM Serif Display"].filter((family): family is string => Boolean(family)), [input.title, input.subtitle, input.badge, ...(input.points ?? []), "No. 01 2026"].join(" "));
  const build = () => {
    usePairing(pairing);
    try { return template.build({ ...input }); }
    finally { usePairing(undefined); }
  };
  // Explicit families and fixed template labels may differ from the main pairing.
  // Load those before the final build so wrapping uses the actual glyph metrics.
  const initial = build();
  const texts: Array<{ family: string; text: string }> = [];
  const collect = (objects: FabricObject[]) => {
    for (const object of objects) {
      if ("fontFamily" in object && typeof object.fontFamily === "string" && "text" in object && typeof object.text === "string") texts.push({ family: object.fontFamily, text: object.text });
      if (object instanceof Group) collect(object.getObjects());
    }
  };
  collect(initial.objects);
  await loadDesignFonts(texts.map(object => object.family), texts.map(object => object.text).join(" "));
  try {
    const built = build();
    const elements = built.objects
      .map(posterPrimitiveFromObject)
      .filter((value): value is PosterElement => Boolean(value));
    const slot = template.slot?.(input);
    if (slot) {
      const region = { x: slot.x, y: slot.y, width: slot.w, height: slot.h };
      for (const element of elements) if (matchesImageSlot(element, region)) element.imagePlaceholder = true;
    }
    const background =
      built.background.kind === "solid"
        ? built.background.color
        : built.background.from;
    const result = {
      copy: {
        title: input.title,
        subtitle: input.subtitle,
        badge: input.badge ?? "",
      },
      schemaVersion: 1,
      width: input.width,
      height: input.height,
      templateId: template.id,
      background: hex(background),
      ...(built.background.kind === "linear"
        ? {
            backgroundGradient: {
              kind: "linear",
              from: hex(built.background.from),
              to: hex(built.background.to),
              angle: built.background.angle,
            },
          }
        : {}),
      elements,
    };
    return PosterDocumentSchema.parse(result);
  } finally {
    usePairing(undefined);
  }
}

export async function applyPosterDesign(document: PosterDocument, templateId: string, zh: boolean, width = document.width, height = document.height, starterCopy?: { title: string; subtitle: string }) {
  if (!TEMPLATES.some(template => template.id === templateId)) throw new Error("Unknown poster template");
  if (document.elements.some(element => element.locked)) throw new Error("Locked poster elements");
  const headerHeight = posterTemplateHeaderHeight(document, height);
  const copy = posterTemplateSelectionCopy(document, posterCopy(document), templateId, zh, starterCopy);
  const cover = await buildPosterDesign({ id: templateId, ...copy, width, height: Math.max(320, headerHeight), zh });
  return composePosterTemplate(document, cover, width, height, headerHeight);
}

// Legacy saved templates did not persist a placeholder marker. Derive only the
// template's declared image slot, with the same header transform as its artwork.
export function posterImageSlot(document: PosterDocument): ImageSlot | undefined {
  const template = TEMPLATES.find(entry => entry.id === document.templateId);
  if (!template?.slot) return;
  const header = posterTemplateHeaderHeight(document, document.height);
  const buildHeight = Math.max(320, header);
  const slot = template.slot({ ...posterCopy(document), width: document.width, height: buildHeight, zh: true });
  if (!slot) return;
  return { x: slot.x, y: slot.y * header / buildHeight, width: slot.w, height: slot.h * header / buildHeight };
}
