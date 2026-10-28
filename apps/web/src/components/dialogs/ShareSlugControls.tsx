import { isValidMemoShareSlug, MEMO_SHARE_SLUG_MAX_LENGTH } from "@edgeever/shared";
import { Check, LoaderCircle, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export const ShareSlugControls = ({
  slug,
  busy,
  taken,
  onChange,
}: {
  slug: string | null;
  busy: boolean;
  taken: boolean;
  onChange: (slug: string | null) => void;
}) => {
  const { t } = useTranslation();
  const inputId = useId();
  const [draft, setDraft] = useState(slug ?? "");
  const [submitted, setSubmitted] = useState<string | null>(null);
  useEffect(() => setDraft(slug ?? ""), [slug]);

  const normalized = draft.trim().toLowerCase();
  const invalid = normalized !== "" && !isValidMemoShareSlug(normalized);
  // A taken address only describes the value that was sent; editing the field clears it.
  const showTaken = taken && normalized === submitted;
  const canSave = !busy && normalized !== "" && !invalid && normalized !== slug;

  return (
    <form
      className="space-y-1.5 pt-1"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSave) return;
        setSubmitted(normalized);
        onChange(normalized);
      }}
    >
      <label htmlFor={inputId} className="block text-xs font-medium leading-5 text-slate-800">
        {t("sharing.customSlugLabel")}
      </label>
      <div className="flex items-center gap-1.5">
        <span className="shrink-0 font-mono text-xs text-slate-500">/share/</span>
        <Input
          id={inputId}
          value={draft}
          maxLength={MEMO_SHARE_SLUG_MAX_LENGTH}
          autoCapitalize="off"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={invalid || showTaken}
          onChange={(event) => setDraft(event.target.value)}
          className="min-w-0 font-mono text-xs"
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="submit"
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              disabled={!canSave}
              aria-label={t("sharing.customSlugSave")}
            >
              {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("sharing.customSlugSave")}</TooltipContent>
        </Tooltip>
        {slug ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0"
                disabled={busy}
                aria-label={t("sharing.customSlugClear")}
                onClick={() => onChange(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("sharing.customSlugClear")}</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      {invalid || showTaken ? (
        <p className="text-xs leading-5 text-rose-600" role="alert">
          {t(invalid ? "sharing.customSlugInvalid" : "sharing.customSlugTaken")}
        </p>
      ) : (
        <p className="text-xs leading-5 text-slate-500">{t("sharing.customSlugHint")}</p>
      )}
    </form>
  );
};
