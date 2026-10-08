# Visual Diagram Notes Design

EdgeEver has two graphic-note paths: mind maps, flowcharts, and architecture diagrams use `DiagramDocument`; infographics use AntV Infographic syntax. They are stored separately and are not converted automatically.

## Diagram notes

`DiagramDocument` is the source of truth for editable diagrams. It stores nodes, edges, necessary layout, and semantics rather than X6 view state. `kind` distinguishes `mind-map`, `flowchart`, and `architecture`; `schemaVersion` governs format changes. Architecture boundaries and connection types, along with mind-map hierarchy, are part of the document.

Web and desktop edit with AntV X6. Android, iOS, and public shares render the same IR read-only. A Base64URL-encoded IR lives in the persisted Markdown's `edgeever-diagram-v1` comment. The Mermaid diagram in the body supports reading outside EdgeEver and fallback when IR parsing fails; it is not the editing canvas. Mermaid code blocks in ordinary notes are a separate feature.

Web and desktop mind maps can switch between the canvas and a Markdown outline. The root topic is an `#` heading, with nested `-` list items for branches; each list level uses two spaces. Enter continues the list, Tab and Shift+Tab change hierarchy, and an existing indented outline can still be pasted. Empty list items are omitted from the diagram; nonempty descendants attach to the nearest nonempty ancestor. Both views edit the same `DiagramDocument` rather than the Mermaid fallback. The outline requires one nonempty root topic. Invalid hierarchy does not update the diagram, and removing many topics requires confirmation. Existing node and edge identities and metadata survive round trips; hierarchy changes trigger a relayout.

Parsing and validation live in [`diagram.ts`](../packages/shared/src/diagram.ts), semantic compilation and layout in [`diagram-layout.ts`](../packages/shared/src/diagram-layout.ts), and cross-platform read-only rendering in [`diagram-view.ts`](../packages/shared/src/diagram-view.ts). Native apps remain read-only until they can safely edit the same IR.

## Infographics

An infographic is a separate note type whose source is AntV Infographic's declarative syntax. The syntax directly holds its template, theme, and data. `InfographicDocument` stores it in an `edgeever-infographic-v1` comment; EdgeEver does not duplicate those fields in another generic IR. Each note type has its own parser.

Presenting a diagram note through Infographic would require an explicit `DiagramDocument → Infographic` conversion that identifies lost layout or interaction data. Existing notes should not be migrated until a bidirectional mapping is validated.

## AI and MCP

Diagram AI and MCP accept a coordinate-free semantic graph, which the server validates and lays out. `create_diagram_memo` creates a diagram note, `get_diagram` reads its semantic graph, and `update_diagram` applies incremental changes with `expectedRevision` to prevent overwrites. Its default `reflow=preserve` keeps existing layout; `reflow=all` is reserved for an explicitly requested full relayout. The generic `update_memo` does not directly replace diagram content.

Infographic AI selects an AntV template and generates matching data; people can refine text on the canvas. Each path retains its own source of truth instead of persisting a rendered result.
