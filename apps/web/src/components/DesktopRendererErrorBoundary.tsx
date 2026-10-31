import React, { type ErrorInfo, type ReactNode } from "react";
import { markRendererRecoveryRequired } from "@/lib/renderer-recovery";
import { reportDesktopRendererReadyAfterPaint } from "@/lib/desktop-renderer-ready";
import { errorScreenText as t } from "@/lib/error-screen-copy";

type RendererErrorDetails = {
  kind: "react-error";
  message: string;
  stack: string;
  componentStack: string;
};

type State = {
  error: RendererErrorDetails | null;
  reporting: boolean;
};

export class DesktopRendererErrorBoundary extends React.Component<{ children: ReactNode }, State> {
  override state: State = { error: null, reporting: false };

  static getDerivedStateFromError(error: unknown): Pick<State, "error"> {
    const normalized = error instanceof Error ? error : new Error(String(error));
    return {
      error: {
        kind: "react-error",
        message: normalized.message,
        stack: normalized.stack ?? "",
        componentStack: "",
      },
    };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    markRendererRecoveryRequired();
    const details: RendererErrorDetails = {
      kind: "react-error",
      message: error.message,
      stack: error.stack ?? "",
      componentStack: info.componentStack ?? "",
    };
    this.setState({ error: details });
    console.error("Caught React renderer error", error, info.componentStack);
    void window.edgeeverDesktop?.recordRendererError(details).catch(() => undefined);
    reportDesktopRendererReadyAfterPaint();
  }

  private report = async () => {
    const { error } = this.state;
    if (!error || !window.edgeeverDesktop) return;
    this.setState({ reporting: true });
    try {
      await window.edgeeverDesktop.openRendererIssue(error);
    } finally {
      this.setState({ reporting: false });
    }
  };

  override render() {
    if (!this.state.error) return this.props.children;
    const desktop = Boolean(window.edgeeverDesktop?.isAvailable);

    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-slate-900">
        <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-card p-6 shadow-sm" role="alert">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-rose-50 text-xl text-rose-700">!</div>
          <h1 className="text-lg font-semibold">{t("pageTitle")}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {desktop ? t("pageRecordedBody") : t("pageReloadBody")}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/20"
              type="button"
              onClick={() => window.location.reload()}
            >
              {t("reloadSafely")}
            </button>
            {desktop ? (
              <button
                className="rounded-lg border border-slate-300 bg-card px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/20"
                type="button"
                disabled={this.state.reporting}
                onClick={() => void this.report()}
              >
                {this.state.reporting ? t("opening") : t("reportToGithub")}
              </button>
            ) : null}
          </div>
        </section>
      </main>
    );
  }
}
