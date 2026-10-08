import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import type { AiTranscriptionProvider, AiTranscriptionSettings, AiTranscriptionStandard } from "@edgeever/shared";
import { CheckCircle2, Loader2, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { aiErrorMessage, trimAiText } from "@/components/settings/ai-provider-options";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/lib/api";
import { SpeechProviderReachabilityError } from "@/lib/speech-transcription-error";

export const SpeechProviderCard = ({
  provider: saved,
  defaultModelId,
  readOnly,
  onChanged,
}: {
  provider: AiTranscriptionProvider;
  defaultModelId: string | null;
  readOnly: boolean;
  onChanged: (settings: AiTranscriptionSettings) => void;
}) => {
  const { t, i18n } = useTranslation();
  const [provider, setProvider] = useState<AiTranscriptionStandard>(saved.provider);
  const [displayName, setDisplayName] = useState(saved.displayName);
  const [baseUrl, setBaseUrl] = useState(saved.baseUrl);
  const [apiKey, setApiKey] = useState("");
  const [modelId, setModelId] = useState("");
  const [testModelConfigId, setTestModelConfigId] = useState(saved.models[0]?.id ?? "");
  const [showConnection, setShowConnection] = useState(false);
  const [showAddModel, setShowAddModel] = useState(false);
  const testAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setProvider(saved.provider);
    setDisplayName(saved.displayName);
    setBaseUrl(saved.baseUrl);
  }, [saved.baseUrl, saved.displayName, saved.provider]);

  useEffect(() => {
    setTestModelConfigId((current) => saved.models.some((model) => model.id === current)
      ? current : saved.models[0]?.id ?? "");
  }, [saved.models]);

  const saveMutation = useMutation({
    mutationFn: () => api.updateAiTranscriptionProvider(saved.id, {
      provider,
      displayName: displayName.trim(),
      baseUrl: baseUrl.trim(),
      isEnabled: saved.isEnabled,
      ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
    }),
    onSuccess: (settings) => {
      setApiKey("");
      setShowConnection(false);
      onChanged(settings);
    },
  });
  const testMutation = useMutation({
    mutationFn: async () => {
      const selectedModel = saved.models.find((model) => model.id === testModelConfigId);
      if (!selectedModel) throw new Error(t("speechTranscription.testModelRequired"));
      const controller = new AbortController();
      testAbortRef.current = controller;
      try {
        const key = apiKey.trim()
          || (await api.getAiTranscriptionDirectCredential(saved.id, controller.signal)).apiKey;
        const { testSpeechService } = await import("@/lib/transcribe-note-resource");
        return await testSpeechService(
          { baseUrl, modelId: selectedModel.modelId, apiKey: key },
          controller.signal,
          { sampleLocale: i18n.resolvedLanguage ?? i18n.language },
        );
      } finally {
        if (testAbortRef.current === controller) testAbortRef.current = null;
      }
    },
  });
  const toggleMutation = useMutation({
    mutationFn: (isEnabled: boolean) => api.updateAiTranscriptionProvider(saved.id, {
      provider: saved.provider,
      displayName: saved.displayName,
      baseUrl: saved.baseUrl,
      isEnabled,
    }),
    onSuccess: onChanged,
  });
  const deleteMutation = useMutation({
    mutationFn: () => api.deleteAiTranscriptionProvider(saved.id),
    onSuccess: onChanged,
  });
  const addModelMutation = useMutation({
    mutationFn: () => api.addAiTranscriptionModel(saved.id, { modelId: trimAiText(modelId) }),
    onSuccess: (settings) => {
      setModelId("");
      setShowAddModel(false);
      onChanged(settings);
    },
  });
  const deleteModelMutation = useMutation({
    mutationFn: (modelConfigId: string) => api.deleteAiTranscriptionModel(saved.id, modelConfigId),
    onSuccess: onChanged,
  });

  const cardBusy = toggleMutation.isPending || deleteMutation.isPending || deleteModelMutation.isPending;
  const cardError = toggleMutation.error ?? deleteMutation.error ?? addModelMutation.error ?? deleteModelMutation.error;
  const connectionBusy = saveMutation.isPending || testMutation.isPending;
  const updateConnection = (change: { provider?: AiTranscriptionStandard; displayName?: string; baseUrl?: string; apiKey?: string }) => {
    if (change.provider !== undefined) setProvider(change.provider);
    if (change.displayName !== undefined) setDisplayName(change.displayName);
    if (change.baseUrl !== undefined) setBaseUrl(change.baseUrl);
    if (change.apiKey !== undefined) setApiKey(change.apiKey);
    testMutation.reset();
  };
  const resetConnectionForm = () => {
    setProvider(saved.provider);
    setDisplayName(saved.displayName);
    setBaseUrl(saved.baseUrl);
    setApiKey("");
    saveMutation.reset();
    testMutation.reset();
  };
  const handleConnectionChange = (open: boolean) => {
    setShowConnection(open);
    if (!open) {
      testAbortRef.current?.abort();
      resetConnectionForm();
    }
  };
  const handleAddModelChange = (open: boolean) => {
    setShowAddModel(open);
    if (!open) {
      setModelId("");
      addModelMutation.reset();
    }
  };
  const deleteProvider = () => {
    if (window.confirm(t("speechTranscription.deleteProviderConfirm", { name: saved.displayName }))) {
      deleteMutation.mutate();
    }
  };
  const deleteModel = (model: AiTranscriptionProvider["models"][number]) => {
    if (window.confirm(t("speechTranscription.deleteModelConfirm", { name: model.displayName }))) {
      deleteModelMutation.mutate(model.id);
    }
  };

  return (
    <section>
      <div className="flex flex-col gap-2.5 p-3.5 sm:p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="truncate text-xs font-normal text-slate-900">{saved.displayName}</span>
            {saved.credentialsUnavailable ? (
              <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-normal text-amber-800">
                {t("aiModel.savedCredentialsUnavailableBadge")}
              </span>
            ) : null}
            <span className="max-w-full truncate font-mono text-xs text-slate-400">{formatBaseUrl(saved.baseUrl)}</span>
            <span className="max-w-full truncate text-xs text-slate-400">{t(`speechTranscription.standards.${saved.provider}`)}</span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="hidden text-xs text-slate-400 sm:inline">
              {saved.isEnabled ? t("speechTranscription.serviceEnabledStatus") : t("speechTranscription.serviceDisabledStatus")}
            </span>
            <Switch
              checked={saved.isEnabled}
              disabled={readOnly || toggleMutation.isPending}
              aria-label={t("speechTranscription.serviceEnabled")}
              onCheckedChange={(checked) => toggleMutation.mutate(checked)}
            />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-slate-500 hover:text-slate-900"
                    disabled={readOnly}
                    onClick={() => setShowAddModel(true)}
                    aria-label={t("speechTranscription.addModel")}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{t("speechTranscription.addModel")}</TooltipContent>
              </Tooltip>
              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-500 hover:text-slate-900"
                        disabled={cardBusy}
                        aria-label={t("speechTranscription.serviceActions")}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{t("speechTranscription.serviceActions")}</TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem disabled={readOnly} onSelect={() => { resetConnectionForm(); setShowConnection(true); }}>
                    <Pencil className="mr-2 h-4 w-4" />{t("speechTranscription.editConnection")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-rose-600 focus:text-rose-700" disabled={readOnly} onSelect={deleteProvider}>
                    <Trash2 className="mr-2 h-4 w-4" />{t("common.delete")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TooltipProvider>
          </div>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5 pt-0.5">
          <TooltipProvider>
            {saved.models.length ? saved.models.map((model) => (
              <span
                key={model.id}
                className="inline-flex h-6.5 max-w-full min-w-0 items-center gap-1.5 rounded-md border border-slate-200/80 bg-slate-50/80 pl-2 pr-1 text-xs text-slate-700"
              >
                <span className="min-w-0 truncate font-normal">{model.displayName}</span>
                {model.id === defaultModelId ? (
                  <span className="shrink-0 rounded border border-slate-200 bg-slate-100 px-1 py-0.5 text-xs font-normal text-slate-700">
                    {t("speechTranscription.defaultBadge")}
                  </span>
                ) : null}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-4 w-4 shrink-0 text-slate-400 hover:bg-card hover:text-rose-600"
                      disabled={readOnly || deleteModelMutation.isPending}
                      onClick={() => deleteModel(model)}
                      aria-label={`${t("speechTranscription.removeModel")}: ${model.displayName}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{t("speechTranscription.removeModel")}</TooltipContent>
                </Tooltip>
              </span>
            )) : (
              <span className="text-xs text-slate-400">{t("speechTranscription.noModels")}</span>
            )}
          </TooltipProvider>
        </div>
      </div>
      {cardError ? (
        <p className="border-t px-4 py-3 text-xs font-medium text-rose-600" role="alert">
          {aiErrorMessage(cardError, t("speechTranscription.failed"), t("aiModel.encryptionKeyMissing"), t("speechTranscription.savedCredentialsUnavailable"))}
        </p>
      ) : null}
      <Dialog open={showConnection} onOpenChange={handleConnectionChange}>
        <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-lg">
          <form className="grid gap-4" onSubmit={(event: FormEvent) => { event.preventDefault(); if (readOnly || connectionBusy) return; saveMutation.mutate(); }}>
            <DialogHeader>
              <DialogTitle className="text-xs font-normal">{t("speechTranscription.editConnection")}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("speechTranscription.displayName")}>
                <Input className="h-9 text-xs" value={displayName} onChange={(event) => updateConnection({ displayName: event.target.value })} required maxLength={80} disabled={readOnly || connectionBusy} />
              </Field>
              <Field label={t("speechTranscription.standard")}>
                <Select value={provider} onValueChange={(value) => updateConnection({ provider: value as AiTranscriptionStandard })} disabled={readOnly || connectionBusy}>
                  <SelectTrigger className="h-9 bg-card text-xs font-normal"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openai-compatible">{t("speechTranscription.standards.openai-compatible")}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label={t("speechTranscription.baseUrl")} hint={t("speechTranscription.baseUrlHint")}>
              <Input className="h-9 text-xs" value={baseUrl} onChange={(event) => updateConnection({ baseUrl: event.target.value })} required inputMode="url" autoComplete="off" spellCheck={false} maxLength={500} disabled={readOnly || connectionBusy} />
            </Field>
            <Field label={t("speechTranscription.apiToken")} hint={saved.hasApiKey ? t("speechTranscription.apiTokenSavedHint") : t("speechTranscription.apiTokenHint")}>
              <Input
                className="h-9 text-xs"
                type="password"
                value={apiKey}
                onChange={(event) => updateConnection({ apiKey: event.target.value })}
                placeholder={saved.hasApiKey ? t("speechTranscription.apiTokenStoredPlaceholder") : ""}
                autoComplete="new-password"
                maxLength={4096}
                disabled={readOnly || connectionBusy}
              />
            </Field>
            {saved.models.length ? (
              <Field label={t("speechTranscription.testModel")}>
                <Select value={testModelConfigId} onValueChange={(value) => { setTestModelConfigId(value); testMutation.reset(); }} disabled={connectionBusy}>
                  <SelectTrigger className="h-9 bg-card text-xs font-normal"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {saved.models.map((model) => <SelectItem key={model.id} value={model.id}>{model.displayName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            ) : <p className="text-xs text-slate-500">{t("speechTranscription.testModelRequired")}</p>}
            <p className="text-xs leading-5 text-slate-500">{t("speechTranscription.testHint")}</p>
            {testMutation.isSuccess ? (
              <p className="flex items-start gap-1.5 text-xs font-medium text-emerald-700" role="status">
                <CheckCircle2 className="h-4 w-4 shrink-0" />{t("speechTranscription.testSucceeded", { transcript: testMutation.data.slice(0, 160) })}
              </p>
            ) : null}
            {testMutation.isError ? (
              <p className="text-xs font-medium text-rose-600" role="alert">
                {testMutation.error instanceof SpeechProviderReachabilityError
                  ? t(testMutation.error.platform === "browser"
                    ? "speechTranscription.browserDirectUnavailable" : "speechTranscription.desktopDirectUnavailable")
                  : aiErrorMessage(testMutation.error, t("speechTranscription.testFailed"), t("aiModel.encryptionKeyMissing"), t("speechTranscription.savedCredentialsUnavailable"))}
              </p>
            ) : null}
            {saveMutation.isError ? (
              <p className="text-xs font-medium text-rose-600" role="alert">
                {aiErrorMessage(saveMutation.error, t("speechTranscription.failed"), t("aiModel.encryptionKeyMissing"), t("speechTranscription.savedCredentialsUnavailable"))}
              </p>
            ) : null}
            <DialogFooter className="gap-2 sm:space-x-0">
              <Button type="button" variant="outline" className="text-xs font-normal" onClick={() => handleConnectionChange(false)}>{t("common.cancel")}</Button>
              <Button type="button" variant="outline" className="text-xs font-normal" disabled={readOnly || !baseUrl.trim() || !testModelConfigId || (!saved.hasApiKey && !apiKey.trim()) || connectionBusy} onClick={() => testMutation.mutate()}>
                {testMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{t("speechTranscription.test")}
              </Button>
              <Button type="submit" variant="solid" className="text-xs font-normal" disabled={readOnly || connectionBusy}>
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={showAddModel} onOpenChange={handleAddModelChange}>
        <DialogContent className="sm:max-w-md">
          <form className="grid gap-4" onSubmit={(event: FormEvent) => { event.preventDefault(); if (readOnly || !trimAiText(modelId)) return; addModelMutation.mutate(); }}>
            <DialogHeader>
              <DialogTitle className="text-xs font-normal">{t("speechTranscription.addModel")}</DialogTitle>
            </DialogHeader>
            <Field label={t("speechTranscription.modelId")}>
              <Input className="h-9 text-xs" value={modelId} onChange={(event) => setModelId(event.target.value)} placeholder={t("speechTranscription.modelIdPlaceholder")} autoComplete="off" spellCheck={false} maxLength={200} required disabled={readOnly} />
            </Field>
            {addModelMutation.isError ? (
              <p className="text-xs font-medium text-rose-600" role="alert">
                {aiErrorMessage(addModelMutation.error, t("speechTranscription.failed"), t("aiModel.encryptionKeyMissing"), t("speechTranscription.savedCredentialsUnavailable"))}
              </p>
            ) : null}
            <DialogFooter className="gap-2 sm:space-x-0">
              <Button type="button" variant="outline" className="text-xs font-normal" onClick={() => handleAddModelChange(false)}>{t("common.cancel")}</Button>
              <Button type="submit" variant="solid" className="text-xs font-normal" disabled={readOnly || addModelMutation.isPending || !trimAiText(modelId)}>
                {addModelMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{t("speechTranscription.addModel")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
};

const formatBaseUrl = (baseUrl: string) => {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
};

const Field = ({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) => (
  <label className="grid gap-1.5 text-xs font-normal leading-5 text-slate-700">
    {label}{children}{hint ? <span className="text-xs font-normal leading-4 text-slate-500">{hint}</span> : null}
  </label>
);
