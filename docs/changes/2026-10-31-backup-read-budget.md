# Backup pagination read budget and network diagnostics

## Problem and scope

Backup pagination called the full snapshot-count query before and after every page. Its counts scan notes, revisions, resources, notebooks and prompts. A library with 4,199 notes needs 168 default pages; measured at approximately 16,420 rows per count query, those page checks alone require approximately 5.52 million row reads. This can exhaust D1's free daily read allowance and interrupt other database requests.

The API now reads only the workspace identity and transactional backup revision by primary key for each page check. Full counts remain in the snapshot endpoint used at export start and completion. Both page checks still run, including the check after page assembly. Protocol version 1, response fields, archive formats and migrations are unchanged, so installed clients benefit when the API is deployed. Cloudflare and self-hosted installations use the same route code.

Desktop request diagnostics now retain the request method, path without query parameters, elapsed time and up to eight underlying network error codes. Cause traversal is bounded and records only code-shaped strings, without arbitrary error messages, addresses, headers or stacks. This adds diagnostics without adding retries or changing restore writes.

## Risk and rollback

Backup consistency is the primary risk: an incorrect lightweight check could accept data changed during export. The existing transactionally updated revision and workspace identity remain authoritative; stale pages and changes during page assembly still return `backup_source_changed`. Reverting the code restores the previous behavior without a database migration.

## Validation

- The regression initially failed with 26 full count queries during pagination. It now confirms zero full counts while traversing all three data kinds, with counts retained in the initial and final snapshots. The real schema-upgrade fixture retains existing notes and legacy export callers.
- Concurrent revision and workspace-identity changes during page assembly both return HTTP 409. Existing workspace isolation, permissions, archive completeness, digest, cancellation and recovery tests pass.
- Backup API/manager/IPC/worker suites: 76 tests passed. Restore, JSON/ZIP64 and encrypted-container suites: 31 tests passed.
- Extracted the actual released v2.16.0 backup worker from the installed app, SHA-256 `2b7c074846f2cb37a30fd245cc460aca1af406266a6ac5ac306f249ee3c882a1`. On isolated databases, old-export/new-restore and new-export/old-restore both passed for plain and encrypted archives, including exact attachment-byte checks after shutting down the source server. Repeated these checks with the installed Electron 44.7 / Node 24.21 runtime.
- A real local HTTP socket reset now produces a request diagnostic containing its underlying transport code while preserving the original backup failure. This passed on both the normal Node test runtime and the installed Electron Node runtime. Manager tests verify diagnostic redaction.
- `bun run typecheck`, `bun run typecheck:mobile` and `bun run build:web` passed.

No production database scans were used to validate this fix. Live D1 row-read measurements after deployment and Windows/Linux native execution remain unverified. The fix does not replenish an already exhausted daily allowance, and the precise transport cause of the earlier historical failure remains unknown.
