import { describe, expect, test } from "bun:test";
import katex from "katex";
// Only the shared math module is imported: it must register mhchem for every client.
import { createEdgeEverMathematics } from "./mathematics.ts";
import { docToMarkdown, markdownToDoc } from "./content.ts";

const options = { throwOnError: true, strict: "warn", trust: false };

describe("chemistry formulas", () => {
  test("the shared math extensions register \\ce and \\pu on KaTeX", () => {
    expect(createEdgeEverMathematics()).toHaveLength(2);
    for (const latex of [
      "\\ce{H2O}",
      "\\ce{SO4^2-}",
      "\\ce{2H2 + O2 -> 2H2O}",
      "\\ce{N2 + 3H2 <=> 2NH3}",
      "\\ce{CaCO3 ->[\\Delta] CaO + CO2}",
      "\\ce{Ag+ + Cl- -> AgCl v}",
      "\\ce{NaCl(s) -> Na+(aq) + Cl-(aq)}",
      "\\ce{^{14}_{6}C}",
      "\\ce{CuSO4*5H2O}",
      "\\pu{123 kJ/mol}",
    ]) {
      expect(katex.renderToString(latex, options)).toContain('class="katex"');
      expect(katex.renderToString(latex, { ...options, displayMode: true })).toContain("katex-display");
    }
  });

  test("keeps links and other untrusted commands inert inside \\ce", () => {
    const html = katex.renderToString("\\ce{\\href{javascript:alert(1)}{x}}", options);
    expect(html).not.toMatch(/<a[\s>]/);
    expect(html).not.toContain('href="javascript');
  });

  test("stores chemistry as ordinary inline and display math in Markdown", () => {
    const markdown = "Water $\\ce{H2O}$ forms:\n\n$$\\ce{2H2 + O2 -> 2H2O}$$\n";
    const doc = markdownToDoc(markdown);
    const nodes = JSON.stringify(doc);
    expect(nodes).toContain('"latex":"\\\\ce{H2O}"');
    expect(nodes).toContain('"latex":"\\\\ce{2H2 + O2 -> 2H2O}"');
    const roundTrip = docToMarkdown(doc);
    expect(roundTrip).toContain("$\\ce{H2O}$");
    expect(roundTrip).toContain("$$\n\\ce{2H2 + O2 -> 2H2O}\n$$");
    expect(markdownToDoc(roundTrip)).toEqual(doc);
  });
});
