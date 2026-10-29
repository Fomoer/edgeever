import { NodeSelection, Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { closeHistory } from "@tiptap/pm/history";
import type { EditorView } from "@tiptap/pm/view";
import { IMAGE_GALLERY_NODE_TYPE } from "@edgeever/shared";
import { imageSelectionKey } from "./image-selection";

export const imageDragKey = new PluginKey<number | null>("imageDrag");

/** Move the original node, preserving resource references and every attribute. */
export function moveImage(state: EditorState, from: number, target: number) {
  if (from < 0 || from >= state.doc.content.size) return null;
  const image = state.doc.nodeAt(from);
  if (image?.type.name !== "image" || target < 0 || target > state.doc.content.size) return null;
  if (target >= from && target <= from + image.nodeSize) return null;

  const $from = state.doc.resolve(from);
  const tr = closeHistory(state.tr);
  // Deleting a gallery's last child alone would cause schema filling to create
  // an empty image. Remove its container in the same transaction instead.
  if ($from.parent.type.name === IMAGE_GALLERY_NODE_TYPE && $from.parent.childCount === 1) {
    tr.delete($from.before(), $from.after());
  } else {
    tr.delete(from, from + image.nodeSize);
  }
  const position = tr.mapping.map(target);
  const $target = tr.doc.resolve(position);
  if (!$target.parent.canReplaceWith($target.index(), $target.index(), image.type)) return null;
  tr.insert(position, image);
  tr.setSelection(NodeSelection.create(tr.doc, position));
  return tr.setMeta(imageSelectionKey, null).setMeta(imageDragKey, null).scrollIntoView();
}

type DropTarget = { position: number; left: number; top: number; width: number; height: number };

function imagePosition(view: EditorView, element: Element) {
  const figure = element.closest(".edgeever-image-node");
  if (!figure || !view.dom.contains(figure)) return null;
  const position = view.posAtDOM(figure, 0);
  return view.state.doc.nodeAt(position)?.type.name === "image" ? { figure, position } : null;
}

function dropTarget(view: EditorView, event: DragEvent): DropTarget | null {
  const element = event.target instanceof Element ? event.target : null;
  let hit = element && imagePosition(view, element);
  // Grid gaps belong to the nearest image, rather than the gallery container.
  const galleryElement = element?.closest("[data-edgeever-image-gallery]");
  if (!hit && galleryElement && view.dom.contains(galleryElement)) {
    let distance = Infinity;
    for (const figure of galleryElement.querySelectorAll(".edgeever-image-node")) {
      const rect = figure.getBoundingClientRect();
      const dx = Math.max(rect.left - event.clientX, 0, event.clientX - rect.right);
      const dy = Math.max(rect.top - event.clientY, 0, event.clientY - rect.bottom);
      const candidateDistance = dx * dx + dy * dy;
      if (candidateDistance < distance) {
        distance = candidateDistance;
        hit = imagePosition(view, figure);
      }
    }
  }
  if (hit) {
    const rect = hit.figure.getBoundingClientRect();
    const gallery = hit.figure.closest("[data-edgeever-image-gallery]");
    // A one-column gallery uses top/bottom edges; a grid uses left/right edges.
    const horizontal = gallery && Array.from(gallery.querySelectorAll(".edgeever-image-node")).some((sibling) => {
      const other = sibling.getBoundingClientRect();
      return Math.abs(other.left - rect.left) > 1 && other.top < rect.bottom && other.bottom > rect.top;
    });
    const after = horizontal ? event.clientX > rect.left + rect.width / 2 : event.clientY > rect.top + rect.height / 2;
    return {
      position: hit.position + (after ? 1 : 0),
      left: horizontal ? (after ? rect.right : rect.left) : rect.left,
      top: horizontal ? rect.top : (after ? rect.bottom : rect.top),
      width: horizontal ? 3 : rect.width,
      height: horizontal ? rect.height : 3,
    };
  }

  const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
  if (!coords) return null;
  const $pos = view.state.doc.resolve(coords.pos);
  const imageType = view.state.schema.nodes.image;
  // Snap to block boundaries instead of splitting the paragraph under the mouse.
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const before = $pos.before(depth);
    const parent = view.state.doc.resolve(before);
    if (!parent.parent.canReplaceWith(parent.index(), parent.index(), imageType)) continue;
    const dom = view.nodeDOM(before);
    if (!(dom instanceof HTMLElement)) continue;
    const rect = dom.getBoundingClientRect();
    const after = event.clientY > rect.top + rect.height / 2;
    return { position: after ? $pos.after(depth) : before, left: rect.left, top: after ? rect.bottom : rect.top, width: rect.width, height: 3 };
  }
  if ($pos.parent.canReplaceWith($pos.index(), $pos.index(), imageType)) {
    const rect = view.dom.getBoundingClientRect();
    const caret = view.coordsAtPos(coords.pos);
    return { position: coords.pos, left: rect.left, top: caret.top, width: rect.width, height: 3 };
  }
  return null;
}

