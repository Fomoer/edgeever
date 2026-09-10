# Visual Diagram Notes Design

This document summarizes the product and technical decisions made while extending EdgeEver from mind maps and flowcharts to architecture diagrams. It serves as a reference for future development, review, and cross-platform work.

## Why architecture diagram notes exist

Mind maps express topic hierarchies, and flowcharts express steps and decisions. Complex systems also need to express component responsibilities, system boundaries, dependency directions, and data flows. An architecture diagram is therefore a distinct note type, not a flowchart whose nodes merely have different names.

A component should be recognizable from its appearance. EdgeEver currently distinguishes clients, frontends, services, databases, object storage, queues, security components, external services, and system boundaries with dedicated icons, outlines, and accent colors instead of one shared rectangle.

## What IR means

IR stands for Intermediate Representation. It is the structured source of truth between user editing operations and a concrete rendering engine. It stores node and edge semantics, coordinates, and dimensions without binding the note to X6, Mermaid, or a platform UI.

```text
User operations → Diagram IR → X6 / Mermaid / exporters
```

This abstraction provides three immediate benefits:

- The same diagram can be rendered by different engines on different platforms.
- Visual, layout, or rendering-library changes do not require migrating the note's meaning.
- Data can be validated before rendering, rejecting dangling edges, invalid containment, and unsupported node types.

The original mind-map and flowchart notes already use IR v1. Architecture diagrams use IR v2, adding semantic components, system boundaries, connection types, and bidirectional relationships.

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

A node contains `id`, `label`, `x`, `y`, `width`, `height`, and `shape`; a node inside a system boundary also has `parentId`. An edge contains `source` and `target`, with optional `label`, `kind`, and `bidirectional` fields.

A diagram is stored as portable Markdown. Its body contains a Mermaid fallback, while a trailing `edgeever-diagram-v1` comment carries the Base64URL-encoded JSON IR. The IR is the source of truth for lossless editing. The Mermaid fence is a projection, not the live canvas: first-party clients, including public share, parse the IR and draw with AntV X6. The fence remains so the note stays readable as ordinary Markdown outside EdgeEver, and when the IR comment fails to parse.

User-authored ` ```mermaid ` code blocks in ordinary rich-text notes are a separate product feature. They do not use this IR and are not visual-diagram notes.

IR parsing and validation live in [`packages/shared/src/diagram.ts`](../packages/shared/src/diagram.ts), so Web, Android, and iOS do not maintain competing interpretations of the format.

## Why EdgeEver continues to use AntV X6

EdgeEver already has selection, dragging, zooming, connections, undo and redo, keyboard controls, automatic layout, revision history, and PNG/SVG export built around AntV X6. Architecture diagrams need semantic modeling and custom visuals on top of that mature interaction layer, not another canvas core. Android and iOS now use the same X6 adapter for read-only viewing (`diagramDocumentToX6Cells` plus a non-interactive `Graph`), so first-party canvases no longer split between X6 on Web and Mermaid on mobile.

The reference project is most valuable for its product modeling and Typed IR ideas. Copying another drawing engine would also import its state management, coordinate system, interaction conventions, and data format, leaving EdgeEver with two canvas engines to maintain. Reusing X6 lets all three diagram types share infrastructure while development focuses on EdgeEver's own semantics and experience.

This does not mean rendering every component as the same X6 node. X6 is only the underlying engine; component icons, SVG markup, shapes, ports, colors, boundaries, and connection semantics are customized by EdgeEver.

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
- A system boundary is a containment relationship, not a normal connectable business node.
- Web and native apps consume the same persisted data rather than platform-specific diagram copies.
- New versions should keep old diagrams readable, with format evolution managed explicitly through `schemaVersion`.
- Native apps remain read-only until a touch editor can safely read and write the same IR.

## MCP and AI-generated diagrams

For MCP and AI, the IR is a positive capability and the foundation of a stable tool protocol. An AI can work with semantic IR instead of producing X6 internals, SVG, or an entire Mermaid document. It can therefore perform a local request such as “add a Redis cache between the API and database” while preserving the user's other nodes and layout decisions.

The `create_diagram_memo` MCP tool accepts this semantic creation IR: node identities, labels, semantic types, containment, and connections. EdgeEver generates edge identities, node dimensions, coordinates, deterministic layout, and architecture boundary geometry before compiling the result into the persisted `DiagramDocument`. An optional layout direction is a hint rather than authored geometry. Tool results likewise return only the semantic graph instead of the encoded persistence payload.

`get_diagram` returns only the semantic graph and memo revision by default, without coordinates or dimensions; node geometry is included only when `includeLayout` is explicitly set. `update_diagram` accepts incremental operations that add, update, or remove nodes and edges, uses `expectedRevision` to prevent concurrent overwrites, supports `dryRun` previews, and preserves unaffected authored layout by default. The generic `update_memo` tool cannot replace diagram content, preventing callers from bypassing diagram validation.

MCP exposes small, explicit operations for reading a diagram, adding or updating a node, connecting components, moving a node into a boundary, validating changes, and applying layout instead of a high-risk `replace_diagram_ir`. The recommended flow is:

```text
Read IR
  → AI produces incremental operations
  → server validates types, references, and containment
  → produce a change preview
  → user confirms
  → apply operations and deterministic layout
  → save a new revision
```

To reduce model context and accidental changes, the IR can evolve toward separate semantic, layout, and presentation concerns. AI should modify semantics by default, with deterministic layout algorithms handling coordinates. Layout or presentation should change only when the user explicitly requests it.

An IR can still become a liability if it mirrors X6 too closely, lacks useful semantics, changes versions frequently, or lets AI overwrite a whole diagram without validation. The schema should therefore remain small, stable, versioned, validated, and friendly to incremental operations.

## Future direction

Full native editing should continue to use the same IR and separately address touch selection, dragging, connections, zooming, keyboard avoidance, and large-diagram performance. Whether that editor uses X6 in a WebView or a native canvas should be decided through prototypes and performance testing without changing the persisted format.

HTML / print / WeChat copy of a visual diagram note still go through the generic rich-text pipeline when that pipeline is used, because those actions currently snapshot TipTap HTML rather than the X6 canvas. Align those exports with a read-only X6 snapshot before considering any change to the Markdown envelope.
