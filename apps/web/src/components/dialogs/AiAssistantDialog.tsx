import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookmarkPlus, Check, Copy, FileText, Library, Loader2, Paperclip, PenLine, RefreshCw, Sparkles, Square, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, ApiRequestError } from "@/lib/api";
import {
  AI_ATTACHMENT_ACCEPT,
  AiAttachmentError,
  formatAiAttachmentSize,
  prepareAiAttachments,
  type PreparedAiAttachment,
} from "@/lib/ai-attachments";
import {
  aiTones,
  buildAiAssistantRequest,
  getDefaultAiAction,
  getDefaultTargetLanguage,
  promptAllowsAppend,
  promptAllowsReplace,
  promptNeedsTargetLanguage,
  promptNeedsTone,
  targetLanguages,
  type AiAssistantAction,
  type AiTone,
  type TargetLanguage,
} from "@/lib/ai-assistant";
import { copyTextToClipboard } from "@/lib/clipboard";
import { cn } from "@/lib/utils";

const FREEFORM_VALUE = "custom";
const PROMPT_VALUE_PREFIX = "prompt:";
const AI_ASSISTANT_LAYER_SELECTOR = '[data-edgeever-ai-assistant-layer="true"]';

export const isAiAssistantPointerTarget = (target: EventTarget | null, panel: HTMLElement | null) => {
  if (!(target instanceof Node)) return false;
  if (panel?.contains(target)) return true;
  return target instanceof Element && Boolean(target.closest(AI_ASSISTANT_LAYER_SELECTOR));
};

const promptSelectValue = (id: string) => `${PROMPT_VALUE_PREFIX}${id}`;

const parsePromptSelectValue = (value: string) =>
  value.startsWith(PROMPT_VALUE_PREFIX) ? value.slice(PROMPT_VALUE_PREFIX.length) : null;

export type AiAssistantAnchor = {
  left: number;
  placement: "above" | "below";
  top: number;
};

