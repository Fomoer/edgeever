import { useRef, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { MindMapOutlineError } from "@/lib/mind-map-outline";

type MindMapOutlineEditorProps = {
  value: string;
  error: MindMapOutlineError | null;
  readOnly: boolean;
  onChange: (value: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  pendingRemovalCount: number;
  onApplyRemoval: () => void;
  onRestore: () => void;
};

export const MindMapOutlineEditor = ({ value, error, readOnly, onChange, onUndo, onRedo, pendingRemovalCount, onApplyRemoval, onRestore }: MindMapOutlineEditorProps) => {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const replaceSelection = (next: string, start: number, end = start) => {
    onChange(next);
    requestAnimationFrame(() => inputRef.current?.setSelectionRange(start, end));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (readOnly || event.nativeEvent.isComposing) return;
    const input = event.currentTarget;
    if (!error && (event.metaKey || event.ctrlKey)) {
      const key = event.key.toLowerCase();
      if (key === "z" || key === "y") {
        event.preventDefault();
        event.stopPropagation();
        if (key === "y" || event.shiftKey) onRedo();
        else onUndo();
        return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      const lineStart = value.lastIndexOf("\n", input.selectionStart - 1) + 1;
      const lineEnd = value.indexOf("\n", lineStart);
      const line = value.slice(lineStart, lineEnd < 0 ? value.length : lineEnd);
      const indent = line.match(/^[\t ]*/)?.[0] ?? "";
      const marker = line.slice(indent.length).match(/^(?:[-*+]|\d+[.)]) /)?.[0] ?? "- ";
      const rootIsList = lineStart === 0 && /^(?:[-*+]|\d+[.)]) /.test(line);
      const insertion = lineStart === 0 ? `\n${rootIsList ? "  " : ""}- ` : `\n${indent}${marker}`;
      replaceSelection(
        value.slice(0, input.selectionStart) + insertion + value.slice(input.selectionEnd),
        input.selectionStart + insertion.length,
      );
      return;
    }
    if (event.key !== "Tab") return;
    event.preventDefault();
    event.stopPropagation();
    const start = value.lastIndexOf("\n", input.selectionStart - 1) + 1;
    const selectionEnd = input.selectionEnd > start && value[input.selectionEnd - 1] === "\n"
      ? input.selectionEnd - 1
      : input.selectionEnd;
    const end = value.indexOf("\n", selectionEnd);
    const blockEnd = end < 0 ? value.length : end;
    const block = value.slice(start, blockEnd).split("\n");
    let delta = 0;
    let firstLineDelta = 0;
    const changed = block.map((line, index) => {
      if (!line.trim()) return line;
      if (event.shiftKey) {
        if (line.startsWith("\t")) { delta -= 1; if (index === 0) firstLineDelta = -1; return line.slice(1); }
        if (line.startsWith("  ")) { delta -= 2; if (index === 0) firstLineDelta = -2; return line.slice(2); }
        return line;
      }
      if (start === 0 && index === 0) return line;
      delta += 2;
      if (index === 0) firstLineDelta = 2;
      return `  ${line}`;
    }).join("\n");
    replaceSelection(
      value.slice(0, start) + changed + value.slice(blockEnd),
      Math.max(start, input.selectionStart + firstLineDelta),
      Math.max(start, input.selectionEnd + delta),
    );
  };

  const visibleError = error?.reason === "empty" ? null : error;
  const errorKey = visibleError ? ({
    empty: "diagram.outlineErrorEmpty",
    indent: "diagram.outlineErrorIndent",
    root: "diagram.outlineErrorRoot",
    depth: "diagram.outlineErrorDepth",
    label: "diagram.outlineErrorLabel",
  } as const)[visibleError.reason] : null;

  return (
    <section className="absolute inset-0 z-40 flex min-h-0 flex-col bg-card" aria-label={t("diagram.outlineView")}>
      <div className="shrink-0 border-b border-slate-200 px-4 py-3">
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{t("diagram.outlineView")}</p>
        <p className="mt-0.5 text-xs text-slate-500">{t("diagram.outlineHint")}</p>
      </div>
      <div className="min-h-0 flex-1 p-3 sm:p-5">
        <Textarea
          ref={inputRef}
          autoFocus
          aria-label={t("diagram.outlineView")}
          aria-invalid={Boolean(visibleError)}
          aria-describedby={visibleError ? "mind-map-outline-error" : undefined}
          className="h-full min-h-0 resize-none rounded-lg border-slate-200 bg-card px-4 py-3 font-mono text-sm leading-7 shadow-none focus-visible:ring-2"
          readOnly={readOnly}
          spellCheck={false}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>
      {visibleError && errorKey ? (
        <div id="mind-map-outline-error" className="shrink-0 border-t border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700" role="alert">
          {t(errorKey, { line: visibleError.line })}
        </div>
      ) : null}
      {pendingRemovalCount > 0 ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900" role="alert">
          <span className="min-w-0 flex-1">{t("diagram.outlineRemovalWarning", { count: pendingRemovalCount })}</span>
          <Button size="sm" variant="outline" onClick={onRestore}>{t("diagram.outlineRestore")}</Button>
          <Button size="sm" variant="soft" onClick={onApplyRemoval}>{t("diagram.outlineApplyRemoval")}</Button>
        </div>
      ) : null}
    </section>
  );
};
