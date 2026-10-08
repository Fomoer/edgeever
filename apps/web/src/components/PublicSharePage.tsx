import "katex/dist/katex.min.css";
import { Node, mergeAttributes } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import { EditorContent, useEditor } from "@tiptap/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Clock3, FileText, LoaderCircle, LockKeyhole, ShieldCheck } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState, type CSSProperties, type FormEvent, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import { ApiRequestError, api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EdgeEverCodeBlock, codeBlockLowlight } from "@/lib/code-block";
import { withEnvironmentTitlePrefix } from "@/lib/environment-title";
import { resolvePublicShareBody } from "@/lib/public-share-body";
import { sanitizeAndScopeCss } from "@/lib/css-sandbox";
import {
  parseImageWidth,
  getImageReferrerPolicy,
  createEdgeEverDocumentExtensions,
  noteProseCssVariables,
  parsePublishedNoteBodyFont,
  resolveNoteProse,
  type PublicMemoShare,
} from "@edgeever/shared";
import { applyEditorBodyFontPreference } from "@/lib/editor-body-font";
import { createEdgeEverMathematics } from "@edgeever/shared/mathematics";
import { PdfAttachment } from "@/components/editor/PdfAttachment";
import { FileAttachment } from "@/components/editor/FileAttachment";

const ReadOnlyX6Diagram = lazy(() => import("@/components/ReadOnlyX6Diagram"));
const ImageViewer = lazy(() => import("@/components/editor/ImageViewer").then((module) => ({ default: module.ImageViewer })));

const SharedImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element) => parseImageWidth(element.getAttribute("data-width") ?? element.style.width),
        renderHTML: (attributes) => {
          const width = parseImageWidth(attributes.width);
          return width ? { "data-width": String(width), style: `width: ${width}%` } : {};
        },
      },
    };
  },
  renderHTML({ HTMLAttributes }) {
    const referrerPolicy = getImageReferrerPolicy(HTMLAttributes.src);
    return [
      "img",
      mergeAttributes(
        this.options.HTMLAttributes,
        HTMLAttributes,
        referrerPolicy ? { referrerpolicy: referrerPolicy } : {},
      ),
    ];
  },
});

const SharedThemeBlock = Node.create({
  name: "edgeeverThemeBlock",
  group: "block",
  content: "block+",
  defining: true,
  isolating: true,
  addAttributes() {
    return {
      kind: {
        default: "intro",
        parseHTML: (element: HTMLElement) => element.getAttribute("data-theme-block-kind") || "intro",
        renderHTML: (attributes: { kind?: string }) => ({ "data-theme-block-kind": attributes.kind || "intro" }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "section[data-theme-block-kind]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["section", mergeAttributes(HTMLAttributes, { "data-edgeever-theme-block": "true" }), 0];
  },
});

const SharedRichText = ({ content }: { content: PublicMemoShare["contentJson"] }) => {
  const { t } = useTranslation();
  const [imagePreview, setImagePreview] = useState<{ alt: string; url: string } | null>(null);
  const editor = useEditor({
    extensions: [
      ...createEdgeEverDocumentExtensions({
        mathematics: createEdgeEverMathematics(),
        starterKit: { codeBlock: false, link: { openOnClick: true } },
        image: SharedImage.configure({ allowBase64: false, inline: false }),
        pdf: PdfAttachment,
        file: FileAttachment,
        table: { table: { renderWrapper: true } },
      }),
      EdgeEverCodeBlock.configure({ lowlight: codeBlockLowlight, defaultLanguage: "plaintext" }),
      SharedThemeBlock,
    ],
    content,
    editable: false,
    editorProps: {
      attributes: {
        class: "prose prose-slate max-w-none focus:outline-none",
        "aria-label": "Shared note content",
      },
    },
  }, [content]);

  const previewImage = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLImageElement) || !target.currentSrc) return;
    event.preventDefault();
    setImagePreview({ alt: target.alt, url: target.currentSrc });
  };

  return (
    <div onDoubleClick={previewImage}>
      <EditorContent editor={editor} />
      {imagePreview ? (
        <Suspense fallback={null}>
          <ImageViewer
            alt={imagePreview.alt}
            closeLabel={t("editor.closeImagePreview")}
            open
            src={imagePreview.url}
            viewerLabel={t("editor.imageViewer")}
            zoomInLabel={t("editor.imageZoomIn")}
            zoomOutLabel={t("editor.imageZoomOut")}
            onClose={() => setImagePreview(null)}
          />
        </Suspense>
      ) : null}
    </div>
  );
};

const SharedDocument = ({
  locale,
  share,
  token,
}: {
  locale: "zh-CN" | "en-US" | "ja" | "pl";
  share: PublicMemoShare;
  token: string;
}) => {
  const body = useMemo(() => resolvePublicShareBody(share, token), [share, token]);
  if (body.type === "diagram") {
    return (
      <Suspense
        fallback={
          <div className="flex min-h-[360px] items-center justify-center text-slate-400">
            <LoaderCircle className="h-6 w-6 animate-spin" />
          </div>
        }
      >
        <ReadOnlyX6Diagram diagram={body.diagram} locale={locale} theme="light" />
      </Suspense>
    );
  }
  return <SharedRichText content={body.content} />;
};

const isSharePasswordError = (error: unknown, code: string) =>
  error instanceof ApiRequestError && error.code === code;

