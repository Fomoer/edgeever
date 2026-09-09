import type { DiagramNodeShape } from "./diagram";

export const visualTextUnits = (label: string) => Array.from(label).reduce(
  (total, character) => total + (/[^\u0000-\u00ff]/.test(character) ? 1 : 0.55),
  0,
);

export const compactFlowchartNodeSize = (shape: DiagramNodeShape) => (
  shape === "decision"
    ? { width: 176, height: 80 }
    : shape === "terminator"
      ? { width: 140, height: 44 }
      : { width: 176, height: 56 }
);

const FLOWCHART_CHAR_WIDTH = 13;
const FLOWCHART_LINE_HEIGHT = 18;
const FLOWCHART_DECISION_TEXT_RATIO = 0.7;

const wrapFlowchartLabel = (label: string, capacity: number) => label.split("\n").flatMap((paragraph) => {
  const result: string[] = [];
  let line = "";
  for (const character of Array.from(paragraph)) {
    if (line && visualTextUnits(line + character) > capacity) {
      result.push(line);
      line = "";
    }
    line += character;
  }
  result.push(line);
  return result;
});

// Shared by semantic creation and rendering so layout reserves space for every line.
export const flowchartNodePresentation = (shape: DiagramNodeShape, label: string) => {
  const base = compactFlowchartNodeSize(shape);
  const decision = shape === "decision";
  const terminator = shape === "terminator";
  const padX = terminator ? 36 : 28;
  const width = base.width;
  const capacity = Math.max(4, (decision ? width * FLOWCHART_DECISION_TEXT_RATIO : width - padX) / FLOWCHART_CHAR_WIDTH);
  const lines = wrapFlowchartLabel(label, capacity);
  const textHeight = Math.max(lines.length, 1) * FLOWCHART_LINE_HEIGHT;
  const height = Math.max(
    base.height,
    decision ? Math.ceil(textHeight / (1 - FLOWCHART_DECISION_TEXT_RATIO)) : textHeight + (terminator ? 16 : 18),
  );
  return { width, height, text: lines.join("\n") };
};

