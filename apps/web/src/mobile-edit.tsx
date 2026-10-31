import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { MobileStandaloneTiptapEditor } from "@/components/MobileStandaloneTiptapEditor";
import { initializeTheme } from "@/components/ThemeProvider";
import { applyEditorBodyFontPreference } from "@/lib/editor-body-font";
import { installEditorBodyFontFaces } from "@/lib/editor-body-font-faces";
import { applyUiFontPreference } from "@/lib/ui-font";
import { installPhoneImageFillStyle } from "@edgeever/shared/image-display";
import { bootstrapI18n } from "@/i18n";
import { errorScreenText as t } from "@/lib/error-screen-copy";
import "./styles/mobile-markdown-editor.css";
import "./styles/editor-body-fonts.css";

installPhoneImageFillStyle();

declare global {
  interface Window {
    edgeeverMobileEditorBootstrap?: {
      markMounted: () => void;
      showFailure: () => void;
    };
  }
}

type MobileEditorErrorBoundaryState = {
  failed: boolean;
};

const returnToPreviousPage = () => {
  if (window.history.length > 1) {
    window.history.back();
    return;
  }
  const params = new URLSearchParams(window.location.hash.slice(1));
  const returnTo = params.get("returnTo");
  window.location.replace(returnTo?.startsWith("/") ? returnTo : "/");
};

class MobileEditorErrorBoundary extends React.Component<React.PropsWithChildren, MobileEditorErrorBoundaryState> {
  override state: MobileEditorErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): MobileEditorErrorBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: Error) {
    console.error("Mobile editor crashed", error);
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="mobile-editor-fatal" role="alert">
        <section className="mobile-editor-fatal-card">
          <h1>{t("editorTitle")}</h1>
          <p>
            {t("editorBody")}
          </p>
          <div className="mobile-editor-fatal-actions">
            <button type="button" onClick={returnToPreviousPage}>
              {t("back")}
            </button>
            <button className="primary" type="button" onClick={() => window.location.reload()}>
              {t("retry")}
            </button>
          </div>
        </section>
      </main>
    );
  }
}

const root = document.getElementById("mobile-editor-root");

if (!root) {
  throw new Error("Mobile editor root not found");
}

initializeTheme();
installEditorBodyFontFaces();
applyEditorBodyFontPreference();
applyUiFontPreference();

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 15_000 } },
});

const MobileEditorApp = () => {
  React.useEffect(() => {
    window.edgeeverMobileEditorBootstrap?.markMounted();
  }, []);

  return (
    <MobileEditorErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <MobileStandaloneTiptapEditor />
      </QueryClientProvider>
    </MobileEditorErrorBoundary>
  );
};

void bootstrapI18n().then(() => {
  createRoot(root, {
    onUncaughtError(error, errorInfo) {
      console.error("Uncaught mobile editor error", error, errorInfo.componentStack);
    },
  }).render(
    <React.StrictMode>
      <MobileEditorApp />
    </React.StrictMode>
  );
});
