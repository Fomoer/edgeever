import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { renderMermaidSVG, THEMES } from "beautiful-mermaid";
import { MERMAID_THEME_PALETTES } from "../components/ThemeProvider";
import { contrastRatio } from "./color-contrast";
import { getOfficialMermaidThemeVariables } from "./mermaid-theme";

const SEQUENCE_SOURCE = `sequenceDiagram
  participant User as 用户
  participant App as 客户端
  User->>App: 保存笔记
  App-->>User: 保存成功`;

describe("official Mermaid theme variables", () => {
  test("maps every built-in theme across flowchart, sequence, and state diagrams", () => {
    for (const palette of Object.values(MERMAID_THEME_PALETTES)) {
      const variables = getOfficialMermaidThemeVariables(palette);
      const expectedAccent = palette.accent ?? palette.line ?? palette.fg;
      const expectedLine = palette.line ?? palette.muted ?? palette.fg;
      const expectedBorder = palette.border ?? palette.muted ?? expectedAccent;

      expect(variables.background).toBe(palette.bg);
      expect(variables.primaryTextColor).toBe(palette.fg);
      expect(variables.clusterBorder).toBe(expectedBorder);
      expect(variables.actorBorder).toBe(expectedBorder);
      expect(variables.signalColor).toBe(expectedAccent);
      expect(variables.stateBorder).toBe(expectedBorder);
      expect(variables.transitionColor).toBe(expectedLine);
    }
  });

  test("keeps the default themes on the note surface with a solid node plate", () => {
    const light = MERMAID_THEME_PALETTES["zinc-light"];
    const dark = MERMAID_THEME_PALETTES["zinc-dark"];
    const lightVariables = getOfficialMermaidThemeVariables(light);

    expect(light.bg).toBe("#f8fafb");
    expect(light.fg).toBe("#27272A");
    expect(light.muted).toBe("#3f3f46");
    expect(light.line).toBe("#52525b");
    expect(light.surface).toBe("#ffffff");
    expect(light.border).toBe("#d4d4d8");
    expect(lightVariables.background).toBe(light.bg);
    expect(lightVariables.primaryColor).toBe(light.surface);
    expect(lightVariables.primaryTextColor).toBe(light.fg);
    expect(lightVariables.primaryBorderColor).toBe(light.border);
    expect(lightVariables.lineColor).toBe(light.line);
    expect(lightVariables.fontSize).toBe("12px");
    const globals = readFileSync(new URL("../styles/globals.css", import.meta.url), "utf8");
    expect(globals).toContain(`--workspace-editor: ${dark.bg};`);
    expect(dark.bg).toBe("#222325");
    expect(dark.line).toBe("#85898f");
    expect(dark.surface).toBe("#2d2f32");
    expect(dark.border).toBe("#46494e");
    expect(dark.muted).toBe("#b9bdc1");
  });

  test("keeps primary and secondary diagram text readable in every theme", () => {
    for (const [theme, palette] of Object.entries(MERMAID_THEME_PALETTES)) {
      expect(contrastRatio(palette.fg, palette.bg), `${theme} primary text`).toBeGreaterThanOrEqual(4.5);
      expect(palette.muted, `${theme} secondary text color`).toBeDefined();
      expect(contrastRatio(palette.muted, palette.bg), `${theme} secondary text`).toBeGreaterThanOrEqual(4.5);
      if (palette.surface) {
        expect(contrastRatio(palette.fg, palette.surface), `${theme} node text`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  test("applies the accessible text palette when every theme renders a sequence diagram", () => {
    for (const [theme, palette] of Object.entries(MERMAID_THEME_PALETTES)) {
      const svg = renderMermaidSVG(SEQUENCE_SOURCE, {
        ...THEMES[theme],
        ...palette,
        transparent: true,
      });

      expect(svg, `${theme} rendered SVG`).toContain(`--bg:${palette.bg}`);
      expect(svg, `${theme} rendered SVG`).toContain(`--fg:${palette.fg}`);
      expect(svg, `${theme} rendered SVG`).toContain(`--muted:${palette.muted}`);
      expect(svg, `${theme} message text`).toContain('fill="var(--_text-muted)"');
    }
  });
});
