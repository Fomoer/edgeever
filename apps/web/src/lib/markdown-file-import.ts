const MARKDOWN_FILE_EXTENSION_PATTERN = /\.(?:md|markdown)$/i;
const MAX_MEMO_TITLE_LENGTH = 160;

export const isMarkdownFile = (file: Pick<File, "name">) =>
  MARKDOWN_FILE_EXTENSION_PATTERN.test(file.name.trim());

export const getMarkdownFileTitle = (fileName: string) => {
  const title = fileName.trim().replace(MARKDOWN_FILE_EXTENSION_PATTERN, "").trim();
  return title.slice(0, MAX_MEMO_TITLE_LENGTH);
};

export const readMarkdownFile = async (file: Pick<File, "name" | "text">) => ({
  title: getMarkdownFileTitle(file.name),
  contentMarkdown: (await file.text()).replace(/^\uFEFF/, ""),
});
