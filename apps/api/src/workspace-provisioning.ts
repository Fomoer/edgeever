import {
  DEFAULT_AI_PROMPT_SEEDS,
  defaultAiPromptId,
} from "@edgeever/shared/ai-prompt-seeds";
import {
  DEFAULT_NOTEBOOK_SEEDS,
  WELCOME_MEMO_ID,
  WELCOME_MEMO_REPAIRED_CONTENT_HASH,
  WELCOME_MEMO_SEED_CONTENT_HASH,
  WELCOME_MEMO_SEED_TITLE,
  buildWelcomeMemoContent,
  localizeDefaultNotebookName,
} from "@edgeever/shared/default-workspace-seeds";
import {
  DEFAULT_MEMO_TEMPLATE_SEEDS,
  defaultMemoTemplateId,
  localizeMemoTemplateSeed,
} from "@edgeever/shared/memo-template-seeds";
import { createId, isoNow } from "./entity-utils";
import { markWorkspaceExampleSeedPendingStatement } from "./workspace-example-seed";
import { sha256 } from "./hash-utils";
import type {
  DatabaseAdapter,
  PreparedStatementAdapter,
} from "./storage-contract";

export const DEFAULT_WORKSPACE_ID = "ws_default";
export const LEGACY_INBOX_NOTEBOOK_ID = "nb_inbox";

export const workspaceInboxId = (workspaceId: string) => `${workspaceId}_inbox`;

export const isInboxNotebookId = (id: string, workspaceId: string) =>
  id === LEGACY_INBOX_NOTEBOOK_ID || id === workspaceInboxId(workspaceId);

export const isInboxNotebook = (
  notebook: { id: string; slug?: string | null },
  workspaceId: string,
) => isInboxNotebookId(notebook.id, workspaceId) || notebook.slug === "inbox";

export type UserWorkspace = {
  workspaceId: string;
  role: "owner" | "member";
};

export type DefaultNotebookRow = {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  sortOrder: number;
};

export const createDefaultNotebookRows = (
  workspaceId: string,
  locale?: string | null,
): DefaultNotebookRow[] => DEFAULT_NOTEBOOK_SEEDS.map((seed) => ({
  id: seed.key === "inbox" ? workspaceInboxId(workspaceId) : `${workspaceId}_${seed.key}`,
  name: localizeDefaultNotebookName(seed, locale),
  slug: seed.slug,
  color: seed.color,
  sortOrder: seed.sortOrder,
}));

// Template use and editing derive the TipTap document from content_markdown.
// Keeping this initial value static avoids loading the Markdown parser merely
// to provision a workspace.
const EMPTY_TEMPLATE_CONTENT_JSON = JSON.stringify({ type: "doc", content: [] });

// A condition every seed insert must meet, so a delayed batch cannot recreate
// a seed after the step that owned it has finished.
type SeedInsertGuard = { sql: string; bindings: unknown[] };

export const createWorkspaceDefaultSeedStatements = (
  db: DatabaseAdapter,
  workspaceId: string,
  now = isoNow(),
  locale?: string | null,
  guard: SeedInsertGuard = { sql: "1", bindings: [] },
): PreparedStatementAdapter[] => [
  ...DEFAULT_MEMO_TEMPLATE_SEEDS.map((seed) => {
    const localized = localizeMemoTemplateSeed(seed, locale);
    return db.prepare(
      `INSERT OR IGNORE INTO memo_templates (
         id, workspace_id, name, description, title, content_json, content_markdown, tags_json, created_at, updated_at
       ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${guard.sql}`,
    ).bind(
      defaultMemoTemplateId(workspaceId, seed.key),
      workspaceId,
      localized.title,
      localized.description,
      localized.title,
      EMPTY_TEMPLATE_CONTENT_JSON,
      localized.contentMarkdown,
      JSON.stringify(["template", seed.tag]),
      now,
      now,
      ...guard.bindings,
    );
  }),
  ...DEFAULT_AI_PROMPT_SEEDS.map((seed) => db.prepare(
    `INSERT OR IGNORE INTO ai_prompt_templates (
       id, workspace_id, seed_key, action, parameter_kind, result_mode,
       name, description, instruction,
       name_customized, description_customized, instruction_customized,
       created_at, updated_at
     ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ? WHERE ${guard.sql}`,
  ).bind(
    defaultAiPromptId(workspaceId, seed.key),
    workspaceId,
    seed.key,
    seed.action,
    seed.parameterKind,
    seed.resultMode,
    seed.name,
    seed.description,
    seed.instruction,
    now,
    now,
    ...guard.bindings,
  )),
];

