# Count-query audit

## Scope and changes

Reviewed API aggregate queries and their Web, Android, iOS, and desktop consumers after the backup read-budget fix. The target is repeated full-set counting on pagination or polling, and counting solely to test existence. Exact statistics and concurrency guards remain explicit.

| Path | Previous behavior | Change |
| --- | --- | --- |
| Sync bootstrap | Recounted all notes and aggregated notebooks on every page | Updated clients request metadata only on the first page; continuation pages preserve the snapshot cursor and identity. |
| Legacy JSON / Markdown export | Recounted the export set on every page | First-page count retained for progress; continuation uses one lookahead row, without loading its resources or revisions. |
| Memo feeds and search | Counted all matches for subsequent pages and bounded suggestions | Optional count; feed counts on its first page, note-link and companion suggestions skip it. Remote opaque pagination cursors are preserved. |
| Notebook deletion preflight | Counted all active notes just to reject nonempty deletion | Indexed existence query with `LIMIT 1`; atomic tree-deletion guards remain. |
| Task history polling | Counted all retained runs every 15 seconds; retention cleanup lacked a workspace/time index | Migration `0084` backfills workspace/task counters and maintains them with transactional triggers; polling reads exact totals by primary key. Added an index for retention and history ordering. |

Default API responses still include totals and bootstrap metadata for older clients. New clients tolerate old servers returning metadata on every page. Plugin note queries continue to require exact totals. Optional totals do not overwrite the initial progress estimate or produce invalid cache counts.

## Aggregates retained

- Explicit workspace, storage, user, tag, and notebook statistics, plus initial/final backup snapshot counts: consumers need these exact results.
- Bounded capacity and quota guards for companion memories/actions/turns, extensions, public-form submissions, and poster rendering: counts enforce limits and some participate in atomic writes.
- Empty-trash result counts and recursive notebook-tree counts: these report affected records or protect concurrent deletion.
- Local SQLite counts: these do not consume D1 reads, and their consumers still require totals. This change does not replace all aggregates with persisted counters.

## Risk and rollback

Pagination changes can lose records or progress if continuation contracts drift. Regression tests cover page termination, lookahead exclusion, resources, selection exports, search, and opaque cursors.

Task counters change stored schema. Migration `0084` builds an index and performs a one-time backfill, which consumes database reads/writes. Trigger tests compare persisted totals with actual counts after insertion, ignored duplicate claims, updates, task/workspace moves, cascades, deletion, and transaction rollback. Normal history reads do not prepare a `COUNT` query. Rare parent-identity changes recompute affected counters.

Code can be rolled back to the previous count queries while leaving the additive columns, index, and triggers in place. Do not edit or remove an already-applied migration. No production migration, deployment, or production load test was performed for this audit.

## Verification

- Required TypeScript checks for Web/API and Android, and Web production build.
- Full project tests, Rust unit tests, freshly built desktop sidecar tests, and plugin sync integration.
- Actual v2.16.0 bootstrap route versus the current route on isolated migrated SQLite; actual old/current Swift DTOs decode the corresponding responses.
- Actual v2.16.0 task writer on the old schema, followed by migration `0084` and writes/reads through both old and current routes: exact totals preserved.
- iOS simulator-target build-for-testing and native Swift decoding checks. No iOS device/UI execution or Android USB-device validation; no production performance measurements.
