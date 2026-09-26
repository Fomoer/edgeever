import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Download, LoaderCircle, Presentation, Sparkles, Undo2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { INFOGRAPHIC_AGENT_SOURCE_MAX_LENGTH, markdownToDoc, infographicFallbackMarkdown, parseInfographicDocument, serializeInfographicDocument, type InfographicConversationTurn, type InfographicDocument, type MemoDetail, type MemoEditSession } from "@edgeever/shared";
import type { Infographic as InfographicInstance, SyntaxParseResult } from "@antv/infographic";
import { Button } from "@/components/ui/button";
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { MemoTitleInput } from "@/components/MemoTitleInput";
import { api } from "@/lib/api";
import { createLocalEditSession, requiresLocalEditSession } from "@/components/editor/editor-pane-helpers";
import { buildInfographicSyntax, buildOfficialInfographicSyntax, infographicAgentCandidates, INFOGRAPHIC_TEMPLATES, parseGeneratedOfficialData, type InfographicItem } from "@/lib/infographic-generation";
import type { EdgeEverRepository } from "@/lib/repository";

type Props = {
  memo: MemoDetail;
  repository: EdgeEverRepository;
  readOnly: boolean;
  onBackToList: () => void;
  onSaved: (memo: MemoDetail) => Promise<void>;
};

const plainLine = (value: string) => value.replace(/\s+/g, " ").trim();
const parseItemLine = (line: string) => {
  const [label, description] = line.split("|").map(plainLine);
  return { label, description };
};
const parseFormItems = (template: string, text: string): InfographicItem[] => {
  if (!template.startsWith("compare-binary-")) {
    return text.split("\n").map(parseItemLine).filter((item) => item.label);
  }
  const roots: Array<{ label: string; description?: string; children: Array<{ label: string; description?: string }> }> = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const child = /^\s+-\s+(.+)$/.exec(line);
    if (child) {
      const item = parseItemLine(child[1]);
      if (roots.length && item.label) roots[roots.length - 1].children.push(item);
    } else {
      const item = parseItemLine(line);
      if (item.label) roots.push({ ...item, children: [] });
    }
  }
  return roots;
};
const formatFormItems = (template: string, items: InfographicItem[]) =>
  template.startsWith("compare-binary-")
    ? items.flatMap((item) => [
      item.description ? `${item.label} | ${item.description}` : item.label,
      ...(item.children ?? []).map((child) => `  - ${child.label}${child.description ? ` | ${child.description}` : ""}`),
    ]).join("\n")
    : items.map((item) => item.description ? `${item.label} | ${item.description}` : item.label).join("\n");
const buildSyntax = (template: string, title: string, description: string, items: string, dark: boolean) =>
  buildInfographicSyntax({
    template, title, description, dark,
    items: parseFormItems(template, items),
  });

const parseSimpleForm = (syntax: string) => {
  const lines = syntax.trim().split("\n");
  const template = lines[0]?.match(/^infographic ([\w-]+)$/)?.[1];
  if (!template || !INFOGRAPHIC_TEMPLATES.some((item) => item.id === template)) return null;
  const dark = lines[1] === "theme dark";
  const dataIndex = dark ? 2 : 1;
  if (lines[dataIndex] !== "data") return null;
  let heading = "";
  let description = "";
  const items: string[] = [];
  let inList = false;
  const comparison = template.startsWith("compare-binary-");
  let comparisonChildIndex = 0;
  let comparisonRootIndex = -1;
  for (const line of lines.slice(dataIndex + 1)) {
    if (line.startsWith("  title ") && !inList) heading = line.slice(8);
    else if (line.startsWith("  desc ") && !inList) description = line.slice(7);
    else if (line === (template.startsWith("sequence-") ? "  sequences" : comparison || /^(compare-)?quadrant-/.test(template) ? "  compares" : "  lists")) inList = true;
    else if (comparison && line.startsWith("    - label ") && inList) {
      comparisonRootIndex = items.push(line.slice(12)) - 1;
      comparisonChildIndex = 0;
    }
    else if (comparison && line === "      children" && inList) continue;
    else if (comparison && line.startsWith("        - label ") && inList) {
      if (comparisonChildIndex > 0) items.push(`  - ${line.slice(16)}`);
      comparisonChildIndex += 1;
    }
    else if (comparison && line.startsWith("          desc ") && inList && items.length && comparisonChildIndex > 0) {
      const target = comparisonChildIndex === 1 ? comparisonRootIndex : items.length - 1;
      items[target] += ` | ${line.slice(15)}`;
    }
    else if (!comparison && line.startsWith("    - label ") && inList) items.push(line.slice(12));
    else if (!comparison && line.startsWith("      desc ") && inList && items.length) items[items.length - 1] += ` | ${line.slice(11)}`;
    else return null;
  }
  const itemText = items.join("\n");
  return buildSyntax(template, heading, description, itemText, dark) === syntax.trim()
    ? { template, heading, description, items: itemText, dark }
    : null;
};

