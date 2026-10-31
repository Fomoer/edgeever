import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { parseSyntax } from "@antv/infographic";
import {
  INFOGRAPHIC_SAMPLE_CATEGORIES,
  INFOGRAPHIC_SAMPLES,
  getSampleDesc,
  getSampleSyntax,
  getSampleTitle,
} from "../lib/infographic-samples";

const editorPaneSource = readFileSync(new URL("./InfographicEditorPane.tsx", import.meta.url), "utf8");
const gallerySource = readFileSync(new URL("./InfographicGallery.tsx", import.meta.url), "utf8");

describe("infographic gallery samples", () => {
  test("covers all 7 AntV template categories with curated samples", () => {
    const categories = new Set(INFOGRAPHIC_SAMPLES.map((s) => s.category));
    expect(categories.has("sequence")).toBe(true);
    expect(categories.has("compare")).toBe(true);
    expect(categories.has("list")).toBe(true);
    expect(categories.has("quadrant")).toBe(true);
    expect(categories.has("hierarchy")).toBe(true);
    expect(categories.has("relation")).toBe(true);
    expect(categories.has("chart")).toBe(true);
    expect(INFOGRAPHIC_SAMPLE_CATEGORIES.length).toBe(7);
  });

  test("all Chinese sample syntaxes parse cleanly without errors", () => {
    for (const sample of INFOGRAPHIC_SAMPLES) {
      const parsed = parseSyntax(sample.syntaxZh);
      expect(parsed.errors.length).toBe(0);
      expect(parsed.options.template).toBe(sample.template);
    }
  });

  test("all English sample syntaxes parse cleanly without errors", () => {
    for (const sample of INFOGRAPHIC_SAMPLES) {
      const parsed = parseSyntax(sample.syntaxEn);
      expect(parsed.errors.length).toBe(0);
      expect(parsed.options.template).toBe(sample.template);
    }
  });

  test("multilingual helper methods return appropriate localized content", () => {
    const sample = INFOGRAPHIC_SAMPLES[0];
    expect(getSampleTitle(sample, "zh-CN")).toBe(sample.titleZh);
    expect(getSampleTitle(sample, "en-US")).toBe(sample.titleEn);
    expect(getSampleTitle(sample, "ja")).toBe(sample.titleJa ?? sample.titleEn);

    expect(getSampleSyntax(sample, "zh-CN")).toBe(sample.syntaxZh);
    expect(getSampleSyntax(sample, "en-US")).toBe(sample.syntaxEn);
    expect(getSampleSyntax(sample, "zh")).toBe(sample.syntaxZh);
    expect(getSampleSyntax(sample, "pl")).toBe(sample.syntaxEn);
    expect(getSampleSyntax(sample)).toBe(sample.syntaxEn);

    expect(getSampleDesc(sample, "zh-CN")).toBe(sample.descZh);
    expect(getSampleDesc(sample, "en-US")).toBe(sample.descEn);
  });
});

describe("infographic editor gallery integration", () => {
  test("renders InfographicGallery in empty canvas state and provides toolbar gallery trigger without leaking technical branding", () => {
    expect(editorPaneSource).toContain("<InfographicGallery");
    expect(editorPaneSource).toContain("handleApplySample");
    expect(editorPaneSource).toContain('t("infographic.galleryTemplatesButton")');
    expect(gallerySource).toContain("data-infographic-gallery");
    expect(gallerySource).toContain("data-infographic-sample-card");
    expect(gallerySource).toContain("data-infographic-card-preview");
    expect(gallerySource).not.toContain("https://infographic.antv.vision/gallery");
    expect(gallerySource).not.toContain("sample.template");
    expect(gallerySource).not.toContain("AntV Infographic");
  });
});
