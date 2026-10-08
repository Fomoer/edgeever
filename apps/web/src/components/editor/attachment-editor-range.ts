import type { Editor } from "@tiptap/core";
import { Fragment, type Mark, type Node as PMNode } from "@tiptap/pm/model";
import {
  FILE_ATTACHMENT_NODE_TYPE,
  PDF_ATTACHMENT_NODE_TYPE,
  getResourceIdFromUrl,
  resourceUrlsReferToSameAttachment,
} from "@edgeever/shared";

const ATTACHMENT_NODE_TYPES = new Set<string>([FILE_ATTACHMENT_NODE_TYPE, PDF_ATTACHMENT_NODE_TYPE]);

export type AttachmentRangeTarget = {
  url: string;
  resourceId?: string | null;
};

export type AttachmentLinkRange = {
  kind: "link";
  from: number;
  to: number;
  marks: readonly Mark[];
};

export type AttachmentNodeRange = {
  kind: "node";
  from: number;
  to: number;
  node: PMNode;
};

export type AttachmentRange = AttachmentLinkRange | AttachmentNodeRange;

export const attachmentCandidateMatches = (candidateUrl: string, target: AttachmentRangeTarget) => {
  if (resourceUrlsReferToSameAttachment(candidateUrl, target.url)) return true;
  return Boolean(target.resourceId && getResourceIdFromUrl(candidateUrl) === target.resourceId);
};

const expandStandaloneParagraphRange = (editor: Editor, from: number, to: number) => {
  const resolved = editor.state.doc.resolve(from);
  for (let depth = resolved.depth; depth > 0; depth -= 1) {
    const node = resolved.node(depth);
    if (node.type.name !== "paragraph") continue;
    const nodeFrom = resolved.before(depth);
    if (from === nodeFrom + 1 && to === nodeFrom + node.nodeSize - 1) {
      return { from: nodeFrom, to: nodeFrom + node.nodeSize };
    }
    break;
  }
  return { from, to };
};

export const findAttachmentRange = (
  editor: Editor,
  target: AttachmentRangeTarget,
): AttachmentRange | null => {
  let linkFrom: number | null = null;
  let linkTo: number | null = null;
  let marks: readonly Mark[] = [];
  let nodeRange: AttachmentNodeRange | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (nodeRange) return false;
    if (ATTACHMENT_NODE_TYPES.has(node.type.name)) {
      const url = typeof node.attrs.url === "string" ? node.attrs.url : "";
      if (!attachmentCandidateMatches(url, target)) return;
      nodeRange = { kind: "node", from: pos, to: pos + node.nodeSize, node };
      return false;
    }
    if (!node.isText || !node.text) return;
    const linkMark = node.marks.find((mark) =>
      mark.type.name === "link"
      && typeof mark.attrs.href === "string"
      && attachmentCandidateMatches(mark.attrs.href, target)
    );
    if (!linkMark) return;
    linkFrom = linkFrom === null ? pos : Math.min(linkFrom, pos);
    linkTo = linkTo === null ? pos + node.nodeSize : Math.max(linkTo, pos + node.nodeSize);
    marks = node.marks;
  });

  if (nodeRange) return nodeRange;
  if (linkFrom === null || linkTo === null) return null;
  return { kind: "link", from: linkFrom, to: linkTo, marks };
};

const dispatchDeleteRange = (editor: Editor, from: number, to: number) => {
  const tr = editor.state.tr.delete(from, to);
  if (tr.doc.childCount === 0 && editor.schema.nodes.paragraph) {
    tr.insert(0, editor.schema.nodes.paragraph.create());
  }
  editor.view.dispatch(tr);
};

export const removeAttachmentAt = (editor: Editor, target: AttachmentRangeTarget) => {
  const range = findAttachmentRange(editor, target);
  if (!range) return false;
  const next = expandStandaloneParagraphRange(editor, range.from, range.to);
  dispatchDeleteRange(editor, next.from, next.to);
  return true;
};

export const renameAttachmentAt = (
  editor: Editor,
  target: AttachmentRangeTarget,
  filename: string,
  label: string,
) => {
  const range = findAttachmentRange(editor, target);
  if (!range) return false;
  if (range.kind === "node") {
    editor.view.dispatch(editor.state.tr.setNodeMarkup(range.from, undefined, {
      ...range.node.attrs,
      filename,
      label,
    }));
    return true;
  }
  editor.view.dispatch(
    editor.state.tr.replaceWith(
      range.from,
      range.to,
      editor.schema.text(label, [...range.marks]),
    ),
  );
  return true;
};

export const insertTranscriptAfterAttachment = (
  editor: Editor,
  target: AttachmentRangeTarget,
  text: string,
  title: string,
  anchorElement?: HTMLElement,
) => {
  const paragraphs = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (!paragraphs.length) return false;

  let range = findAttachmentRange(editor, target);
  const wrapper = anchorElement?.closest(".edgeever-file-attachment-node");
  if (wrapper && editor.view.dom.contains(wrapper)) {
    try {
      const pos = editor.view.posAtDOM(wrapper, 0);
      const node = editor.state.doc.nodeAt(pos);
      if (node && ATTACHMENT_NODE_TYPES.has(node.type.name)
        && attachmentCandidateMatches(String(node.attrs.url || ""), target)) {
        range = { kind: "node", from: pos, to: pos + node.nodeSize, node };
      }
    } catch {
      // A replaced node view can lose its DOM position while transcription runs.
    }
  }
  if (!range) return false;

  const $attachment = editor.state.doc.resolve(range.from);
  let depth = $attachment.depth;
  while (depth > 0 && !$attachment.node(depth).isTextblock) depth -= 1;
  const insertionPos = depth > 0 ? $attachment.after(depth) : editor.state.doc.content.size;
  const paragraphType = editor.schema.nodes.paragraph;
  if (!paragraphType) return false;
  const headingType = editor.schema.nodes.heading;
  const heading = headingType
    ? headingType.create({ level: 2 }, editor.schema.text(title))
    : paragraphType.create(null, editor.schema.text(title));
  const nodes = [heading, ...paragraphs.map((line) => paragraphType.create(null, editor.schema.text(line)))];
  editor.view.dispatch(editor.state.tr.insert(insertionPos, Fragment.fromArray(nodes)));
  return true;
};
