# Visual Diagram Notes Design

This document records the technical choices and design decisions behind EdgeEver visual diagram notes (mind maps, flowcharts, and architecture diagrams). It is a reference for future development, review, and cross-platform work.

## What IR means

IR stands for Intermediate Representation. It is the structured source of truth between user editing operations and a concrete rendering engine. It stores node and edge semantics, coordinates, and dimensions without binding the note to X6, Mermaid, or a platform UI.

```text
User operations → Diagram IR → X6 / Mermaid / exporters
```

This abstraction provides three immediate benefits:

- The same diagram can be rendered by different engines on different platforms.
- Visual, layout, or rendering-library changes do not require migrating the note's meaning.
- Data can be validated before rendering, rejecting dangling edges, invalid containment, and unsupported node types.

The persisted document uses `schemaVersion` to distinguish formats: `1` for mind maps and flowcharts, `2` for architecture diagrams, which add semantic components, system boundaries, connection types, and bidirectional relationships. The Markdown envelope comment is always `edgeever-diagram-v1` and does not change with `schemaVersion`.

MCP and the compile path use a separate semantic graph without coordinates. The server then generates sizes, coordinates, and edge identities into the persisted document. The agent protocol does not carry X6 or canvas state.

## IR and rendering-engine decoupling

One of the IR's central benefits is preserving EdgeEver's freedom to choose its underlying rendering engines. The IR answers “what does this diagram mean?”, while an adapter answers “how does this engine draw it?”:

```text
                   ┌→ X6 Adapter → Web / desktop editing; first-party viewing and public share
Diagram IR ────────┼→ Mermaid Adapter → portable envelope, rich-text embedded diagrams, IR-parse fallback
                   ├→ Export Adapter → SVG / PNG
                   └→ MCP Tools → AI reading and modification
```

This separation does not erase differences between engines. Node coordinates, dimensions, containment, and connection directions still carry layout meaning, and renderers may support different capabilities. Explicit adapters isolate those differences instead of pretending that all engines are equivalent.

The IR should contain stable business semantics and necessary layout facts, such as “this is a database,” “it belongs to the backend boundary,” and “a service accesses it through a data connection.” X6 SVG paths, internal events, view instances, and temporary selection state must stay out of the IR; otherwise engine coupling has merely moved into the persisted format.

## Current data model

The persisted IR is a `DiagramDocument` with `schemaVersion`, `kind` (`mind-map` / `flowchart` / `architecture`), optional `theme`, and, for mind maps, optional `structure`. A node contains `id`, `label`, `x`, `y`, `width`, `height`, and `shape`; optional `parentId` (mind-map topic hierarchy, or containment inside an architecture boundary) and `resourceIcon` (architecture resource appearance). An edge has required `id`, `source`, and `target`, with optional `label`, `kind`, and `bidirectional` fields.

A diagram is stored as portable Markdown. Its body contains a Mermaid fallback, while a trailing `edgeever-diagram-v1` comment carries the Base64URL-encoded JSON IR. The IR is the source of truth for lossless editing. The Mermaid fence is a projection, not the live canvas: first-party clients, including public share, parse the IR and draw with AntV X6. The fence remains so the note stays readable as ordinary Markdown outside EdgeEver, and when the IR comment fails to parse.

User-authored ` ```mermaid ` code blocks in ordinary rich-text notes are a separate product feature. They do not use this IR and are not visual-diagram notes.

Parsing and validation live in [`packages/shared/src/diagram.ts`](../packages/shared/src/diagram.ts). Semantic-graph compilation and automatic layout live in [`packages/shared/src/diagram-layout.ts`](../packages/shared/src/diagram-layout.ts). The read-only X6 adapter is [`packages/shared/src/diagram-view.ts`](../packages/shared/src/diagram-view.ts) (`diagramDocumentToX6Cells`), reused by Android, iOS, and public share. The Web / desktop editor consumes the same IR but has its own interactive node mapping.

## Why AntV X6

Visual diagram notes need an editable canvas: selection, dragging, zooming, connections, undo and redo, keyboard controls, automatic layout, and PNG/SVG export. AntV X6 supplies that canvas kernel; it is not the product model for any one diagram type. Mind maps, flowcharts, and architecture diagrams share the same engine. Their differences live in IR semantics and EdgeEver's node and edge customization.

The IR answers “what does this diagram mean?”; the X6 adapter answers “how do we draw it and let the user edit it?” X6 internals, coordinate conventions, and view instances therefore stay out of the persisted format. Adopting a second engine for one diagram type would also import another state manager, coordinate system, interaction model, and data format, leaving two canvases to maintain.

Android and iOS read-only viewers, and public share, reuse the same X6 adapter (`diagramDocumentToX6Cells` plus a non-interactive `Graph`). The Web / desktop editor uses the same IR and engine with an interactive mapping of its own. First-party canvases no longer split between X6 on Web and Mermaid on mobile. Mermaid remains the portable envelope, the renderer for embedded rich-text diagrams, and the fallback when IR parsing fails.

This does not mean rendering every node as the same X6 rectangle. X6 is only the underlying engine; icons, SVG markup, shapes, ports, colors, boundaries, and connection semantics are customized by EdgeEver per diagram type.

## Cross-platform rendering boundary

| Surface | Capability | Rendering path |
| --- | --- | --- |
| Web / PWA / desktop | Create, edit, auto-layout, revision history, and PNG/SVG export | IR → AntV X6 |
| Android app | Semantic read-only view with complete IR preservation | IR → AntV X6 (read-only Graph in the note WebView) |
| iOS app | Semantic read-only view with complete IR preservation | IR → AntV X6 (read-only Graph in WKWebView) |
| Public share of a visual diagram note | Read-only view of the same IR | IR → AntV X6 (read-only Graph) |
| Ordinary rich-text notes, including embedded ` ```mermaid ` blocks | Create, edit, share, HTML / print / WeChat copy | TipTap; Mermaid code blocks stay Mermaid |
| Invalid or unreadable IR comment | Degraded read of the same visual diagram note | Mermaid fence in the Markdown body |

