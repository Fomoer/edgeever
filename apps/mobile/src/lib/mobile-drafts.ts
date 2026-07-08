import AsyncStorage from "@react-native-async-storage/async-storage";

const MOBILE_DRAFT_PREFIX = "edgeever.mobile.memoDraft:";

export type MobileMemoDraft = {
  memoId: string;
  expectedRevision: number;
  title: string;
  contentMarkdown: string;
  notebookId: string;
  tagsText: string;
  updatedAt: string;
};

export const readMobileMemoDraft = async (memoId: string): Promise<MobileMemoDraft | null> => {
  const rawValue = await AsyncStorage.getItem(getMobileMemoDraftKey(memoId));

  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue);
    return isMobileMemoDraft(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export const writeMobileMemoDraft = (draft: MobileMemoDraft) => AsyncStorage.setItem(getMobileMemoDraftKey(draft.memoId), JSON.stringify(draft));

export const clearMobileMemoDraft = (memoId: string) => AsyncStorage.removeItem(getMobileMemoDraftKey(memoId));

const getMobileMemoDraftKey = (memoId: string) => `${MOBILE_DRAFT_PREFIX}${memoId}`;

const isMobileMemoDraft = (value: unknown): value is MobileMemoDraft => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const draft = value as Partial<MobileMemoDraft>;
  return (
    typeof draft.memoId === "string" &&
    typeof draft.expectedRevision === "number" &&
    typeof draft.title === "string" &&
    typeof draft.contentMarkdown === "string" &&
    typeof draft.notebookId === "string" &&
    typeof draft.tagsText === "string" &&
    typeof draft.updatedAt === "string"
  );
};
