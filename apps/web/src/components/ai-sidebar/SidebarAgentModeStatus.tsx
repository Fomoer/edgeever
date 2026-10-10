import { useEffect, useState } from "react";
import { AI_SIDEBAR_SELECTION_EVENT, readAiSidebarAdapter, readAiSidebarSource, type AiSidebarSource } from "@/lib/desktop-acp";
import { AiAgentSelector } from "./AiAgentSelector";

export function SidebarAgentModeStatus({ disabled, onPendingChange }: { disabled: boolean; onPendingChange: (pending: boolean) => void }) {
  const [source, setSource] = useState<AiSidebarSource>(readAiSidebarSource);
  const [adapterId, setAdapterId] = useState(() => readAiSidebarAdapter()?.id ?? null);

  useEffect(() => {
    const sync = () => {
      setSource(readAiSidebarSource());
      setAdapterId(readAiSidebarAdapter()?.id ?? null);
    };
    sync();
    window.addEventListener("focus", sync);
    window.addEventListener("storage", sync);
    window.addEventListener(AI_SIDEBAR_SELECTION_EVENT, sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.removeEventListener("focus", sync);
      window.removeEventListener("storage", sync);
      window.removeEventListener(AI_SIDEBAR_SELECTION_EVENT, sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  return <AiAgentSelector noteContext source={source} adapterId={adapterId} disabled={disabled} onPendingChange={onPendingChange} />;
}