The native apps currently hide regular rich-text editing, double-tap editing, and AI rewriting for visual diagram notes. Those paths cannot represent diagram IR and could overwrite a structured diagram with plain text. Users can read, sync, share, and inspect history in the apps, while editing remains available on Web and desktop.

An early mobile viewer used the Mermaid fence because AntV X6 was not yet wrapped in the native WebViews. That dual-track is historical. First-party canvases, including public share, render visual diagram notes from IR through X6. Embedded Mermaid diagrams in ordinary rich-text notes remain a separate feature and keep using the Mermaid renderer.

## Agreed design principles

- Diagram semantics belong to the IR; the rendering engine is not the data source.
- First-party canvases render visual diagram notes from IR through X6. Embedded ` ```mermaid ` blocks in ordinary rich-text notes stay on Mermaid. The persisted Mermaid fence on a visual diagram note is only a portable envelope and a degraded fallback, not the live canvas.
- Architecture components must communicate their purpose visually; names are supplementary.
- `parentId` is containment: topic hierarchy on a mind map, a system boundary on an architecture diagram. A system boundary is not a normal connectable business node.
- `theme` and a mind map's `structure` are presentation choices on the document, not engine-private state.
- Web and native apps consume the same persisted data rather than platform-specific diagram copies.
- New versions should keep old diagrams readable. Format evolution is managed through `schemaVersion`; the envelope comment stays `edgeever-diagram-v1`.
- Native apps remain read-only until a touch editor can safely read and write the same IR.

## MCP and AI-generated diagrams

For MCP and AI, the semantic graph is the stable tool protocol. An AI can work with it instead of producing X6 internals, SVG, or an entire Mermaid document. It can therefore perform a local request such as “add a Redis cache between the API and database” while preserving the user's other nodes and layout decisions.

There are three diagram MCP tools:

- `create_diagram_memo` accepts a semantic graph: node identities, labels, types, containment, and connections, plus optional `theme`, `structure`, and `layout.direction`. The server generates edge identities, node dimensions, coordinates, deterministic layout, and architecture boundary geometry, then compiles a persisted `DiagramDocument`. Layout direction is a compile hint and is not stored on the document. Results return the semantic graph, not the encoded persistence payload.
- `get_diagram` returns only the semantic graph and memo revision by default, without coordinates or dimensions; node geometry is included only when `includeLayout` is true.
- `update_diagram` accepts incremental operations on that one tool: `add_node`, `update_node`, `remove_node`, `add_edge`, `update_edge`, and `remove_edge`. It uses `expectedRevision` to prevent concurrent overwrites and supports `dryRun` previews. The default `reflow=preserve` keeps unaffected authored layout; `reflow=all` is only for an explicit full relayout. Moving a node into a boundary or changing mind-map hierarchy is `update_node` with `parentId`, not a separate MCP tool.

The generic `update_memo` tool cannot replace diagram content. There is no `replace_diagram_ir`, and no standalone validate or apply-layout tool: validation happens when the server applies operations, and layout is controlled by `reflow`.

The recommended flow is:

```text
get_diagram
  → AI produces incremental operations
  → optional dryRun preview
  → update_diagram (preserve layout by default)
  → server validates types, references, and containment, then writes a new revision
```

AI should modify semantics by default, with deterministic layout handling coordinates. Use `reflow=all` or change `theme` / `structure` only when the user explicitly wants a full relayout or a presentation change.

An IR can still become a liability if it mirrors X6 too closely, lacks useful semantics, changes versions frequently, or lets AI overwrite a whole diagram without validation. The schema should therefore remain small, stable, versioned, validated, and friendly to incremental operations.

## Future direction

Full native editing should continue to use the same IR and separately address touch selection, dragging, connections, zooming, keyboard avoidance, and large-diagram performance. Whether that editor uses X6 in a WebView or a native canvas should be decided through prototypes and performance testing without changing the persisted format.

HTML / print / WeChat copy of a visual diagram note still go through the generic rich-text pipeline when that pipeline is used, because those actions currently snapshot TipTap HTML rather than the X6 canvas. Native share-as-image has the same gap. Align those exports with a read-only X6 snapshot before considering any change to the Markdown envelope. PNG / SVG export from the diagram editor already comes from X6.