export const AiAssistantDialog = ({
  open,
  anchor,
  title,
  contentMarkdown,
  selectionMarkdown,
  onOpenChange,
  onApply,
  onOpenPromptLibrary,
}: {
  open: boolean;
  anchor: AiAssistantAnchor;
  title: string;
  contentMarkdown: string;
  selectionMarkdown?: string | null;
  onOpenChange: (open: boolean) => void;
  onApply: (text: string, mode: "append" | "replace") => boolean;
  onOpenPromptLibrary?: () => void;
}) => {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const hasSelection = Boolean(selectionMarkdown?.trim());
  const sourceMarkdown = hasSelection ? selectionMarkdown!.trim() : contentMarkdown;
  const defaultTargetLanguage = getDefaultTargetLanguage(i18n.resolvedLanguage);
  const defaultAction = getDefaultAiAction(hasSelection);
  const [action, setAction] = useState<AiAssistantAction>(defaultAction);
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [targetLanguage, setTargetLanguage] = useState<TargetLanguage>(() => defaultTargetLanguage);
  const [tone, setTone] = useState<AiTone>("professional");
  const [customInstruction, setCustomInstruction] = useState("");
  const [refinement, setRefinement] = useState("");
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveDescription, setSaveDescription] = useState("");
  const [promptFeedback, setPromptFeedback] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<PreparedAiAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [isReadingAttachments, setIsReadingAttachments] = useState(false);
  const [initializedForOpen, setInitializedForOpen] = useState(false);
  const [panelElement, setPanelElement] = useState<HTMLElement | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const instructionRef = useRef<HTMLTextAreaElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentReadIdRef = useRef(0);
  const customInstructionEditedRef = useRef(false);
  const lastRequestRef = useRef<Parameters<typeof api.streamAiGeneration>[0] | null>(null);
  const assignPanelRef = useCallback((node: HTMLElement | null) => {
    panelRef.current = node;
    setPanelElement(node);
  }, []);

  const promptsQuery = useQuery({
    queryKey: ["ai-prompts", i18n.resolvedLanguage],
    queryFn: async () => (await api.listAiPrompts(i18n.resolvedLanguage)).prompts,
    enabled: open,
    retry: false,
  });
  const prompts = promptsQuery.data ?? [];
  const selectedPrompt = useMemo(
    () => prompts.find((prompt) => prompt.id === selectedPromptId) ?? null,
    [prompts, selectedPromptId],
  );
  const effectiveActionKey = selectedPrompt?.action ?? action;
  const effectiveParameterKind = selectedPrompt?.parameterKind ?? "none";
  const effectiveResultMode = selectedPrompt?.resultMode ?? "both";

  const selectValue = selectedPromptId
    ? promptSelectValue(selectedPromptId)
    : FREEFORM_VALUE;

  useEffect(() => () => controllerRef.current?.abort(), []);
  useEffect(() => {
    controllerRef.current?.abort();
    attachmentReadIdRef.current += 1;
    if (!open) {
      setInitializedForOpen(false);
      return;
    }
    setAction(defaultAction);
    setSelectedPromptId(null);
    setTargetLanguage(defaultTargetLanguage);
    setTone("professional");
    setCustomInstruction("");
    setRefinement("");
    setOutput("");
    setError(null);
    setCopied(false);
    setIsGenerating(false);
    setSaveDialogOpen(false);
    setSaveName("");
    setSaveDescription("");
    setPromptFeedback(null);
    setAttachments([]);
    setAttachmentError(null);
    setIsReadingAttachments(false);
    setInitializedForOpen(false);
    customInstructionEditedRef.current = false;
    lastRequestRef.current = null;
  }, [defaultAction, defaultTargetLanguage, hasSelection, open]);

  useEffect(() => {
    if (!open || initializedForOpen || promptsQuery.isLoading) return;
    if (customInstructionEditedRef.current || customInstruction.trim()) {
      setSelectedPromptId(null);
      setAction("custom");
      setInitializedForOpen(true);
      return;
    }
    const preferred = prompts.find((prompt) => prompt.seedKey === defaultAction)
      ?? prompts[0]
      ?? null;
    if (preferred) {
      setSelectedPromptId(preferred.id);
      setAction(preferred.action);
    } else {
      setSelectedPromptId(null);
      setAction("custom");
    }
    setInitializedForOpen(true);
  }, [customInstruction, defaultAction, initializedForOpen, open, prompts, promptsQuery.isLoading]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => instructionRef.current?.focus());
    const handlePointerDown = (event: PointerEvent) => {
      if (isAiAssistantPointerTarget(event.target, panelRef.current)) return;
      onOpenChange(false);
    };
    window.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [onOpenChange, open]);

  useEffect(() => {
    if (!open || !initializedForOpen || promptsQuery.isLoading || !selectedPromptId || selectedPrompt) return;
    setSelectedPromptId(null);
    setAction("custom");
    setCustomInstruction("");
    setOutput("");
    setError(t("aiAssistant.promptMissing"));
  }, [initializedForOpen, open, promptsQuery.isLoading, selectedPrompt, selectedPromptId, t]);

  const clearResult = () => {
    setOutput("");
    setError(null);
    setPromptFeedback(null);
  };

  const handleActionChange = (value: string) => {
    customInstructionEditedRef.current = false;
    if (value === FREEFORM_VALUE) {
      setAction("custom");
      setSelectedPromptId(null);
      setCustomInstruction("");
      clearResult();
      return;
    }

    const promptId = parsePromptSelectValue(value);
    if (!promptId) return;
    const prompt = prompts.find((item) => item.id === promptId);
    setSelectedPromptId(promptId);
    setAction(prompt?.action ?? "custom");
    setCustomInstruction("");
    clearResult();
  };

  const runGeneration = async (request: Parameters<typeof api.streamAiGeneration>[0]) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    lastRequestRef.current = request;
    setOutput("");
    setError(null);
    setCopied(false);
    setIsGenerating(true);
    try {
      await api.streamAiGeneration(
        request,
        {
          signal: controller.signal,
          onEvent: (event) => {
            if (event.type === "text-delta") setOutput((current) => current + event.text);
            if (event.type === "error") setError(event.message);
          },
        },
      );
    } catch (caught) {
      if (controller.signal.aborted || (caught instanceof DOMException && caught.name === "AbortError")) return;
      setError(caught instanceof ApiRequestError && caught.code === "ai_not_configured"
        ? t("aiAssistant.configure")
        : caught instanceof Error ? caught.message : t("aiModel.failed"));
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setIsGenerating(false);
      }
    }
  };

  const generate = () => {
    const currentInstruction = instructionRef.current?.value ?? customInstruction;
    if (!selectedPrompt && effectiveActionKey === "custom" && !currentInstruction.trim()) {
      setError(t("aiAssistant.customInstructionRequired"));
      instructionRef.current?.focus();
      return;
    }

    return runGeneration(buildAiAssistantRequest({
      action: effectiveActionKey,
      contentMarkdown: sourceMarkdown,
      customInstruction: currentInstruction,
      locale: i18n.resolvedLanguage,
      parameterKind: selectedPrompt ? effectiveParameterKind : undefined,
      promptId: selectedPrompt?.id,
      targetLanguage,
      title,
      tone,
      attachments: attachments.map(({ byteLength: _byteLength, ...attachment }) => attachment),
    }));
  };

  const addAttachments = async (files: File[]) => {
    if (!files.length) return;
    const readId = attachmentReadIdRef.current + 1;
    attachmentReadIdRef.current = readId;
    setAttachmentError(null);
    setIsReadingAttachments(true);
    try {
      const prepared = await prepareAiAttachments(files, attachments);
      if (attachmentReadIdRef.current !== readId) return;
      setAttachments((current) => [...current, ...prepared]);
      clearResult();
    } catch (caught) {
      if (attachmentReadIdRef.current !== readId) return;
      const code = caught instanceof AiAttachmentError ? caught.code : "readFailed";
      setAttachmentError(t(`aiAssistant.attachmentErrors.${code}`));
    } finally {
      if (attachmentReadIdRef.current === readId) {
        setIsReadingAttachments(false);
        if (attachmentInputRef.current) attachmentInputRef.current.value = "";
      }
    }
  };

  const refine = () => {
    const instruction = refinement.trim();
    if (!output || !instruction) return;
    setRefinement("");
    return runGeneration({
      action: "custom",
      title,
      contentMarkdown: output,
      instruction,
    });
  };

  const retry = () => {
    if (lastRequestRef.current) return runGeneration(lastRequestRef.current);
    return generate();
  };

  const applyOutput = (mode: "append" | "replace") => {
    setError(null);
    if (!onApply(output, mode)) {
      setError(t("aiAssistant.applyFailed"));
    }
  };

  const copy = async () => {
    if (await copyTextToClipboard(output)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    }
  };

  const createPromptMutation = useMutation({
    mutationFn: () => api.createAiPrompt({
      name: saveName.trim(),
      description: saveDescription.trim() || undefined,
      instruction: customInstruction.trim(),
      parameterKind: "none",
      resultMode: "both",
    }),
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: ["ai-prompts"] });
      setSelectedPromptId(response.prompt.id);
      setAction(response.prompt.action);
      setCustomInstruction(response.prompt.instruction);
      setSaveDialogOpen(false);
      setSaveName("");
      setSaveDescription("");
      setPromptFeedback(t("aiAssistant.promptSaved"));
    },
  });

  const promptErrorMessage = createPromptMutation.error
    ? createPromptMutation.error instanceof Error
      ? createPromptMutation.error.message
      : t("aiAssistant.promptSaveFailed")
    : null;

  const isFreeformCustom = !selectedPromptId && action === "custom";
  const canSaveAsPrompt = isFreeformCustom && customInstruction.trim().length > 0;
  const generateDisabled = isGenerating
    || isReadingAttachments;

  const panelStyle = useMemo<CSSProperties>(() => {
    const viewportWidth = typeof window === "undefined" ? 1024 : window.innerWidth;
    const viewportHeight = typeof window === "undefined" ? 768 : window.innerHeight;
    const left = Math.max(12, Math.min(anchor.left, viewportWidth - Math.min(576, viewportWidth - 24)));
    const availableHeight = anchor.placement === "above"
      ? anchor.top - 12
      : viewportHeight - anchor.top - 12;
    const maxHeight = Math.max(180, Math.min(viewportHeight * 0.7, availableHeight));
    return anchor.placement === "above"
      ? { bottom: Math.max(12, viewportHeight - anchor.top), left, maxHeight }
      : { left, maxHeight, top: Math.max(12, anchor.top) };
  }, [anchor]);

  return (
    <>
      {open && typeof document !== "undefined" ? createPortal(
        <section
          ref={assignPanelRef}
          aria-label={t("aiAssistant.title")}
          className="fixed z-[70] flex max-h-[70dvh] w-[min(36rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-2xl ring-1 ring-slate-950/5"
          role="dialog"
          style={panelStyle}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              onOpenChange(false);
            }
          }}
        >
          <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <Sparkles className="h-5 w-5 shrink-0 text-emerald-600" />
              <span className="truncate text-sm font-semibold text-slate-950">{t("aiAssistant.title")}</span>
              <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                {t(hasSelection ? "aiAssistant.selectedScope" : "aiAssistant.noteScope")}
              </span>
            </div>
            <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label={t("common.close")} onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="grid gap-4">
            {hasSelection ? (
              <p className="max-h-12 overflow-hidden whitespace-pre-wrap border-l-2 border-emerald-200 pl-3 text-xs leading-5 text-slate-500">
                {selectionMarkdown}
              </p>
            ) : null}
            <div className="order-3 grid gap-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-slate-700">{t("aiAssistant.actionLabel")}</span>
                {onOpenPromptLibrary ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-800"
                    onClick={() => {
                      onOpenChange(false);
                      onOpenPromptLibrary();
                    }}
                  >
                    <Library className="h-3.5 w-3.5" />
                    {t("aiAssistant.managePrompts")}
                  </button>
                ) : null}
              </div>
              <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <Select value={selectValue} onValueChange={handleActionChange}>
                  <SelectTrigger aria-label={t("aiAssistant.actionLabel")} className="h-10 w-full min-w-0">
                    <SelectValue placeholder={t("aiAssistant.actionLabel")} />
                  </SelectTrigger>
                  <SelectContent
                    className="z-[80] max-h-[min(20rem,var(--radix-select-content-available-height))]"
                    collisionBoundary={panelElement}
                    collisionPadding={8}
                    sideOffset={6}
                    data-edgeever-ai-assistant-layer="true"
                  >
                    {prompts.length ? (
                      <SelectGroup>
                        <SelectLabel>{t("aiAssistant.myPrompts")}</SelectLabel>
                        {prompts.map((prompt) => (
                          <SelectItem key={prompt.id} value={promptSelectValue(prompt.id)}>
                            {prompt.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ) : null}
                    <SelectGroup>
                      <SelectItem value={FREEFORM_VALUE}>{t("aiAssistant.actions.custom")}</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-[8rem_7rem]">
                  <Button
                    type="button"
                    variant={!selectedPromptId && action === "custom" ? "solid" : "outline"}
                    className="h-10 min-w-0 w-full gap-1 whitespace-nowrap px-3 text-xs font-normal text-slate-600"
                    onClick={() => handleActionChange(FREEFORM_VALUE)}
                  >
                    <PenLine className="h-3.5 w-3.5 shrink-0" />
                    {t("aiAssistant.useCustom")}
                  </Button>
                  {isGenerating ? (
                    <Button type="button" variant="solid" className="h-10 min-w-0 w-full gap-1.5 whitespace-nowrap px-3 text-sm font-semibold" onClick={() => controllerRef.current?.abort()}>
                      <Square className="h-3.5 w-3.5 shrink-0" />{t("aiAssistant.stop")}
                    </Button>
                  ) : (
                    <Button type="button" variant="solid" className="h-10 min-w-0 w-full gap-1.5 whitespace-nowrap px-3 text-sm font-semibold" disabled={generateDisabled} onClick={() => void generate()}>
                      <Sparkles className="h-4 w-4 shrink-0" />
                      {t("aiAssistant.generate")}
                      <kbd aria-hidden="true" className="ml-0.5 rounded bg-white/10 px-1 py-0.5 text-[10px] font-medium leading-none text-white/65">
                        ↵
                      </kbd>
                    </Button>
                  )}
                </div>
              </div>
            </div>
            {promptNeedsTargetLanguage(effectiveParameterKind) ? (
              <div className="order-2 grid gap-1.5">
                <span className="text-sm font-medium text-slate-700">{t("aiAssistant.targetLanguage")}</span>
                <Select value={targetLanguage} onValueChange={(value) => {
                  setTargetLanguage(value as TargetLanguage);
                  clearResult();
                }}>
                  <SelectTrigger aria-label={t("aiAssistant.targetLanguage")} className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent
                    className="z-[80] max-h-[min(20rem,var(--radix-select-content-available-height))]"
                    collisionBoundary={panelElement}
                    collisionPadding={8}
                    sideOffset={6}
                    data-edgeever-ai-assistant-layer="true"
                  >
                    {targetLanguages.map((language) => (
                      <SelectItem key={language} value={language}>{t(`aiAssistant.targetLanguages.${language}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            {promptNeedsTone(effectiveParameterKind) ? (
              <div className="order-2 grid gap-1.5">
                <span className="text-sm font-medium text-slate-700">{t("aiAssistant.tone")}</span>
                <Select value={tone} onValueChange={(value) => {
                  setTone(value as AiTone);
                  clearResult();
                }}>
                  <SelectTrigger aria-label={t("aiAssistant.tone")} className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent
                    className="z-[80] max-h-[min(20rem,var(--radix-select-content-available-height))]"
                    collisionBoundary={panelElement}
                    collisionPadding={8}
                    sideOffset={6}
                    data-edgeever-ai-assistant-layer="true"
                  >
                    {aiTones.map((item) => <SelectItem key={item} value={item}>{t(`aiAssistant.tones.${item}`)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="order-1 grid gap-2">
              <label className="grid gap-1.5 text-sm font-medium text-slate-700">
                {t("aiAssistant.customInstruction")}
                <textarea
                  ref={instructionRef}
                  className="min-h-24 resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/15"
                  value={customInstruction}
                  onChange={(event) => {
                    customInstructionEditedRef.current = true;
                    setSelectedPromptId(null);
                    setAction("custom");
                    setCustomInstruction(event.target.value);
                    clearResult();
                  }}
                  onCompositionEnd={(event) => {
                    customInstructionEditedRef.current = true;
                    setSelectedPromptId(null);
                    setAction("custom");
                    setCustomInstruction(event.currentTarget.value);
                    clearResult();
                  }}
                  onKeyDown={(event) => {
                    if (
                      event.key !== "Enter"
                      || event.shiftKey
                      || event.nativeEvent.isComposing
                      || isGenerating
                      || isReadingAttachments
                    ) {
                      return;
                    }
                    event.preventDefault();
                    void generate();
                  }}
                  placeholder={t("aiAssistant.customInstructionPlaceholder")}
                  maxLength={2_000}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <input
                  ref={attachmentInputRef}
                  className="sr-only"
                  type="file"
                  multiple
                  accept={AI_ATTACHMENT_ACCEPT}
                  onChange={(event) => void addAttachments(Array.from(event.target.files ?? []))}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isGenerating || isReadingAttachments}
                  onClick={() => attachmentInputRef.current?.click()}
                >
                  {isReadingAttachments
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Paperclip className="h-3.5 w-3.5" />}
                  {t("aiAssistant.addAttachment")}
                </Button>
                {canSaveAsPrompt ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSaveName("");
                      setSaveDescription("");
                      setSaveDialogOpen(true);
                      createPromptMutation.reset();
                    }}
                  >
                    <BookmarkPlus className="h-3.5 w-3.5" />
                    {t("aiAssistant.saveAsPrompt")}
                  </Button>
                ) : null}
              </div>
              {attachments.length ? (
                <ul className="flex flex-wrap gap-2" aria-label={t("aiAssistant.attachments")}>
                  {attachments.map((attachment, index) => (
                    <li key={`${attachment.filename}-${index}`} className="flex min-w-0 max-w-full items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700">
                      <FileText className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                      <span className="max-w-48 truncate">{attachment.filename}</span>
                      <span className="shrink-0 text-slate-400">{formatAiAttachmentSize(attachment.byteLength)}</span>
                      <button
                        type="button"
                        className="ml-0.5 rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                        aria-label={t("aiAssistant.removeAttachment", { name: attachment.filename })}
                        onClick={() => {
                          setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index));
                          setAttachmentError(null);
                          clearResult();
                        }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className="text-xs text-slate-400">{t("aiAssistant.attachmentHint")}</p>
              {attachmentError ? <p className="text-xs font-medium text-rose-600" role="alert">{attachmentError}</p> : null}
              {promptFeedback ? <p className="text-xs font-medium text-emerald-700">{promptFeedback}</p> : null}
              {promptErrorMessage ? <p className="text-xs font-medium text-rose-600" role="alert">{promptErrorMessage}</p> : null}
            </div>
            <div className="order-4 grid gap-1.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-slate-700">{t("aiAssistant.result")}</span>
                {isGenerating ? (
                  <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />{t("aiAssistant.generating")}
                  </span>
                ) : null}
              </div>
              <div
                className={cn("max-h-56 min-h-28 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-slate-50 p-4 text-sm leading-6 text-slate-800", error ? "border-rose-200" : "border-slate-200")}
                aria-busy={isGenerating}
                aria-live="polite"
              >
                {output || <span className="text-slate-400">{t("aiAssistant.resultPlaceholder")}</span>}
              </div>
              {error ? <p className="text-xs font-medium text-rose-600" role="alert">{error}</p> : null}
            </div>
            {output && !isGenerating ? (
              <div className="order-4 grid gap-1.5 rounded-lg border border-slate-200 bg-white p-3">
                <span className="text-sm font-medium text-slate-700">{t("aiAssistant.refine")}</span>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    className="h-10 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/15"
                    value={refinement}
                    onChange={(event) => setRefinement(event.target.value)}
                    aria-label={t("aiAssistant.refine")}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.nativeEvent.isComposing && refinement.trim()) {
                        event.preventDefault();
                        void refine();
                      }
                    }}
                    placeholder={t("aiAssistant.refinePlaceholder")}
                    maxLength={2_000}
                  />
                  <Button type="button" variant="outline" disabled={!refinement.trim()} onClick={() => void refine()}>{t("aiAssistant.refineAction")}</Button>
                </div>
              </div>
            ) : null}
            </div>
          </div>
          {output ? (
            <div className="mt-3 flex shrink-0 flex-wrap justify-between gap-2 border-t border-slate-200 pt-3" data-ai-assistant-actions>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" disabled={isGenerating} onClick={() => void copy()}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{t(copied ? "aiAssistant.copied" : "aiAssistant.copy")}</Button>
                <Button type="button" variant="outline" disabled={isGenerating} onClick={() => { setOutput(""); setError(null); }}><Trash2 className="h-4 w-4" />{t("aiAssistant.discard")}</Button>
                <Button type="button" variant="outline" disabled={isGenerating} onClick={() => void retry()}><RefreshCw className="h-4 w-4" />{t("aiAssistant.retry")}</Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {promptAllowsReplace(effectiveResultMode) ? (
                  <Button type="button" variant={hasSelection ? "solid" : "outline"} disabled={isGenerating} onClick={() => applyOutput("replace")}>
                    {t(hasSelection ? "aiAssistant.replaceSelection" : "aiAssistant.replace")}
                  </Button>
                ) : null}
                {promptAllowsAppend(effectiveResultMode) ? (
                  <Button type="button" variant={hasSelection && promptAllowsReplace(effectiveResultMode) ? "outline" : "solid"} disabled={isGenerating} onClick={() => applyOutput("append")}>{t("aiAssistant.append")}</Button>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>,
        document.body,
      ) : null}

      <Dialog open={saveDialogOpen} onOpenChange={(nextOpen) => {
        setSaveDialogOpen(nextOpen);
        if (!nextOpen) {
          setSaveName("");
          setSaveDescription("");
          createPromptMutation.reset();
        }
      }}>
        <DialogContent className="sm:max-w-md" data-edgeever-ai-assistant-layer="true">
          <form
            className="grid gap-4"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              if (!saveName.trim() || !customInstruction.trim()) return;
              createPromptMutation.mutate();
            }}
          >
            <DialogHeader>
              <DialogTitle>{t("aiAssistant.saveAsPromptTitle")}</DialogTitle>
              <DialogDescription>{t("aiPrompts.description")}</DialogDescription>
            </DialogHeader>
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              {t("aiAssistant.promptName")}
              <Input
                value={saveName}
                onChange={(event) => setSaveName(event.target.value)}
                placeholder={t("aiAssistant.promptNamePlaceholder")}
                maxLength={80}
                required
                autoFocus
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              {t("aiAssistant.promptDescription")}
              <Input
                value={saveDescription}
                onChange={(event) => setSaveDescription(event.target.value)}
                placeholder={t("aiPrompts.descriptionPlaceholder")}
                maxLength={200}
              />
            </label>
            {createPromptMutation.error ? (
              <p className="text-xs font-medium text-rose-600" role="alert">
                {createPromptMutation.error instanceof Error
                  ? createPromptMutation.error.message
                  : t("aiAssistant.promptSaveFailed")}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSaveDialogOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                variant="solid"
                disabled={!saveName.trim() || !customInstruction.trim() || createPromptMutation.isPending}
              >
                {createPromptMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookmarkPlus className="h-4 w-4" />}
                {t("aiPrompts.create")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};
