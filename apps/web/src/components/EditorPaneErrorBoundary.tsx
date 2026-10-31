import React, { type ErrorInfo, type ReactNode } from "react";
import { errorScreenText as t } from "@/lib/error-screen-copy";
import { clearRendererRecoveryRequired, markRendererRecoveryRequired } from "@/lib/renderer-recovery";

type Props = {
  children: ReactNode;
  resetKey: string | null;
  onBackToList: () => void;
};

type State = {
  error: Error | null;
};


export class EditorPaneErrorBoundary extends React.Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    markRendererRecoveryRequired();
    const details = {
      kind: "react-error" as const,
      message: error.message,
      stack: error.stack ?? "",
      componentStack: info.componentStack ?? "",
    };
    console.error("Caught note editor error", error, info.componentStack);
    void window.edgeeverDesktop?.recordRendererError(details).catch(() => undefined);
  }

  override componentDidUpdate(previousProps: Props) {
    if (this.state.error && previousProps.resetKey !== this.props.resetKey) {
      clearRendererRecoveryRequired();
      this.setState({ error: null });
    }
  }

  private retry = () => {
    clearRendererRecoveryRequired();
    this.setState({ error: null });
  };

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="flex h-full min-h-0 items-center justify-center bg-workspace-canvas p-6 text-slate-900">
        <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-card p-6 shadow-sm" role="alert">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-amber-50 text-xl text-amber-700">!</div>
          <h1 className="text-lg font-semibold">{t("noteTitle")}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {t("noteBody")}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/20"
              type="button"
              onClick={this.props.onBackToList}
            >
              {t("backToNoteList")}
            </button>
            <button
              className="rounded-lg border border-slate-300 bg-card px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/20"
              type="button"
              onClick={this.retry}
            >
              {t("retryNote")}
            </button>
          </div>
        </section>
      </main>
    );
  }
}

export const EditorRecoveryPane = () => {
  return (
    <main className="flex h-full min-h-0 items-center justify-center bg-workspace-canvas p-6 text-slate-900">
      <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-card p-6 shadow-sm" role="status">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-xl text-slate-800">✓</div>
        <h1 className="text-lg font-semibold">{t("safeModeTitle")}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {t("safeModeBody")}
        </p>
      </section>
    </main>
  );
};
