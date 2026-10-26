import { iconNames } from "lucide-react/dynamic";
import { NOTEBOOK_ICONS } from "@edgeever/shared";

// Keep the existing bilingual keywords; add every icon from the installed library.
const keywords = new Map<string, string>(
  NOTEBOOK_ICONS.map((icon) => [icon.id, icon.keywords]),
);
export const notebookIconNames = [...iconNames].sort();

export const searchAvailableNotebookIcons = (query: string) => {
  const words = query
    .trim()
    .toLocaleLowerCase()
    .split(/[\s-]+/)
    .filter(Boolean);
  return notebookIconNames
    .filter((id) =>
      words.every((word) =>
        `${id.replaceAll("-", " ")} ${keywords.get(id) ?? ""}`.includes(word),
      ),
    )
    .map((id) => ({ id }));
};