// Workspaces created before their user has signed in (a fresh installation's
// default workspace, or a member added by the owner) wait for that user's
// first sign-in, when the UI locale is known.
export const markWorkspaceSeedLocalizationPendingStatement = (
  db: DatabaseAdapter,
  workspaceId: string,
  now = isoNow(),
): PreparedStatementAdapter => db.prepare(
  `INSERT OR IGNORE INTO workspace_seed_localizations (workspace_id, created_at) VALUES (?, ?)`,
).bind(workspaceId, now);

const SEED_LOCALIZATION_PENDING = `EXISTS (
  SELECT 1 FROM workspace_seed_localizations WHERE workspace_id = ?
)`;

// Every update re-checks the pending row and the last statement removes it, so
// the batch runs once even when two sign-ins race, and a failed batch leaves
// the row in place for the next sign-in to retry. Only names and content that
// still match a seeded value are replaced.
export const createWorkspaceSeedLocalizationStatements = async (
  db: DatabaseAdapter,
  workspaceId: string,
  locale: string | null | undefined,
  now = isoNow(),
): Promise<PreparedStatementAdapter[]> => {
  const welcome = buildWelcomeMemoContent(locale);
  const welcomeContentHash = await sha256(welcome.contentMarkdown + welcome.contentJson);
  // The memo row must still carry the seeded title and the system actor, and
  // the content must still be the seeded revision. The content is replaced
  // before the memo row, so the memo row's guard looks for that replacement.
  const welcomeGuard = (states: [string, number][]) => ({
    sql: `${SEED_LOCALIZATION_PENDING}
      AND EXISTS (
        SELECT 1 FROM memos
        WHERE id = ? AND workspace_id = ? AND is_deleted = 0
          AND title = ? AND updated_by = 'system'
      )
      AND EXISTS (
        SELECT 1 FROM memo_contents
        WHERE memo_id = ? AND (${states.map(() => "(content_hash = ? AND revision = ?)").join(" OR ")})
      )`,
    bindings: [
      workspaceId,
      WELCOME_MEMO_ID,
      workspaceId,
      WELCOME_MEMO_SEED_TITLE,
      WELCOME_MEMO_ID,
      ...states.flat(),
    ],
  });
  const welcomeIsUntouched = welcomeGuard([
    [WELCOME_MEMO_SEED_CONTENT_HASH, 0],
    [WELCOME_MEMO_REPAIRED_CONTENT_HASH, 1],
  ]);
  const welcomeContentWasLocalized = welcomeGuard([[welcomeContentHash, 1], [welcomeContentHash, 2]]);

  return [
    ...createWorkspaceDefaultSeedStatements(db, workspaceId, now, locale, {
      sql: SEED_LOCALIZATION_PENDING,
      bindings: [workspaceId],
    }),
    // Templates that already exist (the default workspace's come from the
    // installation migrations) are replaced only while they still equal one
    // of the seeded translations.
    ...DEFAULT_MEMO_TEMPLATE_SEEDS.map((seed) => {
      const seeded = Object.values(seed.translations);
      const localized = localizeMemoTemplateSeed(seed, locale);
      const placeholders = seeded.map(() => "?").join(", ");
      return db.prepare(
        `UPDATE memo_templates
         SET name = ?, description = ?, title = ?, content_markdown = ?, updated_at = ?
         WHERE id = ? AND workspace_id = ?
           AND name IN (${placeholders})
           AND title IN (${placeholders})
           AND description IN (${placeholders})
           AND content_markdown IN (${placeholders})
           AND name <> ?
           AND ${SEED_LOCALIZATION_PENDING}`,
      ).bind(
        localized.title,
        localized.description,
        localized.title,
        localized.contentMarkdown,
        now,
        defaultMemoTemplateId(workspaceId, seed.key),
        workspaceId,
        ...seeded.map((translation) => translation.title),
        ...seeded.map((translation) => translation.title),
        ...seeded.map((translation) => translation.description),
        ...seeded.map((translation) => translation.contentMarkdown),
        localized.title,
        workspaceId,
      );
    }),
    ...DEFAULT_NOTEBOOK_SEEDS.map((seed) => {
      const seededNames = Object.values(seed.names);
      const name = localizeDefaultNotebookName(seed, locale);
      return db.prepare(
        `UPDATE notebooks
         SET name = ?, updated_at = ?
         WHERE workspace_id = ? AND slug = ? AND parent_id IS NULL AND is_deleted = 0
           AND name IN (${seededNames.map(() => "?").join(", ")})
           AND name <> ?
           AND ${SEED_LOCALIZATION_PENDING}`,
      ).bind(name, now, workspaceId, seed.slug, ...seededNames, name, workspaceId);
    }),
    db.prepare(
      `INSERT INTO memo_search_documents (memo_id, title, content_text, tags)
       SELECT ?, ?, ?, 'edgeever welcome'
       WHERE ${welcomeIsUntouched.sql}
       ON CONFLICT(memo_id) DO UPDATE SET
         title = excluded.title,
         content_text = excluded.content_text`,
    ).bind(WELCOME_MEMO_ID, welcome.title, welcome.contentText, ...welcomeIsUntouched.bindings),
    db.prepare(
      `UPDATE memo_contents
       SET content_json = ?, content_markdown = ?, content_text = ?, content_hash = ?,
           revision = revision + 1, updated_at = ?
       WHERE memo_id = ? AND ${welcomeIsUntouched.sql}`,
    ).bind(
      welcome.contentJson,
      welcome.contentMarkdown,
      welcome.contentText,
      welcomeContentHash,
      now,
      WELCOME_MEMO_ID,
      ...welcomeIsUntouched.bindings,
    ),
    db.prepare(
      `UPDATE memos
       SET title = ?, excerpt = ?, updated_at = ?
       WHERE id = ? AND workspace_id = ? AND ${welcomeContentWasLocalized.sql}`,
    ).bind(welcome.title, welcome.excerpt, now, WELCOME_MEMO_ID, workspaceId, ...welcomeContentWasLocalized.bindings),
    db.prepare(
      `DELETE FROM workspace_seed_localizations WHERE workspace_id = ?`,
    ).bind(workspaceId),
  ];
};