export function createImageDragPlugin() {
  let marker: HTMLDivElement | null = null;
  const clearMarker = () => { marker?.remove(); marker = null; };
  const reset = (view: EditorView) => {
    clearMarker();
    if (imageDragKey.getState(view.state) !== null) view.dispatch(view.state.tr.setMeta(imageDragKey, null));
  };
  return new Plugin<number | null>({
    key: imageDragKey,
    state: {
      init: () => null,
      apply(tr, previous) {
        const requested = tr.getMeta(imageDragKey) as number | null | undefined;
        if (requested !== undefined) return requested;
        if (previous === null) return null;
        const mapped = tr.mapping.mapResult(previous);
        return mapped.deleted || tr.doc.nodeAt(mapped.pos)?.type.name !== "image" ? null : mapped.pos;
      },
    },
    props: {
      handleDOMEvents: {
        dragstart(view, event) {
          if (!view.editable || !(event.target instanceof Element)) return false;
          const hit = imagePosition(view, event.target);
          if (!hit || !event.target.closest("[data-drag-handle]")) return false;
          view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, hit.position))
            .setMeta(imageDragKey, hit.position).setMeta(imageSelectionKey, null));
          return false; // Let ProseMirror serialize the node and start its internal drag.
        },
        dragover(view, event) {
          const from = imageDragKey.getState(view.state);
          if (!view.editable || from == null || !view.dragging) { clearMarker(); return false; }
          const target = dropTarget(view, event);
          if (!target || !moveImage(view.state, from, target.position)) { clearMarker(); return false; }
          event.preventDefault();
          if (!marker) {
            marker = view.dom.ownerDocument.createElement("div");
            marker.className = "edgeever-image-drop-indicator";
            marker.setAttribute("aria-hidden", "true");
            view.dom.ownerDocument.body.appendChild(marker);
          }
          Object.assign(marker.style, { left: `${target.left}px`, top: `${target.top}px`, width: `${target.width}px`, height: `${target.height}px` });
          return true;
        },
        dragleave(view, event) {
          if (!(event.relatedTarget instanceof globalThis.Node) || !view.dom.contains(event.relatedTarget)) clearMarker();
          return false;
        },
        dragend(view) { reset(view); return false; },
        drop() { clearMarker(); return false; },
      },
      handleDrop(view, event, _slice, moved) {
        const from = imageDragKey.getState(view.state);
        if (!view.editable || from == null || !view.dragging) return false;
        if (!moved) { reset(view); return false; } // Preserve the editor's modifier-key copy gesture.
        const target = dropTarget(view, event);
        const transaction = target && moveImage(view.state, from, target.position);
        if (transaction) {
          view.dispatch(transaction);
          // Keep the drag separate from subsequent typing in the undo history.
          view.dispatch(closeHistory(view.state.tr));
          view.focus();
        } else reset(view);
        return true; // Invalid/self drops must never fall through to insert a copy.
      },
    },
    view(view) {
      const clear = () => clearMarker();
      view.dom.ownerDocument.addEventListener("drop", clear);
      view.dom.ownerDocument.addEventListener("dragend", clear);
      return {
        update(next) { if (imageDragKey.getState(next.state) == null || !next.editable) clearMarker(); },
        destroy() {
          clearMarker();
          view.dom.ownerDocument.removeEventListener("drop", clear);
          view.dom.ownerDocument.removeEventListener("dragend", clear);
        },
      };
    },
  });
}
