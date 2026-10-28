import { describe, expect, test } from "bun:test";
import { createCodeBlockLowlight } from "./code-block-highlighting";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { EditorState } from "@tiptap/pm/state";
import { FRONT_MATTER_LANGUAGE } from "@edgeever/shared";

const textOf = (node) => node.type === "text" ? node.value : (node.children ?? []).map(textOf).join("");
const elementsOf = (node) => (node.type === "element" ? 1 : 0) + (node.children ?? []).reduce((n, child) => n + elementsOf(child), 0);

describe("editor code block highlighting", () => {
  test("unknown and render-only languages keep exact text without guessed syntax", () => {
    const lowlight = createCodeBlockLowlight();
    // JavaScript-looking content would receive decorations under auto detection.
    const source = 'const value = { name: "edgeever", count: 123 };\n'.repeat(200);
    for (const language of ["unknown-702", "mermaid", FRONT_MATTER_LANGUAGE]) {
      expect(lowlight.registered(language)).toBe(false);
      const tree = lowlight.highlightAuto(source);
      expect(textOf(tree)).toBe(source);
      expect(elementsOf(tree)).toBe(0);
    }
  });

  test("explicit languages and aliases retain syntax highlighting", () => {
    const lowlight = createCodeBlockLowlight();
    for (const language of ["javascript", "js"]) {
      const source = 'const value = "hello";';
      const tree = lowlight.highlight(language, source);
      expect(textOf(tree)).toBe(source);
      expect(elementsOf(tree)).toBeGreaterThan(0);
    }
    expect(lowlight.listLanguages()).toContain("yaml");
    expect(textOf(lowlight.highlightAuto(""))).toBe("");
  });
});

// Exercise the plugin initialization used by resetEditorDocument, rather than
// just the adapter: unsupported language attributes must survive loading.
test("document switching initializes decorations without guessing or changing content", () => {
  const editor = new Editor({ content: { type: "doc", content: [{ type: "paragraph" }] }, extensions: [
    StarterKit.configure({ codeBlock: false }),
    CodeBlockLowlight.configure({ lowlight: createCodeBlockLowlight(), defaultLanguage: "plaintext" }),
  ] });
  try {
    for (const language of ["mermaid", FRONT_MATTER_LANGUAGE, "unknown-702", "javascript"]) {
      const json = { type: "doc", content: [{ type: "codeBlock", attrs: { language }, content: [{ type: "text", text: 'const value = "hello";' }] }] };
      const state = EditorState.create({ schema: editor.schema, doc: editor.schema.nodeFromJSON(json), plugins: editor.extensionManager.plugins });
      expect(state.doc.toJSON()).toEqual(json);
      const decorations = state.plugins.flatMap(plugin => plugin.props.decorations?.(state)?.find() ?? []);
      if (language === "javascript") expect(decorations.length).toBeGreaterThan(0);
      else expect(decorations).toEqual([]);
    }
  } finally { editor.destroy(); }
});
