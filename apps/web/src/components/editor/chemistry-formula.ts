export type MathFormulaSubject = "math" | "chemistry";

/** Formulas written with the KaTeX mhchem commands `\ce{…}` or `\pu{…}`. */
export const isChemistryLatex = (latex: string) => /\\(?:ce|pu)\s*\{/.test(latex);

export const mathFormulaSubjectOf = (latex: string): MathFormulaSubject =>
  isChemistryLatex(latex) ? "chemistry" : "math";

export type ChemistryExample = {
  /** Key under `mathFormulaDialog.chemistryExamples`. */
  key: string;
  latex: string;
};

/** One-click starting points that cover the mhchem syntax people need most. */
export const CHEMISTRY_EXAMPLES: readonly ChemistryExample[] = [
  { key: "formula", latex: "\\ce{H2O}" },
  { key: "ion", latex: "\\ce{SO4^2-}" },
  { key: "reaction", latex: "\\ce{2H2 + O2 -> 2H2O}" },
  { key: "equilibrium", latex: "\\ce{N2 + 3H2 <=> 2NH3}" },
  { key: "conditions", latex: "\\ce{CaCO3 ->[\\Delta] CaO + CO2}" },
  { key: "gasPrecipitate", latex: "\\ce{Ag+ + Cl- -> AgCl v}" },
  { key: "states", latex: "\\ce{NaCl(s) -> Na+(aq) + Cl-(aq)}" },
  { key: "isotope", latex: "\\ce{^{14}_{6}C}" },
  { key: "hydrate", latex: "\\ce{CuSO4*5H2O}" },
  { key: "units", latex: "\\pu{123 kJ/mol}" },
];

type ChemistryCommand = "ce" | "pu";

const exampleCommand = (example: string) => /^\\(ce|pu)\{([\s\S]*)\}$/.exec(example) as
  | (RegExpExecArray & [string, ChemistryCommand, string])
  | null;

/**
 * The `\ce{…}` or `\pu{…}` whose braces are still open at the end of `before`,
 * found by brace depth so nested groups such as `^{14}_{6}` are skipped.
 */
const enclosingCommand = (before: string): ChemistryCommand | null => {
  const open: Array<ChemistryCommand | null> = [];
  for (let index = 0; index < before.length; index += 1) {
    const char = before[index];
    if (char === "\\") {
      index += 1;
      continue;
    }
    if (char === "{") {
      const command = /\\(ce|pu)\s*$/.exec(before.slice(0, index))?.[1] as ChemistryCommand | undefined;
      open.push(command ?? null);
    } else if (char === "}") {
      open.pop();
    }
  }
  for (let level = open.length - 1; level >= 0; level -= 1) {
    if (open[level]) return open[level]!;
  }
  return null;
};

/**
 * Inserts an example at the caret. An empty field takes the example as is. A
 * caret inside an open command of the same kind (`\ce` in `\ce`, `\pu` in
 * `\pu`) gets only the example's content, so the result stays one command.
 * Any other position keeps the whole command: `\ce` syntax inside `\pu` (or
 * the reverse) is not valid and cannot be rendered.
 */
export const insertChemistryExample = (
  value: string,
  selectionStart: number,
  selectionEnd: number,
  example: string,
) => {
  if (!value.trim()) return { value: example, caret: example.length };
  const before = value.slice(0, selectionStart);
  const after = value.slice(selectionEnd);
  const parsed = exampleCommand(example);
  const sameCommand = parsed !== null && enclosingCommand(before) === parsed[1];
  const text = sameCommand ? parsed[2] : example;
  // Keep the example apart from the text around it, but not from a closing brace.
  const leading = before && !/\s$/.test(before) ? " " : "";
  const trailing = after && !/^[\s}]/.test(after) ? " " : "";
  const inserted = `${leading}${text}${trailing}`;
  return { value: `${before}${inserted}${after}`, caret: before.length + inserted.length };
};
