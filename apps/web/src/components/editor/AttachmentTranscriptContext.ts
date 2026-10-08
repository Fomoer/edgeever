import { createContext } from "react";
import type { AttachmentMenuTarget } from "./useEditorResourceActions";

export type AttachmentTranscript = {
  memoId: string;
  target: AttachmentMenuTarget;
  text: string;
  loading: boolean;
  completedSegments: number;
  error: string | null;
};

export type AttachmentTranscriptContextValue = {
  transcript: AttachmentTranscript | null;
  canInsert: boolean;
  onDismiss: () => void;
  onRetry: () => void;
  onInsert: () => void;
};

export const AttachmentTranscriptContext = createContext<AttachmentTranscriptContextValue | null>(null);
