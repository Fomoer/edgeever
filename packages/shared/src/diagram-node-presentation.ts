import type { DiagramNodeShape } from "./diagram";

export const visualTextUnits = (label: string) => Array.from(label).reduce(
  (total, character) => total + (/[^\u0000-\u00ff]/.test(character) ? 1 : 0.55),
  0,
);

export const compactFlowchartNodeSize = (shape: DiagramNodeShape) => (
  shape === "decision"
    ? { width: 116, height: 72 }
    : shape === "terminator"
      ? { width: 116, height: 44 }
      : { width: 124, height: 44 }
);

// Shared by semantic creation and rendering so layout reserves space for every line.
export const flowchartNodePresentation = (shape: DiagramNodeShape, label: string) => {
  const base = compactFlowchartNodeSize(shape);
  const decision = shape === "decision";
  const width = Math.max(decision ? 184 : base.width, Math.min(decision ? 220 : 240,
    Math.ceil(Math.max(...label.split("\n").map(visualTextUnits), 0) * 14 + (decision ? 64 : 32))));
  const capacity = (width - (decision ? width / 2 : 32)) / 14;
  const lines = label.split("\n").flatMap((paragraph) => {
    const result: string[] = [];
    let line = "";
    for (const character of Array.from(paragraph)) {
      if (line && visualTextUnits(line + character) > capacity) { result.push(line); line = ""; }
      line += character;
    }
    result.push(line);
    return result;
  });
  return { width, height: Math.max(base.height, lines.length * 18 * (decision ? 2 : 1) + 24), text: lines.join("\n") };
};

