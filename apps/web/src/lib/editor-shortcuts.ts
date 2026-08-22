export const saveAndSyncEditor = async ({
  hasUnsavedChanges,
  save,
  sync,
}: {
  hasUnsavedChanges: boolean;
  save: () => Promise<unknown>;
  sync: () => Promise<unknown>;
}) => {
  if (hasUnsavedChanges) {
    await save();
  }

  await sync();
};

export const getAiSlashCommandStart = ({
  caretPosition,
  insertedText,
  textBefore,
}: {
  caretPosition: number;
  insertedText: string;
  textBefore: string;
}) => {
  if (insertedText.toLowerCase() !== "i" || !/(?:^|\s)\/a$/i.test(textBefore)) {
    return null;
  }

  return caretPosition - 2;
};

export const shouldOpenAiFromSpace = ({
  altKey,
  ctrlKey,
  isComposing,
  isEmptyParagraph,
  key,
  keyCode,
  metaKey,
  repeat,
  selectionEmpty,
  shiftKey,
}: {
  altKey: boolean;
  ctrlKey: boolean;
  isComposing: boolean;
  isEmptyParagraph: boolean;
  key: string;
  keyCode: number;
  metaKey: boolean;
  repeat: boolean;
  selectionEmpty: boolean;
  shiftKey: boolean;
}) => key === " "
  && !altKey
  && !ctrlKey
  && !metaKey
  && !shiftKey
  && !repeat
  && !isComposing
  && keyCode !== 229
  && selectionEmpty
  && isEmptyParagraph;
