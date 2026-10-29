import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { CHEMISTRY_EXAMPLES, insertChemistryExample, isChemistryLatex, mathFormulaSubjectOf } from "./chemistry-formula.ts";
import { renderMathPreview } from "./math-formula-preview.ts";

const locales = ["en-US", "pl", "zh-CN", "ja", "ru"].map((name) =>
  readFileSync(new URL(`../../../../../packages/shared/src/i18n/${name}.ts`, import.meta.url), "utf8"));

describe("chemistry formulas in the formula dialog", () => {
  test("recognizes mhchem formulas so they open in the chemistry mode", () => {
    for (const latex of ["\\ce{H2O}", "x + \\ce{CO2}", "\\pu{5 mol}", "\\ce {NaCl}"]) {
      expect(isChemistryLatex(latex)).toBe(true);
      expect(mathFormulaSubjectOf(latex)).toBe("chemistry");
    }
    for (const latex of ["", "E = mc^2", "\\cent", "\\cos x", "\\put"]) {
      expect(isChemistryLatex(latex)).toBe(false);
      expect(mathFormulaSubjectOf(latex)).toBe("math");
    }
  });

  test("every example renders inline and as a display formula, with a label in every locale", () => {
    expect(CHEMISTRY_EXAMPLES.length).toBeGreaterThanOrEqual(8);
    for (const example of CHEMISTRY_EXAMPLES) {
      expect(isChemistryLatex(example.latex)).toBe(true);
      expect(renderMathPreview(example.latex, "inline")).toContain('class="katex"');
      expect(renderMathPreview(example.latex, "block")).toContain("katex-display");
      for (const catalog of locales) expect(catalog).toMatch(new RegExp(`\\n\\s+${example.key}: "`));
    }
  });

  test("the preview renders reactions with arrows and charges instead of an error", () => {
    const html = renderMathPreview("\\ce{2H2 + O2 -> 2H2O}", "inline");
    expect(html).toContain("katex");
    expect(html).not.toContain("#cc0000");
    expect(renderMathPreview("\\ce{H2O", "inline")).toBe("");
  });

  // `|` marks the caret (or `[…]` a selection) in the field before the example is inserted.
  const insertAt = (template, example) => {
    const start = template.includes("[") ? template.indexOf("[") : template.indexOf("|");
    const value = template.replace(/[|[\]]/g, "");
    const end = template.includes("]") ? template.indexOf("]") - 1 : start;
    const result = insertChemistryExample(value, start, end, example);
    return `${result.value.slice(0, result.caret)}|${result.value.slice(result.caret)}`;
  };

  test("inserts an example into an empty field, at the caret, or inside an open command of the same kind", () => {
    expect(insertAt("|", "\\ce{H2O}")).toBe("\\ce{H2O}|");
    expect(insertAt("Water:|", "\\ce{H2O}")).toBe("Water: \\ce{H2O}|");
    expect(insertAt("a |b", "\\ce{H2O}")).toBe("a \\ce{H2O} |b");
    expect(insertAt("\\ce{A -> |2H2O}", "\\pu{1 mol}")).toBe("\\ce{A -> \\pu{1 mol} |2H2O}");
    expect(insertAt("\\ce{A + |B}", "\\ce{H2O}")).toBe("\\ce{A + H2O |B}");
    expect(insertAt("\\ce{A -> |}", "\\ce{H2O}")).toBe("\\ce{A -> H2O|}");
    expect(insertAt("\\pu{5 |}", "\\pu{123 kJ/mol}")).toBe("\\pu{5 123 kJ/mol|}");
    expect(insertAt("[\\ce{X}]", "\\pu{1 mol}")).toBe("\\pu{1 mol}|");
  });

  test("keeps the whole command when the caret is inside a different command", () => {
    // Review case: Ion inside \pu used to become \pu{5 SO4^2-} ("Double superscript").
    expect(insertAt("\\pu{5 |}", "\\ce{SO4^2-}")).toBe("\\pu{5 \\ce{SO4^2-}|}");
    expect(insertAt("\\ce{A -> |}", "\\pu{123 kJ/mol}")).toBe("\\ce{A -> \\pu{123 kJ/mol}|}");
    expect(renderMathPreview("\\pu{5 \\ce{SO4^2-}}", "inline")).toContain('class="katex"');
    expect(renderMathPreview("\\ce{A -> \\pu{123 kJ/mol}}", "inline")).toContain('class="katex"');
  });

  test("finds the enclosing command past nested groups and escaped braces", () => {
    expect(insertAt("\\ce{^{14}_{6}C + |}", "\\ce{H2O}")).toBe("\\ce{^{14}_{6}C + H2O|}");
    expect(insertAt("\\ce{^{14}_{6}C + |}", "\\pu{1 mol}")).toBe("\\ce{^{14}_{6}C + \\pu{1 mol}|}");
    // The innermost open command decides: \ce nested inside \pu.
    expect(insertAt("\\pu{5 \\ce{A + |}}", "\\ce{H2O}")).toBe("\\pu{5 \\ce{A + H2O|}}");
    expect(insertAt("\\pu{5 \\ce{A} |}", "\\ce{H2O}")).toBe("\\pu{5 \\ce{A} \\ce{H2O}|}");
    // A closed command before the caret does not count.
    expect(insertAt("\\pu{5 mol} and |", "\\ce{H2O}")).toBe("\\pu{5 mol} and \\ce{H2O}|");
    expect(insertAt("\\ce{\\{ |}", "\\ce{H2O}")).toBe("\\ce{\\{ H2O|}");
  });

  test("every example inserted into every kind of context still renders", () => {
    const contexts = ["|", "x = |", "\\ce{A -> |}", "\\ce{^{14}_{6}C + |}", "\\pu{5 |}", "\\ce{H2O} and |", "\\pu{5 \\ce{A + |}}"];
    for (const context of contexts) {
      for (const example of CHEMISTRY_EXAMPLES) {
        const result = insertAt(context, example.latex).replace("|", "");
        expect({ context, example: example.key, rendered: renderMathPreview(result, "inline") !== "" })
          .toEqual({ context, example: example.key, rendered: true });
      }
    }
  });

  test("the dialog keeps chemistry out of the visual math editor and uses shadcn tooltips", () => {
    const dialog = readFileSync(new URL("../dialogs/MathFormulaDialog.tsx", import.meta.url), "utf8");
    expect(dialog).toContain('setInputMode(isChemistryLatex(initialLatex) ? "source" : "visual")');
    expect(dialog).toContain('subject === "math" && !isChemistryLatex(latex)');
    expect(dialog).toContain("<TooltipContent>");
    expect(dialog).not.toMatch(/\btitle=/);
  });
});
