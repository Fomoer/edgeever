import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import type { PluginManifest, PluginSettingField, PluginSettingValue } from "@edgeever/plugin-api";
import type { EdgeEverPluginHost } from "@/lib/plugins/plugin-host";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { groupPluginSettingFields } from "./plugin-settings-layout";

const PluginSettingListDialog = ({ field }: { field: PluginSettingField }) => {
  const { t } = useTranslation();
  const list = field.list;
  if (!list) return null;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2 mt-0.5 h-7 gap-0.5 px-2 text-xs text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
          aria-haspopup="dialog"
        >
          {list.actionLabel ?? t("plugins.settings.viewList")}
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="grid max-h-[min(720px,calc(100dvh-2rem))] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="space-y-1.5 border-b border-slate-200 p-6 pb-4 pr-12 text-left">
          <DialogTitle>{list.title ?? field.label}</DialogTitle>
          <DialogDescription>{t("plugins.settings.listCount", { count: list.items.length })}</DialogDescription>
        </DialogHeader>
        <ul className="min-h-0 divide-y divide-slate-100 overflow-y-auto pb-1">
          {list.items.map((item, index) => (
            <li key={`${item.title}:${item.description ?? ""}:${index}`} className="px-6 py-3">
              <div className="text-sm font-medium text-slate-800">{item.title}</div>
              {item.description ? <div className="mt-0.5 text-xs leading-5 text-slate-500">{item.description}</div> : null}
            </li>
          ))}
        </ul>
        <DialogFooter className="border-t border-slate-200 p-4 sm:justify-end">
          <DialogClose asChild>
            <Button type="button" variant="outline" size="sm">{t("common.close")}</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const PluginSettingFieldRow = ({
  configuredSecret,
  compact = false,
  disabled,
  field,
  inputId,
  onChange,
  value,
}: {
  configuredSecret: boolean;
  compact?: boolean;
  disabled: boolean;
  field: PluginSettingField;
  inputId: string;
  onChange: (value: PluginSettingValue | "") => void;
  value: PluginSettingValue | "";
}) => {
  const { t } = useTranslation();
  const descriptionId = field.description ? `${inputId}-description` : undefined;
  const label = (
    <label htmlFor={inputId} className="block text-sm font-medium leading-5 text-slate-800">
      {field.label}
      {field.required ? <span className="ml-1 text-rose-600" aria-hidden="true">*</span> : null}
    </label>
  );

  const content = (
    <>
      <div className="min-w-0">
        {label}
        {field.description ? <p id={descriptionId} className="mt-1 text-xs leading-5 text-slate-500">{field.description}</p> : null}
        <PluginSettingListDialog field={field} />
      </div>
      <div className={field.type === "boolean" ? "shrink-0 pt-0.5" : "min-w-0 md:max-w-xl"}>
        {field.type === "boolean" ? (
          <Switch
            id={inputId}
            aria-describedby={descriptionId}
            aria-label={field.label}
            checked={value === true}
            disabled={disabled}
            onCheckedChange={onChange}
          />
        ) : field.type === "select" ? (
          <Select
            disabled={disabled}
            value={value === "" ? (field.required ? "" : "none") : `option:${value}`}
            onValueChange={(next) => onChange(next === "none" ? "" : next.slice(7))}
          >
            <SelectTrigger id={inputId} aria-describedby={descriptionId} aria-required={field.required}>
              <SelectValue placeholder={t("plugins.settings.none")} />
            </SelectTrigger>
            <SelectContent>
              {!field.required ? <SelectItem value="none">{t("plugins.settings.none")}</SelectItem> : null}
              {field.options.map((option) => <SelectItem key={option.value} value={`option:${option.value}`}>{option.label}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : (
          <Input
            id={inputId}
            aria-describedby={descriptionId}
            required={field.required && !(field.type === "secret" && configuredSecret)}
            autoComplete={field.type === "secret" ? "new-password" : "off"}
            disabled={disabled}
            type={field.type === "secret" ? "password" : field.type === "number" ? "number" : "text"}
            value={String(value)}
            placeholder={field.type === "secret" && configuredSecret
              ? t("plugins.settings.secretConfigured")
              : field.type === "text" || field.type === "secret"
                ? field.placeholder
                : undefined}
            min={field.type === "number" ? field.min : undefined}
            max={field.type === "number" ? field.max : undefined}
            step={field.type === "number" ? field.step ?? "any" : undefined}
            onChange={(event) => onChange(
              field.type === "number" && event.target.value !== "" ? Number(event.target.value) : event.target.value,
            )}
          />
        )}
      </div>
    </>
  );

  if (compact) {
    return <Card className="flex min-w-0 items-start justify-between gap-4 p-4 shadow-none">{content}</Card>;
  }

  return (
    <div className={field.type === "boolean"
      ? "flex min-w-0 items-start justify-between gap-4 px-4 py-4 sm:px-5"
      : "grid min-w-0 gap-3 px-4 py-4 sm:px-5 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] md:gap-8"}>
      {content}
    </div>
  );
};

export const PluginSettingsSection = ({ host, manifest }: { host: EdgeEverPluginHost; manifest: PluginManifest }) => {
  const { t } = useTranslation();
  const formId = useId();
  const fields = manifest.settings?.fields ?? [];
  const fieldGroups = groupPluginSettingFields(fields);
  const [values, setValues] = useState<Record<string, PluginSettingValue | "">>({});
  const [configuredSecrets, setConfiguredSecrets] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(fields.length > 0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(fields.length > 0);
    setMessage(null);
    setError(null);
    setLoadError(null);
    void Promise.all(fields.map(async (field) => {
      if (field.type === "secret") return { key: field.key, value: "" as const, configured: await host.hasSettingValue(manifest.id, field.key) };
      return { key: field.key, value: await host.getSettingValue(manifest.id, field.key) ?? "", configured: false };
    })).then((loaded) => {
      if (!active) return;
      setValues(Object.fromEntries(loaded.map((item) => [item.key, item.value])));
      setConfiguredSecrets(Object.fromEntries(loaded.map((item) => [item.key, item.configured])));
      setLoading(false);
    }).catch((error) => {
      if (!active) return;
      setLoadError(error instanceof Error ? error.message : String(error));
      setLoading(false);
    });
    return () => { active = false; };
  }, [host, manifest.id, manifest.version, manifest.settings, loadAttempt]);

  if (fields.length === 0) return null;

  const clearFeedback = () => {
    setMessage(null);
    setError(null);
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      // Check every required field before writing any values.
      for (const field of fields) {
        const value = values[field.key];
        if (field.type === "secret" && value === "" && configuredSecrets[field.key]) continue;
        if (field.required && (value == null || (typeof value === "string" && !value.trim()))) {
          throw new Error(t("plugins.settings.required", { name: field.label }));
        }
      }
      for (const field of fields) {
        const value = values[field.key];
        if (field.type === "secret" && value === "") {
          continue;
        }
        if (value === "") {
          await host.removeSettingValue(manifest.id, field.key);
          continue;
        }
        await host.setSettingValue(manifest.id, field.key, value);
        if (field.type === "secret") {
          setConfiguredSecrets((current) => ({ ...current, [field.key]: true }));
          setValues((current) => ({ ...current, [field.key]: "" }));
        }
      }
      setMessage(t("plugins.settings.saved"));
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="min-w-0" aria-labelledby={`${formId}-title`}>
      <header className="border-b border-slate-200 pb-5">
        <h3 id={`${formId}-title`} className="text-base font-semibold text-slate-900">{t("plugins.settings.title")}</h3>
      </header>
      {loading ? <p className="py-8 text-sm text-slate-500" role="status">{t("common.loading")}</p> : loadError ? (
        <div className="mt-5 grid justify-items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4">
          <p className="text-sm leading-6 text-rose-700" role="alert">{t("plugins.settings.loadFailed", { message: loadError })}</p>
          <Button size="sm" variant="outline" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>{t("plugins.settings.retry")}</Button>
        </div>
      ) : (
        <form onChange={clearFeedback} onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <fieldset disabled={saving} className="min-w-0">
            <div className="py-5">
              {fieldGroups.map((group, groupIndex) => {
                const rows = group.fields.map((field) => {
                  const value = values[field.key] ?? "";
                  const inputId = `${formId}-${field.key}`;
                  return (
                    <PluginSettingFieldRow
                      key={field.key}
                      compact={group.compact}
                      configuredSecret={Boolean(configuredSecrets[field.key])}
                      disabled={saving}
                      field={field}
                      inputId={inputId}
                      value={value}
                      onChange={(nextValue) => {
                        clearFeedback();
                        setValues((current) => ({ ...current, [field.key]: nextValue }));
                      }}
                    />
                  );
                });
                return group.compact ? (
                  <div
                    key={group.id}
                    className={`grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4${groupIndex > 0 ? " mt-5" : ""}`}
                  >
                    {rows}
                  </div>
                ) : (
                  <Card
                    key={group.id}
                    className={`${groupIndex > 0 ? "mt-5 " : ""}divide-y divide-slate-100 overflow-hidden shadow-none`}
                  >
                    {rows}
                  </Card>
                );
              })}
            </div>
            <div className="flex min-h-14 flex-wrap items-center justify-end gap-3 border-t border-slate-200 pt-4">
              {message ? <span className="mr-auto text-sm text-emerald-700" role="status">{message}</span> : null}
              {error ? <p className="mr-auto text-sm text-rose-700" role="alert">{t("plugins.settings.saveFailed", { message: error })}</p> : null}
              <Button type="submit" size="sm" disabled={saving}>{saving ? t("common.saving") : t("common.save")}</Button>
            </div>
          </fieldset>
        </form>
      )}
    </section>
  );
};