type VisualTextChange = {
  changes?: Array<{ path: string; indexes?: number[]; value?: unknown }>;
};

const applyVisualTextChange = (syntax: string, payload: VisualTextChange) => {
  const form = parseSimpleForm(syntax);
  if (!form || !payload.changes?.length) return null;
  const formItems = parseFormItems(form.template, form.items);
  let changed = false;
  for (const change of payload.changes) {
    if (typeof change.value === "string" && change.path === "data.title") {
      form.heading = plainLine(change.value);
    } else if (typeof change.value === "string" && change.path === "data.desc") {
      form.description = plainLine(change.value);
    } else if (change.path === "data.items" && change.indexes && change.value && typeof change.value === "object") {
      const comparison = form.template.startsWith("compare-binary-");
      if (comparison ? change.indexes.length !== 2 : change.indexes.length !== 1) return null;
      const index = change.indexes[0];
      if (!Number.isInteger(index) || index < 0 || index >= formItems.length) return null;
      const value = change.value as Record<string, unknown>;
      const childIndex = comparison ? change.indexes[1] : 0;
      const item = comparison && childIndex > 0 ? formItems[index].children?.[childIndex - 1] : formItems[index];
      if (!item) return null;
      const label = typeof value.label === "string" ? plainLine(value.label) : item.label;
      const description = typeof value.desc === "string" ? plainLine(value.desc) : item.description;
      if (!label) return null;
      item.label = label;
      item.description = description;
    } else {
      return null;
    }
    changed = true;
  }
  return changed ? buildSyntax(form.template, form.heading, form.description, formatFormItems(form.template, formItems), form.dark) : null;
};

const editableOfficialData = (syntax: string, parsed: SyntaxParseResult) => {
  if (parsed.errors.length || !parsed.options.template || !parsed.options.data) return null;
  const data = parsed.options.data as Record<string, unknown>;
  const dark = syntax.split("\n")[1] === "theme dark";
  return buildOfficialInfographicSyntax(parsed.options.template, data, dark) === syntax.trim() ? { data, dark } : null;
};

const applyOfficialVisualTextChange = (syntax: string, payload: VisualTextChange, parsed: SyntaxParseResult) => {
  const editable = editableOfficialData(syntax, parsed);
  if (!editable || !payload.changes?.length || !parsed.options.template) return null;
  const data = structuredClone(editable.data);
  const items = (data.lists ?? data.sequences ?? data.compares ?? data.nodes ?? data.values ?? (data.root ? [data.root] : data.items)) as Array<Record<string, unknown>> | undefined;
  for (const change of payload.changes) {
    if (typeof change.value === "string" && change.path === "data.title") data.title = plainLine(change.value);
    else if (typeof change.value === "string" && change.path === "data.desc") data.desc = plainLine(change.value);
    else if (change.path === "data.items" && change.indexes?.length && change.value && typeof change.value === "object" && items) {
      let item: Record<string, unknown> | undefined = items[change.indexes[0]];
      for (const index of change.indexes.slice(1)) item = (item?.children as Array<Record<string, unknown>> | undefined)?.[index];
      if (!item) return null;
      const value = change.value as Record<string, unknown>;
      if (typeof value.label === "string") item.label = plainLine(value.label);
      if (typeof value.desc === "string") item.desc = plainLine(value.desc);
      if (typeof value.value === "number" && Number.isFinite(value.value)) item.value = value.value;
    } else return null;
  }
  return buildOfficialInfographicSyntax(parsed.options.template, data, editable.dark);
};