const PublicSharePasswordForm = ({
  token,
  onUnlocked,
}: {
  token: string;
  onUnlocked: () => Promise<unknown>;
}) => {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const unlockMutation = useMutation({
    mutationFn: () => api.unlockPublicMemoShare(token, password),
    onSuccess: () => onUnlocked(),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!password.trim() || unlockMutation.isPending) return;
    unlockMutation.mutate();
  };
  const errorKey = isSharePasswordError(unlockMutation.error, "share_unlock_rate_limited")
    ? "sharing.passwordRateLimited"
    : unlockMutation.error
      ? "sharing.passwordInvalid"
      : null;

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-slate-50 px-5">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-card p-8 shadow-sm">
        <LockKeyhole className="mx-auto h-9 w-9 text-slate-700" />
        <h1 className="mt-4 text-center text-xl font-semibold text-slate-900">{t("sharing.passwordRequiredTitle")}</h1>
        <p className="mt-2 text-center text-sm leading-6 text-slate-500">{t("sharing.passwordRequiredHint")}</p>
        <form className="mt-6 space-y-3" onSubmit={submit}>
          <Input
            type="password"
            value={password}
            autoComplete="off"
            autoFocus
            aria-label={t("sharing.passwordLabel")}
            onChange={(event) => setPassword(event.target.value)}
          />
          <Button className="w-full" variant="solid" type="submit" disabled={!password.trim() || unlockMutation.isPending}>
            {unlockMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}
            {t("sharing.passwordSubmit")}
          </Button>
          {errorKey ? <p className="text-sm text-rose-600" role="alert">{t(errorKey)}</p> : null}
        </form>
      </section>
    </main>
  );
};

export const PublicSharePage = () => {
  const { t, i18n } = useTranslation();
  const { token = "" } = useParams();
  const shareQuery = useQuery({
    queryKey: ["public-share", token],
    queryFn: () => api.getPublicMemoShare(token),
    enabled: Boolean(token),
    retry: false,
  });
  const share = shareQuery.data?.share;
  const passwordRequired = isSharePasswordError(shareQuery.error, "share_password_required");
  const publishedBodyFont = share ? parsePublishedNoteBodyFont(share.bodyFont) : undefined;

  useEffect(() => {
    if (publishedBodyFont === undefined) return undefined;
    if (!publishedBodyFont) {
      delete document.documentElement.dataset.editorBodyFont;
      document.documentElement.style.removeProperty("--editor-body-font-family");
    } else {
      applyEditorBodyFontPreference({ choice: publishedBodyFont, customFamily: "" });
    }
    return () => {
      applyEditorBodyFontPreference();
    };
  }, [publishedBodyFont]);

  useEffect(() => {
    const previousTitle = document.title;
    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex,nofollow,noarchive";
    document.head.appendChild(robots);
    if (share) {
      document.title = withEnvironmentTitlePrefix(
        `${share.title?.trim() || t("common.untitledMemo")} · EdgeEver`,
        { development: import.meta.env.DEV, profile: __EDGEEVER_DEVELOPMENT_PROFILE__ },
      );
    } else if (passwordRequired) {
      document.title = withEnvironmentTitlePrefix(t("sharing.passwordRequiredTitle"), {
        development: import.meta.env.DEV,
        profile: __EDGEEVER_DEVELOPMENT_PROFILE__,
      });
    }
    return () => {
      document.title = previousTitle;
      robots.remove();
    };
  }, [passwordRequired, share, t]);

  if (shareQuery.isLoading) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-slate-50 text-slate-500">
        <LoaderCircle className="h-6 w-6 animate-spin" aria-label={t("sharing.publicLoading")} />
      </main>
    );
  }

  if (passwordRequired) {
    return <PublicSharePasswordForm token={token} onUnlocked={() => shareQuery.refetch()} />;
  }

  if (!share) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-slate-50 px-5">
        <section className="max-w-md rounded-2xl border border-slate-200 bg-card p-8 text-center shadow-sm">
          <FileText className="mx-auto h-9 w-9 text-slate-400" />
          <h1 className="mt-4 text-xl font-semibold text-slate-900">{t("sharing.publicUnavailable")}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">{t("sharing.publicUnavailableHint")}</p>
        </section>
      </main>
    );
  }

  const prose = resolveNoteProse(share.prose);
  return (
    <main className="edgeever-public-share min-h-[100dvh] bg-slate-50 px-4 py-6 sm:px-8 sm:py-10">
      <article className="mx-auto max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-card shadow-sm">
        <header className="border-b border-slate-200 px-5 py-6 sm:px-10 sm:py-8">
          <div className="mb-5 flex items-center justify-between gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5 font-semibold text-slate-700">
              <ShieldCheck className="h-4 w-4" /> EdgeEver · {t("sharing.readOnly")}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock3 className="h-4 w-4" />
              {t("sharing.publicUpdated", {
                time: new Intl.DateTimeFormat(i18n.resolvedLanguage || i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(share.updatedAt)),
              })}
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
            {share.title?.trim() || t("common.untitledMemo")}
          </h1>
          {share.tags.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {share.tags.map((tag) => <span key={tag} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">#{tag}</span>)}
            </div>
          ) : null}
        </header>
        <div
          className="edgeever-editor px-1 py-4 sm:px-4 sm:py-7"
          data-editor-theme="default"
          data-note-palette={prose.palette}
          style={noteProseCssVariables(prose) as CSSProperties}
        >
          {prose.customCss ? (
            <style dangerouslySetInnerHTML={{ __html: sanitizeAndScopeCss(prose.customCss) }} />
          ) : null}
          <SharedDocument
            locale={(i18n.resolvedLanguage || i18n.language || "zh-CN").startsWith("en") ? "en-US" : "zh-CN"}
            share={share}
            token={token}
          />
        </div>
      </article>
    </main>
  );
};
