# Preserve infographic drafts during synchronization

## Findings and scope

- The infographic editor accepted every memo prop as its next save base without reconciling the displayed document. A remote update could remain invisible, then authorize uploading an older graphic with the remote revision/hash.
- The workspace keyed the editor by the raw memo ID. A temporary-to-server ID mapping recreated the editor and discarded input still waiting for autosave. Both the idle remote-refresh failure and the title reset were reproduced in browser regressions before the fix.
- Local saves already captured their submitted snapshot. Retain that behavior; a delayed receipt must never confirm later edits or replace a successor already saved locally.

## Change and risk

- Reuse the existing logical editor identity helpers. Real note switches reset the editor; ID mappings preserve its input, focus, conversation and canvas.
- Separate saved snapshots from synchronization metadata. This device's receipts advance only revision/hash/time. Stale or unrelated snapshots are ignored. Genuine remote updates apply when idle; drafts, generation and active inline editing defer them without adopting the remote concurrency base.
- Returning to the original baseline releases a deferred update. Saving a conflicting draft locally does not release it or silently authorize an overwrite.
- Bind async local-save completion to its mounted editor. Preserve newer acknowledged revisions and confirm only the submitted snapshot. Track active inline editing before its text is committed by AntV.
- Changes are limited to the shared Web/desktop infographic editor and its workspace mounting. No schema, synchronization protocol, native host, installer or updater changes. Roll back these product changes to revert; no migration is needed.

## Verification boundaries

- Focused unit coverage includes stale receipts, locally saved successors, real remote changes, conversation/session snapshots and tag normalization.
- Browser regressions use real local API/storage: delayed receipts with title/tag/inline edits and reopening; idle remote updates and conflicting drafts; temporary-ID mapping, focus and reopening; a locally queued successor receiving an older receipt.
- Existing text and diagram synchronization regressions are also run. Required checks: `bun run typecheck`, `bun run typecheck:mobile`, `bun run build:web`.
- Browser checks do not establish Windows/macOS/Linux native functionality, a native old-to-new-version transition, or installer/updater compatibility. Those native validations remain unperformed for this change.
