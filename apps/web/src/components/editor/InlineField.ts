import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import {
  findInlineFields,
  formatInlineFieldChip,
  languageFromLocale,
  rangesOverlap,
  type InlineFieldLanguage,
} from "@/lib/inline-fields";

const INLINE_FIELD_PLUGIN_KEY = new PluginKey("edgeever-inline-field");

const collectInlineFieldDecorations = (state: EditorState, language: InlineFieldLanguage) => {
  const decorations: Decoration[] = [];
  const cursor = state.selection.from;
  state.doc.descendants((node, pos) => {
    if (node.type.spec.code) return false;
    if (!node.isText || !node.text) return;
    if (node.marks.some((mark) => mark.type.spec.code)) return;
    for (const field of findInlineFields(node.text)) {
      const from = pos + field.from;
      const to = pos + field.to;
      if (rangesOverlap(from, to, cursor) || rangesOverlap(from, to, state.selection.to)) continue;
      decorations.push(Decoration.inline(from, to, { class: "ee-inline-field-source" }));
      decorations.push(Decoration.widget(from, (view) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "ee-inline-field";
        chip.textContent = formatInlineFieldChip(field.key, field.value, language);
        chip.addEventListener("mousedown", (event) => {
          event.preventDefault();
          view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from + 1)));
          view.focus();
        });
        return chip;
      }, { side: -1, key: `${from}:${field.key}` }));
    }
  });
  return decorations.length ? DecorationSet.create(state.doc, decorations) : DecorationSet.empty;
};

export const createInlineFieldExtension = (locale: string) => Extension.create({
  name: "inlineField",
  addProseMirrorPlugins() {
    const language = languageFromLocale(locale);
    return [
      new Plugin({
        key: INLINE_FIELD_PLUGIN_KEY,
        props: {
          decorations: (state) => collectInlineFieldDecorations(state, language),
        },
      }),
    ];
  },
});
