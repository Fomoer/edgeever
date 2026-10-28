import type { MermaidThemeName, MermaidThemePalette } from "../components/ThemeProvider";
import { scaleMermaidSvg } from "./mermaid-svg";
import { getOfficialMermaidThemeVariables } from "./mermaid-theme";

interface MermaidRenderFallbackOptions {
  source?: string;
  renderBeautiful: () => string | Promise<string>;
  renderOfficial: () => string | Promise<string>;
}

export const renderMermaidWithFallback = async ({
  source = "",
  renderBeautiful,
  renderOfficial,
}: MermaidRenderFallbackOptions) => {
  // The compact renderer offsets subgraph nodes without moving their edge endpoints.
  // It can return a valid SVG with disconnected arrows, so exceptions are insufficient.
  if (/^\s*subgraph\b/m.test(source)) return renderOfficial();

  try {
    return await renderBeautiful();
  } catch {
    return renderOfficial();
  }
};

let officialModule: Promise<typeof import("mermaid")["default"]> | undefined;
let compactModule: Promise<typeof import("beautiful-mermaid")> | undefined;
let officialQueue: Promise<unknown> = Promise.resolve();
let renderSequence = 0;

export const renderThemedMermaidSvg = (
  source: string,
  { theme, palette, font, padding }: {
    theme: MermaidThemeName;
    palette: MermaidThemePalette;
    font: string;
    padding: number;
  },
) => renderMermaidWithFallback({
  source,
  renderBeautiful: async () => {
    const { renderMermaidSVG, THEMES } = await (compactModule ??= import("beautiful-mermaid"));
    return scaleMermaidSvg(renderMermaidSVG(source, {
      ...THEMES[theme], ...palette, transparent: true, font, padding,
    }));
  },
  renderOfficial: () => {
    // Mermaid configuration is global. Keep initialization and rendering together
    // when several blocks or export jobs request different themes concurrently.
    const result = officialQueue.then(async () => {
      const mermaid = await (officialModule ??= import("mermaid").then(({ default: module }) => module));
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        suppressErrorRendering: true,
        theme: "base",
        themeVariables: getOfficialMermaidThemeVariables(palette),
      });
      const valid = await mermaid.parse(source, { suppressErrors: true });
      if (!valid) throw new Error("Invalid Mermaid diagram");
      const { svg } = await mermaid.render(`edgeever-mermaid-${++renderSequence}`, source);
      return svg;
    });
    officialQueue = result.catch(() => undefined);
    return result;
  },
});
