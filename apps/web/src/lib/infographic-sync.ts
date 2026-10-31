import { parseInfographicDocument, type InfographicDocument, type MemoDetail } from "@edgeever/shared";
import { shouldAcceptRemoteMemoDetail } from "./memo-detail-freshness";

export const infographicEditorSnapshot = (title: string, document: InfographicDocument, tags: string[]) =>
  JSON.stringify([title, document.syntax, document.history ?? [], [...tags].sort(), document.activeSessionId ?? null]);

export const infographicMemoSnapshot = (memo: MemoDetail) => {
  const document = parseInfographicDocument(memo.contentMarkdown);
  return document ? infographicEditorSnapshot(memo.title ?? "", document, memo.tags) : null;
};

/** A receipt updates concurrency metadata only; the editor owns its current draft. */
export const advanceInfographicSyncBase = (base: MemoDetail, receipt: MemoDetail): MemoDetail =>
  receipt.id === base.id && shouldAcceptRemoteMemoDetail(base, receipt)
    ? { ...base, revision: receipt.revision, contentHash: receipt.contentHash, updatedAt: receipt.updatedAt }
    : base;

export const classifyInfographicUpdate = (
  incoming: MemoDetail,
  base: MemoDetail,
  savedSnapshot: string,
  hasDraft: boolean,
  saving: boolean,
  acknowledged?: MemoDetail | null,
) => {
  if (incoming.id !== base.id || !shouldAcceptRemoteMemoDetail(base, incoming)) return "ignore";
  if (saving) return "defer";
  const incomingSnapshot = infographicMemoSnapshot(incoming);
  if (incomingSnapshot === null) return "ignore";
  // A receipt can arrive after a successor draft was already saved locally.
  // It still confirms only its own snapshot, even though that draft is clean.
  if (acknowledged && incoming.revision === acknowledged.revision && incoming.contentHash === acknowledged.contentHash
    && incomingSnapshot === infographicMemoSnapshot(acknowledged)) return "rebase";
  if (incomingSnapshot === savedSnapshot) return "rebase";
  return hasDraft ? "defer" : "replace";
};
