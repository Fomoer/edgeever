import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, type ClipboardEvent as ReactClipboardEvent } from "react";
import CodeMirror, {
  EditorView,
  Decoration,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
  type ReactCodeMirrorRef,
  type Extension,
} from "@uiw/react-codemirror";
import { isolateHistory } from "@codemirror/commands";
import { getMarkdownReplacementChanges, getMarkdownSearchMatches } from "./markdown-source-search";
import { markdown } from "@codemirror/lang-markdown";
import {
  githubLightInit,
  githubDark,
  atomone,
  tokyoNight,
  tokyoNightStorm,
  dracula,
  nord,
  monokai,
  solarizedLightInit,
  solarizedDark,
  vscodeDark,
  xcodeLightInit,
  sublime,
  duotoneLightInit,
  duotoneDark,
  gruvboxDark,
} from "@uiw/codemirror-themes-all";
import type { MarkdownThemeName } from "../ThemeProvider";
import { isPrimaryModifierPressed } from "@/lib/app-helpers";
import { getAiSlashCommandStart } from "@/lib/editor-shortcuts";
import { lightMarkdownHighlightStyles } from "@/lib/markdown-source-highlight";
import { cn } from "@/lib/utils";
import { editorFontLoadState } from "@/lib/editor-catalog-fonts";
import { getResourceFilesFromDataTransfer } from "./editor-pane-helpers";

type PendingPaste = { from: number; to: number; originalText: string };

export interface MarkdownSourceEditorRef {
  getScrollContainer: () => HTMLElement | null;
  getSelection: () => { from: number; to: number };
  setSelection: (from: number, to: number) => void;
  replaceDocument: (value: string) => void;
  replaceSearchMatches: (query: string, replacement: string) => void;
  focus: () => void;
  insertText: (text: string, from?: number, to?: number) => void;
  sliceText: (from: number, to: number) => string;
  getDocumentLength: () => number;
  getSelectionCoordinates: () => { top: number; left: number; bottom: number; right: number } | null;
}

export interface MarkdownSourceEditorProps {
  memoId: string;
  value: string;
  onChange: (value: string) => void;
  onPasteFiles?: (files: File[]) => Promise<string>;
  themeName: MarkdownThemeName;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  onSlashCommandTrigger?: (commandStart: number) => void;
  onLinkShortcut?: () => void;
  onSelectionChange?: () => void;
  onReady?: () => void;
  searchQuery?: string;
  searchIndex?: number;
}

export const CODE_MIRROR_THEME_MAP: Record<MarkdownThemeName, Extension> = {
  "github-light": githubLightInit({ styles: lightMarkdownHighlightStyles }),
  "github-dark": githubDark,
  "one-dark": atomone,
  "tokyo-night": tokyoNight,
  "tokyo-night-storm": tokyoNightStorm,
  dracula,
  nord,
  monokai,
  "solarized-light": solarizedLightInit({ styles: lightMarkdownHighlightStyles }),
  "solarized-dark": solarizedDark,
  "vscode-dark": vscodeDark,
  "xcode-light": xcodeLightInit({ styles: lightMarkdownHighlightStyles }),
  sublime,
  "duotone-light": duotoneLightInit({ styles: lightMarkdownHighlightStyles }),
  "duotone-dark": duotoneDark,
  "gruvbox-dark": gruvboxDark,
};

const baseEditorTheme = EditorView.theme({
  "&": {
    height: "100%",
    width: "100%",
    fontSize: "var(--editor-body-font-size, 16px)",
    fontFamily:
      'var(--editor-code-font-family, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace)',
  },
  ".cm-scroller": {
    overflow: "auto",
    height: "100%",
    lineHeight: "1.6",
    fontFamily: "inherit",
  },
  ".cm-content": {
    padding: "16px var(--editor-reading-gutter, 24px) 64px",
    minHeight: "100%",
  },
  "@media (min-width: 1024px)": {
    ".cm-scroller": {
      scrollbarGutter: "stable",
    },
  },
  ".cm-line": {
    padding: "0",
  },
  ".cm-gutters": {
    borderRight: "1px solid rgba(128, 128, 128, 0.15)",
    backgroundColor: "transparent",
  },
  "&.cm-focused": {
    outline: "none",
  },
});

