/**
 * marked copies the entire remaining note after every paragraph when a block
 * tokenizer registers `start`. Searching only the open paragraph keeps an
 * interrupt inside that paragraph from walking the rest of the note.
 */
const OPEN_PARAGRAPH_END = /\n[ ]*\n/;

export const openBlockSource = (source: string): string => {
  const boundary = OPEN_PARAGRAPH_END.exec(source);
  if (!boundary) return source;
  return source.slice(0, boundary.index);
};

/**
 * Plain paragraphs above this size are parsed separately. marked's copy of the
 * remaining note then stays inside one piece instead of growing with the note.
 */
const PARSE_CHUNK_CHAR_LIMIT = 4096;

const FENCE_LINE = /^[ ]{0,3}(`{3,}|~{3,})(.*)$/;
const FENCE_CLOSE = /^[ ]{0,3}(`{3,}|~{3,})[ ]*$/;
const LIST_LINE = /^[ ]{0,3}(?:[-*+]|\d{1,9}[.)])([ \t]|$)/;
const QUOTE_LINE = /^[ ]{0,3}>/;
const INDENTED_LINE = /^(?:[ ]{4}|\t)\S/;
const TABLE_LINE = /^[ ]{0,3}\|/;
const REFERENCE_DEFINITION = /^[ ]{0,3}\[[^\]\n]+\]:/;

type FenceState = { char: string; length: number };
type LineSpan = { text: string; newline: number };
type ChunkBoundary = { omitStart: number; resume: number };

const isBlankLine = (line: string) => line.trim() === "";

/** A line that can sit on either side of a chunk boundary without joining a container. */
const isChunkAnchor = (line: string) =>
  !isBlankLine(line)
  && !LIST_LINE.test(line)
  && !QUOTE_LINE.test(line)
  && !INDENTED_LINE.test(line)
  && !TABLE_LINE.test(line)
  && !REFERENCE_DEFINITION.test(line);

const lineSpans = (markdown: string): LineSpan[] => {
  const lines: LineSpan[] = [];
  let start = 0;
  for (let index = 0; index <= markdown.length; index += 1) {
    if (index !== markdown.length && markdown[index] !== "\n") continue;
    lines.push({ text: markdown.slice(start, index), newline: index });
    start = index + 1;
  }
  return lines;
};

const dollarPairs = (line: string) => line.split("$$").length - 1;

/**
 * Indexes of paragraph separators (`\n\n`) that can be omitted between parse
 * chunks. Lists, quotes, tables, fences, display math, galleries, and details
 * stay in one piece.
 */
const paragraphChunkBoundaries = (markdown: string): ChunkBoundary[] => {
  const lines = lineSpans(markdown);
  const boundaries: ChunkBoundary[] = [];
  let fence: FenceState | null = null;
  let math = false;
  let gallery = false;
  let details = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.text ?? "";
    const protectedRegion = Boolean(fence || math || gallery || details > 0);

    if (!protectedRegion && index > 0 && isBlankLine(line)) {
      const previous = lines[index - 1]?.text ?? "";
      if (!isBlankLine(previous) && isChunkAnchor(previous)) {
        let runEnd = index;
        while (runEnd + 1 < lines.length && isBlankLine(lines[runEnd + 1]?.text ?? "")) runEnd += 1;
        const next = lines[runEnd + 1]?.text ?? "";
        const omitStart = lines[index - 1]?.newline ?? -1;
        if (isChunkAnchor(next) && omitStart >= 0) {
          // Drop the first newline. The rest of the run stays with the next
          // piece, which keeps the same empty paragraphs as one parse.
          boundaries.push({ omitStart, resume: omitStart + 1 });
        }
        index = runEnd;
      }
    }

    if (fence) {
      const close = FENCE_CLOSE.exec(line);
      if (close?.[1] && close[1][0] === fence.char && close[1].length >= fence.length) fence = null;
      continue;
    }
    if (math) {
      if (dollarPairs(line) % 2 === 1) math = false;
      continue;
    }
    if (gallery) {
      if (line.includes("<!-- /edgeever:image-gallery -->")) gallery = false;
      continue;
    }
    if (isBlankLine(line)) continue;

    const openedFence = FENCE_LINE.exec(line);
    if (openedFence?.[1]) {
      fence = { char: openedFence[1][0] ?? "`", length: openedFence[1].length };
      continue;
    }
    if (dollarPairs(line) % 2 === 1) {
      math = true;
      continue;
    }
    if (line.includes("<!-- edgeever:image-gallery ") && !line.includes("<!-- /edgeever:image-gallery -->")) {
      gallery = true;
    }
    const opened = line.match(/<details\b/gi)?.length ?? 0;
    const closed = line.match(/<\/details\b/gi)?.length ?? 0;
    details = Math.max(0, details + opened - closed);
  }

  return boundaries;
};

/** Split a long note into parse pieces. Short notes and unsplittable blocks stay intact. */
export const splitMarkdownParseChunks = (
  markdown: string,
  maxChars = PARSE_CHUNK_CHAR_LIMIT,
): string[] => {
  if (markdown.length <= maxChars) return [markdown];

  const boundaries = paragraphChunkBoundaries(markdown);
  if (boundaries.length === 0) return [markdown];

  const pieces: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  for (const boundary of boundaries) {
    pieces.push({ start: cursor, end: boundary.omitStart });
    cursor = boundary.resume;
  }
  pieces.push({ start: cursor, end: markdown.length });

  const chunks: string[] = [];
  let groupStart = pieces[0]?.start ?? 0;
  let groupEnd = pieces[0]?.end ?? 0;
  let groupSize = groupEnd - groupStart;

  const flush = () => {
    if (groupEnd <= groupStart && chunks.length > 0) return;
    chunks.push(markdown.slice(groupStart, groupEnd));
  };

  for (let index = 1; index < pieces.length; index += 1) {
    const piece = pieces[index];
    if (!piece) continue;
    if (groupSize > 0 && piece.end - groupStart > maxChars) {
      flush();
      groupStart = piece.start;
      groupEnd = piece.end;
      groupSize = piece.end - piece.start;
      continue;
    }
    groupEnd = piece.end;
    groupSize = groupEnd - groupStart;
  }
  flush();
  return chunks.filter((chunk) => chunk.length > 0);
};
