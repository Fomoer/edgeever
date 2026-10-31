import React, { type ErrorInfo, type ReactNode } from "react";
import { errorScreenText as t } from "@/lib/error-screen-copy";

type Props = {
  children: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type State = { failed: boolean };

export class AiSidebarErrorBoundary extends React.Component<Props, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Caught AI sidebar error", error, info.componentStack);
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    if (!this.props.open) return null;
    return (
      <aside
        className="relative h-full w-[min(100vw,380px)] shrink-0 border-l border-slate-200 bg-card max-md:fixed max-md:inset-y-0 max-md:right-0 max-md:z-50"
        role="alert"
      >
        <div className="flex h-full flex-col items-start justify-center gap-3 p-6 text-slate-900">
          <h2 className="text-base font-semibold">{t("aiSidebarTitle")}</h2>
          <p className="text-sm text-slate-600">
            {t("aiSidebarBody")}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
              onClick={() => this.setState({ failed: false })}
            >
              {t("retrySidebar")}
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50"
              onClick={() => this.props.onOpenChange(false)}
            >
              {t("close")}
            </button>
          </div>
        </div>
      </aside>
    );
  }
}