const downloadDataUrl = (dataUrl: string, filename: string) => {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
};

export default function InfographicEditorPane({ memo, repository, readOnly, onBackToList, onSaved }: Props) {
  const { t, i18n } = useTranslation();
  const parsed = useMemo(() => parseInfographicDocument(memo.contentMarkdown), [memo.contentMarkdown]);
  const [title, setTitle] = useState(memo.title ?? "");
  const [syntax, setSyntax] = useState(parsed?.syntax ?? "");
  const [history, setHistory] = useState<InfographicConversationTurn[]>(parsed?.history ?? []);
  const [prompt, setPrompt] = useState("");
  const [activeTurn, setActiveTurn] = useState<{ prompt: string; response: string; template?: string; decision?: string; question?: string } | null>(null);
  const [previousGeneration, setPreviousGeneration] = useState<{ title: string; syntax: string; turnId: string } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const [ready, setReady] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState(JSON.stringify([memo.title ?? "", parsed?.syntax ?? "", parsed?.history ?? []]));
  const [savedHistorySnapshot, setSavedHistorySnapshot] = useState(JSON.stringify(parsed?.history ?? []));
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<InfographicInstance | null>(null);
  const sessionRef = useRef<MemoEditSession | null>(null);
  const generationControllerRef = useRef<AbortController | null>(null);
  const memoRef = useRef(memo);
  const saveRef = useRef<() => void>(() => undefined);
  const snapshot = JSON.stringify([title, syntax, history]);
  const dirty = snapshot !== savedSnapshot;
  const historyDirty = JSON.stringify(history) !== savedHistorySnapshot;

  useEffect(() => {
    memoRef.current = memo;
  }, [memo]);

  useEffect(() => () => generationControllerRef.current?.abort(), []);

  useEffect(() => {
    if (readOnly) return;
    let cancelled = false;
    if (requiresLocalEditSession(memo)) {
      sessionRef.current = createLocalEditSession(memo);
      setReady(true);
      return;
    }
    void api.createMemoEditSession(memo.id).then(({ editSession }) => {
      if (!cancelled) { sessionRef.current = editSession; setReady(true); }
    }).catch(() => { if (!cancelled) setError(t("infographic.sessionError")); });
    return () => { cancelled = true; };
  }, [memo.id, readOnly, t]);

  useEffect(() => {
    setPreviewReady(false);
    if (!syntax.trim()) { instanceRef.current?.destroy(); instanceRef.current = null; setRenderError(null); return; }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void import("@antv/infographic").then(({ Infographic, Interaction, DblClickEditText, SelectHighlight, parseSyntax, getTemplate }) => {
        if (cancelled || !containerRef.current) return;
        const parsedSyntax = parseSyntax(syntax);
        if (parsedSyntax.errors.length || !parsedSyntax.options.template || !getTemplate(parsedSyntax.options.template)) {
          setRenderError(parsedSyntax.errors[0]?.message ?? t("infographic.invalidSyntax"));
          instanceRef.current?.destroy(); instanceRef.current = null;
          return;
        }
        try {
          instanceRef.current?.destroy();
          const visualTextEditable = !readOnly && Boolean(parseSimpleForm(syntax) || editableOfficialData(syntax, parsedSyntax));
          class SelectGraphicElement extends Interaction {
            name = "select-graphic-element";
            private svg: SVGSVGElement | null = null;
            private handleClick = (event: MouseEvent) => {
              if (!(event.target instanceof Element)) return;
              if (event.target.closest('[contenteditable="true"]')) return;
              const text = event.target.closest('foreignObject[data-element-type="title"], foreignObject[data-element-type="desc"], foreignObject[data-element-type="item-label"], foreignObject[data-element-type="item-desc"]');
              const shape = event.target.closest('[data-element-type="shape"], [data-element-type="item-icon"], [data-element-type="edit-area"]');
              let target = text ?? shape ?? event.target.closest("rect, ellipse, circle, path, polygon, polyline, line, image, text");
              if (shape?.getAttribute("data-element-type") === "shape") {
                let group = shape.parentElement;
                while (group && group.parentElement?.getAttribute("data-element-type") !== "items-group") group = group.parentElement;
                if (group) target = group;
              }
              if (target) this.interaction.select([target as Parameters<typeof this.interaction.select>[0][number]], event.shiftKey ? "toggle" : "replace");
              else this.interaction.clearSelection();
            };
            private handleKeyDown = (event: KeyboardEvent) => {
              if (event.key === "Escape") this.interaction.clearSelection();
            };
            override init(options: Parameters<(typeof DblClickEditText)["prototype"]["init"]>[0]) {
              super.init(options);
              const svg = options.editor.getDocument();
              this.svg = svg;
              svg.addEventListener("click", this.handleClick);
              document.addEventListener("keydown", this.handleKeyDown);
            }
            override destroy() {
              this.svg?.removeEventListener("click", this.handleClick);
              document.removeEventListener("keydown", this.handleKeyDown);
            }
          }
          const instance = new Infographic({
            container: containerRef.current, width: "100%", height: "100%",
            editable: visualTextEditable,
            ...(visualTextEditable ? { interactions: [new SelectGraphicElement(), new DblClickEditText(), new SelectHighlight()], plugins: [] } : {}),
          });
          if (visualTextEditable) instance.on("selection:change", ({ previous, next }: { previous: Element[]; next: Element[] }) => {
            for (const element of previous) element.classList.remove("edgeever-infographic-selected-text");
            for (const element of next) {
              if (["title", "desc", "item-label", "item-desc"].includes((element as HTMLElement).dataset.elementType ?? "")) {
                element.classList.add("edgeever-infographic-selected-text");
              }
            }
          });
          if (visualTextEditable) instance.on("options:change", (payload: VisualTextChange) => {
            const nextSyntax = applyVisualTextChange(syntax, payload) ?? applyOfficialVisualTextChange(syntax, payload, parsedSyntax);
            if (!nextSyntax || nextSyntax === syntax) return;
            if (parseSyntax(nextSyntax).errors.length) return;
            setPreviousGeneration(null);
            setSyntax(nextSyntax);
          });
          instance.render(syntax);
          instanceRef.current = instance;
          setRenderError(null);
          setPreviewReady(true);
        } catch (caught) {
          setRenderError(caught instanceof Error ? caught.message : t("infographic.renderError"));
          instanceRef.current = null;
        }
      }).catch(() => { if (!cancelled) setRenderError(t("infographic.renderError")); });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [syntax, readOnly, t]);

  useEffect(() => () => { instanceRef.current?.destroy(); }, []);

  const undoGeneration = () => {
    if (!previousGeneration) return;
    setSyntax(previousGeneration.syntax);
    setTitle(previousGeneration.title);
    setHistory((turns) => turns.map((turn) => turn.id === previousGeneration.turnId ? { ...turn, undoneAt: new Date().toISOString() } : turn));
    setPreviousGeneration(null);
    setError(null);
  };

  const save = async () => {
    if (readOnly || saving || !dirty || !ready || !sessionRef.current) return;
    if (syntax.trim() && (renderError || !previewReady || !instanceRef.current)) {
      setError(renderError ?? t("infographic.invalidSyntax"));
      return;
    }
    const currentMemo = memoRef.current;
    const currentSnapshot = snapshot;
    const document: InfographicDocument = { schemaVersion: 1, syntax, ...(history.length ? { history } : {}) };
    setSaving(true); setError(null);
    try {
      const result = await repository.updateMemo(currentMemo, {
        expectedRevision: currentMemo.revision,
        expectedContentHash: currentMemo.contentHash,
        editSessionId: sessionRef.current.id,
        title,
        contentJson: markdownToDoc(infographicFallbackMarkdown(document)),
        contentMarkdown: serializeInfographicDocument(document),
        tags: currentMemo.tags,
      });
      memoRef.current = result.memo;
      setSavedSnapshot(currentSnapshot);
      setSavedHistorySnapshot(JSON.stringify(history));
      await onSaved(result.memo);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("infographic.saveError"));
    } finally { setSaving(false); }
  };
  saveRef.current = () => { void save(); };

  useEffect(() => {
    if (!dirty || !ready || readOnly || saving || generating || renderError || (syntax.trim() && !previewReady)) return;
    const timer = window.setTimeout(() => saveRef.current(), historyDirty ? 0 : 1200);
    return () => window.clearTimeout(timer);
  }, [dirty, ready, readOnly, saving, generating, renderError, previewReady, snapshot, syntax, historyDirty]);

  const generate = async () => {
    const message = prompt.trim();
    if (!message || generating || readOnly) return;
    setGenerating(true); setError(null); setActiveTurn({ prompt: message, response: "" });
    const controller = new AbortController();
    generationControllerRef.current = controller;
    let response = "";
    let proposal: { template: string; data: Record<string, unknown>; explanation: string } | null = null;
    let question = "";
    try {
      const { parseSyntax, getTemplate, getTemplates } = await import("@antv/infographic");
      const existingOptions = parseSyntax(syntax).options;
      const existingTemplate = existingOptions.template;
      const currentContent = existingTemplate && existingOptions.data
        ? JSON.stringify({ template: existingTemplate, data: existingOptions.data }) : syntax;
      if (currentContent.length > INFOGRAPHIC_AGENT_SOURCE_MAX_LENGTH) throw new Error(t("infographic.contentTooLarge"));
      const candidates = infographicAgentCandidates(message, getTemplates(), existingTemplate);
      if (!candidates.length) throw new Error(t("infographic.aiInvalidResponse"));
      await api.streamInfographicAgent({
        prompt: message,
        locale: i18n.resolvedLanguage,
        ...(existingTemplate ? { currentTemplate: existingTemplate } : {}),
        currentContent,
        candidates,
        history: history.filter((turn) => !turn.undoneAt && turn.kind !== "failed")
          .slice(-12).map((turn) => ({ prompt: turn.prompt, response: `${turn.kind === "clarified" ? "No infographic change was applied. Clarification: " : ""}${turn.response || turn.resultTitle}${turn.decision ? `\nDecision: ${turn.decision}` : ""}`.slice(0, 2000) })),
      }, { signal: controller.signal, onEvent: (event) => {
        if (event.type === "text-delta") {
          response += event.text;
          setActiveTurn((current) => current ? { ...current, response } : current);
        }
        if (event.type === "proposal") {
          proposal = event;
          setActiveTurn((current) => current ? { ...current, template: event.template, decision: event.explanation } : current);
        }
        if (event.type === "question") {
          question = event.question;
          setActiveTurn((current) => current ? { ...current, question } : current);
        }
        if (event.type === "error") throw new Error(event.message);
      } });
      if (proposal) {
        const selected = proposal as { template: string; data: Record<string, unknown>; explanation: string };
        if (!candidates.includes(selected.template)) throw new Error(t("infographic.aiInvalidResponse"));
        const data = parseGeneratedOfficialData(JSON.stringify({ data: selected.data }), selected.template);
        if (!data) throw new Error(t("infographic.aiInvalidResponse"));
        const candidate = buildOfficialInfographicSyntax(selected.template, data, syntax.split("\n")[1] === "theme dark");
        const parsedCandidate = parseSyntax(candidate);
        if (parsedCandidate.errors.length || !parsedCandidate.options.template || !getTemplate(parsedCandidate.options.template)) throw new Error(t("infographic.aiInvalidResponse"));
        const generatedTitle = String(data.title ?? "");
        const turnId = crypto.randomUUID();
        setPreviousGeneration({ title, syntax, turnId });
        setHistory((turns) => [...turns, {
          id: turnId, prompt: message, createdAt: new Date().toISOString(),
          kind: syntax.trim() ? "refined" : "generated", resultTitle: generatedTitle,
          response: (response.trim() || selected.explanation).slice(0, 4000), decision: selected.explanation.slice(0, 500), template: selected.template,
        }]);
        setSyntax(candidate);
        const previousGraphicTitle = String(existingOptions.data?.title ?? "").trim();
        if (!title.trim() || title.trim() === t("infographic.name") || (previousGraphicTitle && title.trim() === previousGraphicTitle)) setTitle(generatedTitle);
      } else if (question) {
        setHistory((turns) => [...turns, { id: crypto.randomUUID(), prompt: message, createdAt: new Date().toISOString(), kind: "clarified", resultTitle: "", response: (response.trim() || question).slice(0, 4000) }]);
      } else throw new Error(t("infographic.aiInvalidResponse"));
      setPrompt("");
    } catch (caught) {
      if (controller.signal.aborted) return;
      const messageText = caught instanceof Error ? caught.message : t("infographic.aiError");
      setError(messageText);
      setHistory((turns) => [...turns, { id: crypto.randomUUID(), prompt: message, createdAt: new Date().toISOString(), kind: "failed", resultTitle: "", response: response.slice(0, 4000), error: messageText.slice(0, 1000) }]);
    } finally { if (generationControllerRef.current === controller) generationControllerRef.current = null; setActiveTurn(null); setGenerating(false); }
  };

  const exportImage = async (type: "svg" | "png") => {
    if (!instanceRef.current || renderError || !previewReady) return;
    try {
      const url = await instanceRef.current.toDataURL({ type });
      downloadDataUrl(url, `${(title.trim() || "infographic").replace(/[\\/:*?"<>|]/g, "-")}.${type}`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : t("infographic.renderError")); }
  };

  const previewUsesLightSheet = Boolean(syntax.trim()) && syntax.split("\n")[1] !== "theme dark";

  return <div className="flex h-full min-h-0 flex-col bg-card text-foreground">
    <header className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-3">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onBackToList} aria-label={t("common.back")}><ChevronLeft className="h-4 w-4" /></Button>
      <Presentation className="h-5 w-5 text-emerald-700" />
      <div className="min-w-40 flex-1"><MemoTitleInput value={title} onValueChange={setTitle} placeholder={t("infographic.name")} readOnly={readOnly} /></div>
      {readOnly ? <span className="text-xs text-slate-500">{t("infographic.readOnly")}</span> : <Button size="sm" disabled={!dirty || !ready || saving || Boolean(renderError) || (Boolean(syntax.trim()) && !previewReady)} onClick={() => void save()}>{saving ? t("infographic.saving") : t("infographic.save")}</Button>}
      <Button variant="outline" size="sm" disabled={!previewReady || Boolean(renderError)} onClick={() => void exportImage("svg")}><Download className="mr-1 h-4 w-4" />{t("infographic.exportSvg")}</Button>
      <Button variant="outline" size="sm" disabled={!previewReady || Boolean(renderError)} onClick={() => void exportImage("png")}>{t("infographic.exportPng")}</Button>
    </header>
    {error ? <p role="alert" className="border-b border-red-100 bg-red-50 px-5 py-2 text-sm text-red-700">{error}</p> : null}
    <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(300px,34%)_1fr]">
      <section className="flex min-h-[320px] max-h-[60vh] flex-col border-b border-slate-200 p-5 lg:min-h-0 lg:max-h-none lg:border-b-0 lg:border-r">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">{t("infographic.historyTitle")}</h2>
        <Conversation className="min-h-0 flex-1" aria-label={t("infographic.historyTitle")}>
          <ConversationContent className="gap-4 p-0 pb-5">
            {history.map((turn) => <div key={turn.id} className="space-y-2">
              <Message from="user"><MessageContent className="whitespace-pre-wrap break-words group-[.is-user]:rounded-xl group-[.is-user]:bg-emerald-50 group-[.is-user]:px-3 group-[.is-user]:py-2">{turn.prompt}</MessageContent></Message>
              <Message from="assistant"><MessageContent className="w-full rounded-xl border border-slate-200 bg-card px-3 py-2 text-foreground">
                <MessageResponse className="edgeever-infographic-chat-response break-words">{turn.response || (turn.kind === "clarified" ? t("infographic.historyClarified") : turn.kind === "failed" ? t("infographic.historyFailed") : t(turn.kind === "generated" ? "infographic.historyGenerated" : "infographic.historyRefined", { title: turn.resultTitle || t("infographic.name") }))}</MessageResponse>
                {turn.decision && turn.decision !== turn.response && <p className="text-xs text-slate-600">{turn.decision}</p>}
                {turn.template && <p className="text-xs text-slate-500">{turn.template}</p>}
                {turn.error && <p className="text-xs text-red-600">{turn.error}</p>}
                {turn.undoneAt && <p className="text-xs text-slate-500">{t("infographic.historyUndone")}</p>}
                <time className="block text-xs text-slate-500" dateTime={turn.createdAt}>{new Date(turn.createdAt).toLocaleString(i18n.resolvedLanguage)}</time>
              </MessageContent></Message>
            </div>)}
            {activeTurn && <div className="space-y-2" aria-live="polite">
              <Message from="user"><MessageContent className="whitespace-pre-wrap break-words group-[.is-user]:rounded-xl group-[.is-user]:bg-emerald-50 group-[.is-user]:px-3 group-[.is-user]:py-2">{activeTurn.prompt}</MessageContent></Message>
              <Message from="assistant"><MessageContent className="w-full rounded-xl border border-emerald-200 bg-card px-3 py-2 text-foreground">
                <MessageResponse className="edgeever-infographic-chat-response break-words" isAnimating={generating}>{activeTurn.response || activeTurn.question || t("infographic.generating")}</MessageResponse>
                {activeTurn.decision && activeTurn.decision !== activeTurn.response && <p className="text-xs text-slate-600">{activeTurn.decision}</p>}
                {activeTurn.template && <p className="text-xs text-slate-500">{activeTurn.template}</p>}
              </MessageContent></Message>
            </div>}
          </ConversationContent>
          <ConversationScrollButton aria-label={t("infographic.scrollToBottom")} />
        </Conversation>
        {!readOnly && <div className="shrink-0 rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
          <label className="mb-2 block text-sm font-medium text-slate-800" htmlFor="infographic-prompt"><Sparkles className="mr-1 inline h-4 w-4 text-emerald-700" />{t(syntax.trim() ? "infographic.refine" : "infographic.describe")}</label>
          <textarea id="infographic-prompt" maxLength={1000} disabled={generating} className="min-h-24 w-full rounded-md border border-slate-200 bg-card p-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-60" placeholder={t(syntax.trim() ? "infographic.refinePrompt" : "infographic.prompt")} value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || event.keyCode === 229) return;
            event.preventDefault();
            if (!event.repeat && prompt.trim() && !generating) void generate();
          }} />
          <div className="mt-2 flex flex-wrap items-center gap-2"><Button size="sm" disabled={!prompt.trim() || generating} onClick={() => void generate()}>{generating ? <LoaderCircle className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}{generating ? t("infographic.generating") : t(syntax.trim() ? "infographic.applyRefinement" : "infographic.generate")}</Button>
            {previousGeneration && <Button size="sm" variant="outline" onClick={undoGeneration}><Undo2 className="mr-1 h-4 w-4" />{t("infographic.undoGeneration")}</Button>}
          </div>
        </div>}
      </section>
      <section className="min-h-0 overflow-auto bg-slate-50 p-4"><div className={`min-h-[420px] rounded-xl border border-slate-200 p-4 shadow-sm ${previewUsesLightSheet ? "bg-white" : "bg-card"}`}><div ref={containerRef} className="edgeever-infographic-preview min-h-[380px] w-full" />{!syntax.trim() && <p className="pt-32 text-center text-sm text-muted-foreground">{t("infographic.noPreview")}</p>}{renderError && <p role="alert" className="text-sm text-destructive">{renderError}</p>}</div></section>
    </div>
  </div>;
}