export const MarkdownSourceEditor = forwardRef<MarkdownSourceEditorRef, MarkdownSourceEditorProps>(
  (
    {
      memoId,
      value,
      onChange,
      onPasteFiles,
      themeName,
      readOnly = false,
      placeholder,
      className,
      ariaLabel,
      onSlashCommandTrigger,
      onLinkShortcut,
      onSelectionChange,
      onReady,
      searchQuery = "",
      searchIndex = 0,
    },
    ref,
  ) => {
    const cmRef = useRef<ReactCodeMirrorRef | null>(null);
    const memoIdRef = useRef(memoId);
    memoIdRef.current = memoId;
    const pendingPastesRef = useRef(new Set<PendingPaste>());
    const onSelectionChangeRef = useRef(onSelectionChange);
    onSelectionChangeRef.current = onSelectionChange;

    useEffect(() => {
      // A CSS variable change and a later font download can both change glyph
      // widths without changing the document. Refresh CodeMirror's measurements.
      const measure = () => cmRef.current?.view?.requestMeasure();
      const observer = new MutationObserver(measure);
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["style", "data-editor-code-font"],
      });
      const unsubscribe = editorFontLoadState.subscribe(measure);
      return () => { observer.disconnect(); unsubscribe(); };
    }, []);

    useEffect(() => {
      let frame = 0;
      let cancelled = false;
      let attempts = 0;
      const notifyWhenReady = () => {
        if (cancelled) return;
        if (cmRef.current?.view) onReady?.();
        else if (attempts++ < 120) frame = window.requestAnimationFrame(notifyWhenReady);
      };
      notifyWhenReady();
      return () => {
        cancelled = true;
        window.cancelAnimationFrame(frame);
      };
    }, [onReady]);

    useImperativeHandle(
      ref,
      () => ({
        getScrollContainer: () => {
          return (
            cmRef.current?.view?.scrollDOM ??
            (cmRef.current?.editor?.querySelector(".cm-scroller") as HTMLElement | null)
          );
        },
        getSelection: () => {
          const view = cmRef.current?.view;
          if (!view) return { from: 0, to: 0 };
          const main = view.state.selection.main;
          return { from: main.from, to: main.to };
        },
        setSelection: (from: number, to: number) => {
          const view = cmRef.current?.view;
          if (!view) return;
          const safeFrom = Math.max(0, Math.min(from, view.state.doc.length));
          const safeTo = Math.max(safeFrom, Math.min(to, view.state.doc.length));
          view.dispatch({
            selection: { anchor: safeFrom, head: safeTo },
            scrollIntoView: true,
          });
        },
        replaceSearchMatches: (query: string, replacement: string) => {
          const view = cmRef.current?.view;
          if (!view || view.state.readOnly) return;
          const changes = getMarkdownReplacementChanges(view.state.doc, query, replacement);
          if (changes.length) view.dispatch({ changes, userEvent: "input.replace", annotations: isolateHistory.of("full") });
        },
        replaceDocument: (value: string) => {
          const view = cmRef.current?.view;
          if (!view || view.state.doc.toString() === value) return;
          const anchor = Math.min(view.state.selection.main.anchor, value.length);
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: value },
            selection: { anchor },
          });
        },
        focus: () => {
          cmRef.current?.view?.focus();
        },
        insertText: (text: string, from?: number, to?: number) => {
          const view = cmRef.current?.view;
          if (!view) return;
          const main = view.state.selection.main;
          const insertFrom = from ?? main.from;
          const insertTo = to ?? main.to;
          view.dispatch({
            changes: { from: insertFrom, to: insertTo, insert: text },
            selection: { anchor: insertFrom + text.length },
            scrollIntoView: true,
          });
        },
        sliceText: (from: number, to: number) => {
          const view = cmRef.current?.view;
          if (!view) return "";
          const length = view.state.doc.length;
          const safeFrom = Math.max(0, Math.min(from, length));
          const safeTo = Math.max(safeFrom, Math.min(to, length));
          return view.state.doc.sliceString(safeFrom, safeTo);
        },
        getDocumentLength: () => cmRef.current?.view?.state.doc.length ?? 0,
        getSelectionCoordinates: () => {
          const view = cmRef.current?.view;
          if (!view) return null;
          const main = view.state.selection.main;
          const coords = view.coordsAtPos(main.from);
          if (!coords) return null;
          return {
            top: coords.top,
            left: coords.left,
            bottom: coords.bottom,
            right: coords.right,
          };
        },
      }),
      [],
    );

    const activeThemeExtension = useMemo(() => {
      return CODE_MIRROR_THEME_MAP[themeName] ?? tokyoNight;
    }, [themeName]);

    const extensions = useMemo(() => {
      return [
        ViewPlugin.fromClass(class {
          decorations: DecorationSet;
          constructor(view: EditorView) { this.decorations = this.highlight(view); }
          update(update: ViewUpdate) {
            if (update.docChanged) this.decorations = this.highlight(update.view);
          }
          highlight(view: EditorView) {
            return Decoration.set(getMarkdownSearchMatches(view.state.doc, searchQuery).map((match, index) =>
              Decoration.mark({ class: index === searchIndex
                ? "edgeever-search-match edgeever-search-match-active"
                : "edgeever-search-match" }).range(match.from, match.to)), true);
          }
        }, { decorations: (plugin) => plugin.decorations }),
        markdown(),
        EditorView.lineWrapping,
        baseEditorTheme,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            for (const pending of pendingPastesRef.current) {
              pending.from = update.changes.mapPos(pending.from, -1);
              pending.to = update.changes.mapPos(pending.to, 1);
            }
          }
          if (update.selectionSet || update.docChanged) onSelectionChangeRef.current?.();
        }),
      ];
    }, [searchQuery, searchIndex]);

    const handlePasteCapture = useCallback((event: ReactClipboardEvent<HTMLDivElement>) => {
      if (readOnly || !onPasteFiles) return;
      const files = getResourceFilesFromDataTransfer(event.clipboardData);
      if (!files.length) return;
      const view = cmRef.current?.view;
      if (!view) return;
      event.preventDefault();
      event.stopPropagation();
      const selection = view.state.selection.main;
      const pending: PendingPaste = {
        from: selection.from,
        to: selection.to,
        originalText: view.state.doc.sliceString(selection.from, selection.to),
      };
      const targetMemoId = memoId;
      pendingPastesRef.current.add(pending);
      void onPasteFiles(files).then((markdown) => {
        pendingPastesRef.current.delete(pending);
        if (!markdown || cmRef.current?.view !== view || memoIdRef.current !== targetMemoId) return;
        const unchanged = view.state.doc.sliceString(pending.from, pending.to) === pending.originalText;
        const from = unchanged ? pending.from : pending.to;
        const shouldMoveCursor = view.hasFocus && view.state.selection.main.from === pending.to
          && view.state.selection.main.to === pending.to;
        view.dispatch({
          changes: { from, to: pending.to, insert: markdown },
          ...(shouldMoveCursor ? { selection: { anchor: from + markdown.length }, scrollIntoView: true } : {}),
        });
      }).catch(() => {
        pendingPastesRef.current.delete(pending);
      });
    }, [memoId, onPasteFiles, readOnly]);

    const handleKeyDown = useCallback(
      (event: React.KeyboardEvent | KeyboardEvent) => {
        // Link shortcut uses the platform primary modifier, leaving macOS Control+K for deleting to the line end.
        if (
          isPrimaryModifierPressed(event) &&
          !event.altKey &&
          !event.shiftKey &&
          event.key.toLowerCase() === "k"
        ) {
          event.preventDefault();
          onLinkShortcut?.();
          return;
        }

        // AI Slash Command check on single key press
        if (
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey &&
          !event.shiftKey &&
          !(event as KeyboardEvent).isComposing
        ) {
          const view = cmRef.current?.view;
          if (view) {
            const main = view.state.selection.main;
            if (main.empty) {
              const caretPosition = main.head;
              const textBefore = view.state.doc.sliceString(0, caretPosition);
              const commandStart = getAiSlashCommandStart({
                caretPosition,
                insertedText: event.key,
                textBefore,
              });

              if (commandStart !== null) {
                event.preventDefault();
                // Replace the trigger characters (e.g., "/a") with empty string and open AI Assistant
                view.dispatch({
                  changes: { from: commandStart, to: caretPosition, insert: "" },
                  selection: { anchor: commandStart },
                });
                onSlashCommandTrigger?.(commandStart);
              }
            }
          }
        }
      },
      [onLinkShortcut, onSlashCommandTrigger],
    );

    const handleCodeMirrorChange = useCallback(
      (val: string) => {
        onChange(val);
      },
      [onChange],
    );

    return (
      <div
        className={cn(
          "relative h-full w-full overflow-hidden edgeever-markdown-source-editor",
          className,
        )}
        aria-label={ariaLabel}
        onPasteCapture={handlePasteCapture}
      >
        <CodeMirror
          ref={cmRef}
          value={value}
          theme={activeThemeExtension}
          onChange={handleCodeMirrorChange}
          onKeyDown={handleKeyDown}
          extensions={extensions}
          readOnly={readOnly}
          editable={!readOnly}
          placeholder={placeholder}
          height="100%"
          basicSetup={{
            lineNumbers: false,
            foldGutter: false,
            highlightActiveLineGutter: false,
            highlightActiveLine: false,
            dropCursor: true,
            allowMultipleSelections: false,
            indentOnInput: true,
            bracketMatching: true,
            closeBrackets: true,
            autocompletion: false,
            rectangularSelection: false,
            crosshairCursor: false,
            // Occurrence highlighting paints other copies of the selected
            // text with a selection-like color, so a short phrase also
            // lights up later list items and looks like extra selection.
            highlightSelectionMatches: false,
            closeBracketsKeymap: true,
            searchKeymap: false,
            foldKeymap: false,
            completionKeymap: false,
            lintKeymap: false,
          }}
          className="h-full w-full"
        />
      </div>
    );
  },
);

MarkdownSourceEditor.displayName = "MarkdownSourceEditor";
