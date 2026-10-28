import { common, createLowlight } from "lowlight";

export const createCodeBlockLowlight = () => {
  const lowlight = createLowlight(common);

  return {
    ...lowlight,
    // TipTap calls highlightAuto for unregistered languages, including Mermaid
    // and our front-matter node. Guessing across every grammar blocks note
    // switching on the main thread. Keep their text and language untouched;
    // only omit syntax decorations when the language is not supported.
    highlightAuto: (value: string) => lowlight.highlight("plaintext", value),
  };
};
