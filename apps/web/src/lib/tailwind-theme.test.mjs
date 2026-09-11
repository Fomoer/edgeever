import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("tailwind theme tokens", () => {
  test("web PostCSS loads the web Tailwind config that paints with CSS variables", () => {
    const postcss = readFileSync(new URL("../../postcss.config.js", import.meta.url), "utf8");
    const tailwind = readFileSync(new URL("../../tailwind.config.ts", import.meta.url), "utf8");

    expect(postcss).toContain('path.join(configDirectory, "tailwind.config.ts")');
    expect(tailwind).toContain("rgb(var(--slate-${shade}-rgb) / <alpha-value>)");
    expect(tailwind).toContain("rgb(var(--brand-green-${shade}-rgb) / <alpha-value>)");
    expect(tailwind).toContain("rgb(var(--amber-50-rgb) / <alpha-value>)");
    expect(tailwind).toContain("rgb(var(--rose-50-rgb) / <alpha-value>)");
    expect(tailwind).toContain("950: slate(950)");
  });
});
