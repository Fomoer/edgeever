import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type AiTranscriptionSettings, type AiTranscriptionStandard } from "@edgeever/shared";
import { AudioLines, CheckCircle2, Loader2, Plus, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { aiErrorMessage } from "@/components/settings/ai-provider-options";
import { SpeechProviderCard } from "@/components/settings/SpeechProviderCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/lib/api";
import { SpeechProviderReachabilityError } from "@/lib/speech-transcription-error";
import {
  SETTINGS_CARD_HEADER_CLASSNAME,
  SETTINGS_CARD_ICON_CLASSNAME,
  SETTINGS_CARD_TITLE_CLASSNAME,
  SETTINGS_ITEM_TITLE_CLASSNAME,
} from "./settings-ui";

const emptyDraft = {
  provider: "openai-compatible" as AiTranscriptionStandard,
  displayName: "",
  baseUrl: "",
  apiKey: "",
  initialModelId: "",
};

export const SpeechTranscriptionCard = ({ demoMode }: { demoMode: boolean }) => {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ["ai-transcription-settings"],
    queryFn: api.getAiTranscriptionSettings,
  });
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const testAbortRef = useRef<AbortController | null>(null);

  const settings = settingsQuery.data;
  const providers = settings?.providers ?? [];
  const readOnly = demoMode || Boolean(settings?.readOnly);
  const encryptionConfigured = settings?.encryptionConfigured ?? false;
  const canAdd = !readOnly && encryptionConfigured;
  const hasUnavailableCredentials = providers.some((provider) => provider.credentialsUnavailable);
  const allModels = providers.flatMap((provider) =>
    provider.models.map((model) => ({ ...model, providerName: provider.displayName, providerEnabled: provider.isEnabled })));
  const defaultModelAvailable = !settings?.defaultModelId
    || allModels.some((model) => model.id === settings.defaultModelId && model.providerEnabled);
  const applySettings = (saved: AiTranscriptionSettings) => {
    queryClient.setQueryData(["ai-transcription-settings"], saved);
  };
  const createMutation = useMutation({
    mutationFn: () => api.createAiTranscriptionProvider({
      provider: draft.provider,
      displayName: draft.displayName.trim(),
      baseUrl: draft.baseUrl.trim(),
      apiKey: draft.apiKey.trim(),
      isEnabled: true,
      ...(draft.initialModelId.trim() ? { initialModelId: draft.initialModelId.trim() } : {}),
    }),
    onSuccess: (saved) => {
      applySettings(saved);
      setShowAdd(false);
      setDraft(emptyDraft);
    },
  });
  const testMutation = useMutation({
    mutationFn: async () => {
      const controller = new AbortController();
      testAbortRef.current = controller;
      try {
        const { testSpeechService } = await import("@/lib/transcribe-note-resource");
        return await testSpeechService({
          baseUrl: draft.baseUrl,
          modelId: draft.initialModelId,
          apiKey: draft.apiKey.trim(),
        }, controller.signal, { sampleLocale: i18n.resolvedLanguage ?? i18n.language });
      } finally {
        if (testAbortRef.current === controller) testAbortRef.current = null;
      }
    },
  });
  const defaultMutation = useMutation({
    mutationFn: api.updateDefaultAiTranscriptionModel,
    onSuccess: applySettings,
  });
  const addDisabledReason = readOnly
    ? t("speechTranscription.demoDisabled")
    : !encryptionConfigured
      ? t("aiModel.encryptionKeyMissing")
      : undefined;
  const handleAddDialogChange = (open: boolean) => {
    setShowAdd(open);
    if (!open) {
      testAbortRef.current?.abort();
      setDraft(emptyDraft);
      createMutation.reset();
      testMutation.reset();
    }
  };
  const updateDraft = (change: Partial<typeof emptyDraft>) => {
    setDraft((current) => ({ ...current, ...change }));
    testMutation.reset();
  };

  return (
    <Card className="w-full min-w-0 overflow-hidden shadow-none">
      <CardHeader className={SETTINGS_CARD_HEADER_CLASSNAME}>
        <CardTitle className={SETTINGS_CARD_TITLE_CLASSNAME}>
          <AudioLines className={SETTINGS_CARD_ICON_CLASSNAME} />
          {t("speechTranscription.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5 p-4 pt-0 sm:px-5 sm:pb-5">
        {settingsQuery.isLoading ? (
          <p className="flex items-center gap-2 text-xs leading-5 text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("common.loading")}
          </p>
        ) : settingsQuery.isError ? (
          <p className="text-xs font-medium text-rose-600" role="alert">
            {aiErrorMessage(settingsQuery.error, t("speechTranscription.failed"), t("aiModel.encryptionKeyMissing"), t("speechTranscription.savedCredentialsUnavailable"))}
          </p>
        ) : (
          <>
            {!encryptionConfigured ? (
              <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                {t("aiModel.encryptionKeyMissing")}
              </p>
            ) : null}
            {hasUnavailableCredentials ? (
              <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                {t("speechTranscription.savedCredentialsUnavailable")}
              </p>
            ) : null}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className={SETTINGS_ITEM_TITLE_CLASSNAME}>{t("speechTranscription.defaultModel")}</div>
                <div className="w-56 max-w-[60%] shrink-0 sm:w-72">
                  <Select
                    value={settings?.defaultModelId ?? "none"}
                    onValueChange={(value) => defaultMutation.mutate(value === "none" ? null : value)}
                    disabled={readOnly || defaultMutation.isPending}
                  >
                    <SelectTrigger className="h-8 bg-card text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("speechTranscription.noDefaultModel")}</SelectItem>
                      {allModels.map((model) => (
                        <SelectItem key={model.id} value={model.id} disabled={!model.providerEnabled}>
                          {model.displayName} · {model.providerName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {!defaultModelAvailable ? (
                <p className="flex items-center gap-1.5 text-xs text-amber-700">
                  <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
                  {t("speechTranscription.defaultUnavailable")}
                </p>
              ) : null}
              {defaultMutation.isError ? (
                <p className="text-xs font-medium text-rose-600" role="alert">
                  {aiErrorMessage(defaultMutation.error, t("speechTranscription.failed"), t("aiModel.encryptionKeyMissing"), t("speechTranscription.savedCredentialsUnavailable"))}
                </p>
              ) : null}
            </div>
            <section className="grid gap-3">
              <div className="flex items-center justify-end">
                <DisabledActionTooltip label={!canAdd ? addDisabledReason : undefined}>
                  <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 bg-card text-xs font-normal" disabled={!canAdd} onClick={() => handleAddDialogChange(true)}>
                    <Plus className="h-3.5 w-3.5" />{t("speechTranscription.addProvider")}
                  </Button>
                </DisabledActionTooltip>
              </div>
              {providers.length ? (
                <div className="overflow-hidden rounded-lg border border-slate-200 divide-y divide-slate-100 bg-card">
                  {providers.map((provider) => (
                    <SpeechProviderCard
                      key={provider.id}
                      provider={provider}
                      defaultModelId={settings?.defaultModelId ?? null}
                      readOnly={readOnly}
                      onChanged={applySettings}
                    />
                  ))}
                </div>
              ) : (
                <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-xs text-slate-400">{t("speechTranscription.noProviders")}</p>
              )}
            </section>
            {readOnly ? <p className="text-xs leading-5 text-slate-500">{t("speechTranscription.demoDisabled")}</p> : null}
            <p className="text-xs leading-5 text-slate-500">{t("speechTranscription.attachmentNotice")}</p>
            <Dialog open={showAdd} onOpenChange={handleAddDialogChange}>
              <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-lg">
                <form
                  className="grid gap-4"
                  onSubmit={(event: FormEvent) => {
                    event.preventDefault();
                    if (!canAdd || createMutation.isPending || testMutation.isPending) return;
                    createMutation.mutate();
                  }}
                >
                  <DialogHeader>
                    <DialogTitle className="text-xs font-normal">{t("speechTranscription.addProvider")}</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={t("speechTranscription.displayName")}>
                      <Input className="h-9 text-xs" value={draft.displayName} onChange={(event) => updateDraft({ displayName: event.target.value })} required maxLength={80} disabled={testMutation.isPending || createMutation.isPending} />
                    </Field>
                    <SpeechStandardField
                      value={draft.provider}
                      onChange={(provider) => updateDraft({ provider })}
                      disabled={testMutation.isPending || createMutation.isPending}
                    />
                  </div>
                  <Field label={t("speechTranscription.baseUrl")} hint={t("speechTranscription.baseUrlHint")}>
                    <Input className="h-9 text-xs" value={draft.baseUrl} onChange={(event) => updateDraft({ baseUrl: event.target.value })} placeholder={t("speechTranscription.baseUrlPlaceholder")} required inputMode="url" autoComplete="off" spellCheck={false} maxLength={500} disabled={testMutation.isPending || createMutation.isPending} />
                  </Field>
                  <Field label={t("speechTranscription.modelId")}>
                    <Input className="h-9 text-xs" value={draft.initialModelId} onChange={(event) => updateDraft({ initialModelId: event.target.value })} placeholder={t("speechTranscription.modelIdPlaceholder")} required autoComplete="off" spellCheck={false} maxLength={200} disabled={testMutation.isPending || createMutation.isPending} />
                  </Field>
                  <Field label={t("speechTranscription.apiToken")} hint={t("speechTranscription.apiTokenHint")}>
                    <Input className="h-9 text-xs" type="password" value={draft.apiKey} onChange={(event) => updateDraft({ apiKey: event.target.value })} required autoComplete="new-password" maxLength={4096} disabled={testMutation.isPending || createMutation.isPending} />
                  </Field>
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
                  {createMutation.isError ? (
                    <p className="text-xs font-medium text-rose-600" role="alert">
                      {aiErrorMessage(createMutation.error, t("speechTranscription.failed"), t("aiModel.encryptionKeyMissing"), t("speechTranscription.savedCredentialsUnavailable"))}
                    </p>
                  ) : null}
                  <DialogFooter className="gap-2 sm:space-x-0">
                    <Button type="button" variant="outline" className="text-xs font-normal" onClick={() => handleAddDialogChange(false)}>{t("common.cancel")}</Button>
                    <Button type="button" variant="outline" className="text-xs font-normal" disabled={!canAdd || !draft.baseUrl.trim() || !draft.initialModelId.trim() || !draft.apiKey.trim() || createMutation.isPending || testMutation.isPending} onClick={() => testMutation.mutate()}>
                      {testMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{t("speechTranscription.test")}
                    </Button>
                    <Button type="submit" variant="solid" className="text-xs font-normal" disabled={!canAdd || createMutation.isPending || testMutation.isPending}>
                      {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{t("speechTranscription.addProvider")}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </>
        )}
      </CardContent>
    </Card>
  );
};

const SpeechStandardField = ({
  value,
  onChange,
  disabled = false,
}: {
  value: AiTranscriptionStandard;
  onChange: (value: AiTranscriptionStandard) => void;
  disabled?: boolean;
}) => {
  const { t } = useTranslation();
  return (
    <Field label={t("speechTranscription.standard")}>
      <Select value={value} onValueChange={(next) => onChange(next as AiTranscriptionStandard)} disabled={disabled}>
        <SelectTrigger className="h-9 bg-card text-xs font-normal"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="openai-compatible">{t("speechTranscription.standards.openai-compatible")}</SelectItem>
        </SelectContent>
      </Select>
    </Field>
  );
};

const Field = ({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) => (
  <label className="grid gap-1.5 text-xs font-normal leading-5 text-slate-700">
    {label}{children}{hint ? <span className="text-xs font-normal leading-4 text-slate-500">{hint}</span> : null}
  </label>
);

const DisabledActionTooltip = ({ label, children }: { label?: string; children: ReactNode }) => {
  if (!label) return children;
  return (
    <TooltipProvider delayDuration={0} skipDelayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex" tabIndex={0}>{children}</span>
        </TooltipTrigger>
        <TooltipContent side="bottom">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
