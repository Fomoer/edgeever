-- Optimistic consistency for portable knowledge-base exports. Keep triggers on one line for D1.
PRAGMA foreign_keys = ON;

ALTER TABLE workspaces ADD COLUMN backup_revision INTEGER NOT NULL DEFAULT 0;

CREATE TRIGGER trg_backup_notebooks_insert AFTER INSERT ON notebooks BEGIN UPDATE workspaces SET backup_revision = backup_revision + 1 WHERE id IN (SELECT NEW.workspace_id); END;
CREATE TRIGGER trg_backup_notebooks_update AFTER UPDATE ON notebooks BEGIN UPDATE workspaces SET backup_revision = backup_revision + 1 WHERE id IN (SELECT OLD.workspace_id UNION SELECT NEW.workspace_id); END;
CREATE TRIGGER trg_backup_notebooks_delete BEFORE DELETE ON notebooks BEGIN UPDATE workspaces SET backup_revision = backup_revision + 1 WHERE id IN (SELECT OLD.workspace_id); END;

CREATE TRIGGER trg_backup_memos_insert AFTER INSERT ON memos BEGIN UPDATE workspaces SET backup_revision = backup_revision + 1 WHERE id IN (SELECT NEW.workspace_id); END;
CREATE TRIGGER trg_backup_memos_update AFTER UPDATE ON memos BEGIN UPDATE workspaces SET backup_revision = backup_revision + 1 WHERE id IN (SELECT OLD.workspace_id UNION SELECT NEW.workspace_id); END;
CREATE TRIGGER trg_backup_memos_delete BEFORE DELETE ON memos BEGIN UPDATE workspaces SET backup_revision = backup_revision + 1 WHERE id IN (SELECT OLD.workspace_id); END;

CREATE TRIGGER trg_backup_memo_contents_insert AFTER INSERT ON memo_contents BEGIN UPDATE workspaces SET backup_revision = backup_revision + 1 WHERE id IN (SELECT workspace_id FROM memos WHERE id = NEW.memo_id); END;
CREATE TRIGGER trg_backup_memo_contents_update AFTER UPDATE ON memo_contents BEGIN UPDATE workspaces SET backup_revision = backup_revision + 1 WHERE id IN (SELECT workspace_id FROM memos WHERE id = OLD.memo_id UNION SELECT workspace_id FROM memos WHERE id = NEW.memo_id); END;
CREATE TRIGGER trg_backup_memo_contents_delete BEFORE DELETE ON memo_contents BEGIN UPDATE workspaces SET backup_revision = backup_revision + 1 WHERE id IN (SELECT workspace_id FROM memos WHERE id = OLD.memo_id); END;

CREATE TRIGGER trg_backup_memo_revisions_insert AFTER INSERT ON memo_revisions BEGIN UPDATE workspaces SET backup_revision = backup_revision + 1 WHERE id IN (SELECT workspace_id FROM memos WHERE id = NEW.memo_id); END;
CREATE TRIGGER trg_backup_memo_revisions_update AFTER UPDATE ON memo_revisions BEGIN UPDATE workspaces SET backup_revision = backup_revision + 1 WHERE id IN (SELECT workspace_id FROM memos WHERE id = OLD.memo_id UNION SELECT workspace_id FROM memos WHERE id = NEW.memo_id); END;
CREATE TRIGGER trg_backup_memo_revisions_delete BEFORE DELETE ON memo_revisions BEGIN UPDATE workspaces SET backup_revision = backup_revision + 1 WHERE id IN (SELECT workspace_id FROM memos WHERE id = OLD.memo_id); END;

CREATE TRIGGER trg_backup_resources_insert AFTER INSERT ON resources BEGIN UPDATE workspaces SET backup_revision = backup_revision + 1 WHERE id IN (SELECT workspace_id FROM memos WHERE id = NEW.memo_id); END;
CREATE TRIGGER trg_backup_resources_update AFTER UPDATE ON resources BEGIN UPDATE workspaces SET backup_revision = backup_revision + 1 WHERE id IN (SELECT workspace_id FROM memos WHERE id = OLD.memo_id UNION SELECT workspace_id FROM memos WHERE id = NEW.memo_id); END;
CREATE TRIGGER trg_backup_resources_delete BEFORE DELETE ON resources BEGIN UPDATE workspaces SET backup_revision = backup_revision + 1 WHERE id IN (SELECT workspace_id FROM memos WHERE id = OLD.memo_id); END;

CREATE TRIGGER trg_backup_ai_prompt_templates_insert AFTER INSERT ON ai_prompt_templates BEGIN UPDATE workspaces SET backup_revision = backup_revision + 1 WHERE id IN (SELECT NEW.workspace_id); END;
CREATE TRIGGER trg_backup_ai_prompt_templates_update AFTER UPDATE ON ai_prompt_templates BEGIN UPDATE workspaces SET backup_revision = backup_revision + 1 WHERE id IN (SELECT OLD.workspace_id UNION SELECT NEW.workspace_id); END;
CREATE TRIGGER trg_backup_ai_prompt_templates_delete BEFORE DELETE ON ai_prompt_templates BEGIN UPDATE workspaces SET backup_revision = backup_revision + 1 WHERE id IN (SELECT OLD.workspace_id); END;