const localizePendingWorkspaceSeeds = async (
  db: DatabaseAdapter,
  workspaceId: string,
  locale: string | null | undefined,
): Promise<boolean> => {
  const pending = await db.prepare(
    `SELECT workspace_id FROM workspace_seed_localizations WHERE workspace_id = ?`,
  ).bind(workspaceId).first<{ workspace_id: string }>();
  if (!pending) return false;
  await db.batch(await createWorkspaceSeedLocalizationStatements(db, workspaceId, locale));
  return true;
};

export const ensureUserWorkspace = async (
  db: DatabaseAdapter,
  userId: string,
  username: string,
  locale?: string | null,
): Promise<UserWorkspace> => {
  const existing = await db.prepare(
    `SELECT workspace_id, role FROM workspace_members WHERE user_id = ? LIMIT 1`,
  ).bind(userId).first<{ workspace_id: string; role: "owner" | "member" }>();
  if (existing) {
    await localizePendingWorkspaceSeeds(db, existing.workspace_id, locale);
    return { workspaceId: existing.workspace_id, role: existing.role };
  }

  const defaultOwner = await db.prepare(
    `SELECT user_id FROM workspace_members WHERE workspace_id = ? LIMIT 1`,
  ).bind(DEFAULT_WORKSPACE_ID).first<{ user_id: string }>();
  if (!defaultOwner) {
    await db.prepare(
      `INSERT OR IGNORE INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, 'owner')`,
    ).bind(DEFAULT_WORKSPACE_ID, userId).run();
    const claimed = await db.prepare(
      `SELECT workspace_id, role FROM workspace_members WHERE user_id = ? LIMIT 1`,
    ).bind(userId).first<{ workspace_id: string; role: "owner" | "member" }>();
    if (claimed) {
      if (!await localizePendingWorkspaceSeeds(db, claimed.workspace_id, locale)) {
        await db.batch(createWorkspaceDefaultSeedStatements(db, claimed.workspace_id, isoNow(), locale));
      }
      return { workspaceId: claimed.workspace_id, role: claimed.role };
    }
  }

  const workspaceId = createId("ws");
  const now = isoNow();
  const notebooks = createDefaultNotebookRows(workspaceId, locale);
  await db.batch([
    db.prepare(
      `INSERT INTO workspaces (id, name, is_personal, created_at, updated_at) VALUES (?, ?, 1, ?, ?)`,
    ).bind(workspaceId, `${username}'s workspace`, now, now),
    db.prepare(
      `INSERT INTO workspace_members (workspace_id, user_id, role, created_at) VALUES (?, ?, 'member', ?)`,
    ).bind(workspaceId, userId, now),
    ...notebooks.map((notebook) => db.prepare(
      `INSERT INTO notebooks (id, workspace_id, parent_id, name, slug, icon, color, sort_order, created_at, updated_at)
       VALUES (?, ?, NULL, ?, ?, 'notebook', ?, ?, ?, ?)`,
    ).bind(
      notebook.id,
      workspaceId,
      notebook.name,
      notebook.slug,
      notebook.color,
      notebook.sortOrder,
      now,
      now,
    )),
    ...createWorkspaceDefaultSeedStatements(db, workspaceId, now, locale),
    markWorkspaceExampleSeedPendingStatement(db, workspaceId, now),
  ]);
  return { workspaceId, role: "member" };
};
