import { useEffect, useState } from "react";
import { LoaderCircle, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { AttachmentTranscriptContextValue } from "./AttachmentTranscriptContext";

export const AttachmentTranscriptInline = ({
  transcript,
  canInsert,
  onDismiss,
  onRetry,
  onInsert,
}: AttachmentTranscriptContextValue & { transcript: NonNullable<AttachmentTranscriptContextValue["transcript"]> }) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  useEffect(() => setCopied(false), [transcript.text]);

  return (
    <span
      className="mt-3 flex w-full flex-col gap-3 rounded-xl border border-slate-200 bg-card p-4 shadow-sm"
      data-edgeever-attachment-transcript
      contentEditable={false}
    >
      <span className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-slate-800">{t("speechTranscription.resultTitle")}</span>
        <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label={t("common.close")} onClick={onDismiss}>
          <X className="h-4 w-4" />
        </Button>
      </span>
      {transcript.loading ? (
        <span className="flex items-center gap-2 text-sm text-slate-600" role="status">
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          {transcript.completedSegments > 0
            ? t("speechTranscription.recognizingProgress", { count: transcript.completedSegments })
            : t("speechTranscription.recognizing")}
        </span>
      ) : null}
      {transcript.error ? (
        <span className="flex flex-wrap items-center justify-between gap-2 text-sm text-rose-600" role="alert">
          <span>{transcript.error}</span>
          <Button type="button" size="sm" variant="outline" onClick={onRetry}>{t("speechTranscription.retry")}</Button>
        </span>
      ) : null}
      {transcript.text ? (
        <>
          <span className="max-h-80 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-6 text-slate-800" aria-label={t("speechTranscription.resultTitle")}>
            {transcript.text}
          </span>
          <span className="flex flex-wrap justify-end gap-2">
            <Button type="button" size="sm" variant="outline" onClick={async () => {
              await navigator.clipboard.writeText(transcript.text);
              setCopied(true);
            }}>{t(copied ? "speechTranscription.copied" : "speechTranscription.copy")}</Button>
            {canInsert ? <Button type="button" size="sm" onClick={onInsert}>{t("speechTranscription.insertIntoNote")}</Button> : null}
          </span>
        </>
      ) : null}
    </span>
  );
};
