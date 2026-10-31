-- Keep exact history totals without rescanning runs on every poll/page.
ALTER TABLE workspaces ADD COLUMN scheduled_run_count INTEGER NOT NULL DEFAULT 0 CHECK (scheduled_run_count >= 0);
ALTER TABLE scheduled_tasks ADD COLUMN run_count INTEGER NOT NULL DEFAULT 0 CHECK (run_count >= 0);

CREATE INDEX idx_scheduled_task_runs_workspace_started ON scheduled_task_runs(workspace_id, started_at DESC, id DESC);

UPDATE workspaces SET scheduled_run_count = (SELECT COUNT(*) FROM scheduled_task_runs r WHERE r.workspace_id = workspaces.id);
UPDATE scheduled_tasks SET run_count = (SELECT COUNT(*) FROM scheduled_task_runs r WHERE r.task_id = scheduled_tasks.id AND r.workspace_id = scheduled_tasks.workspace_id);

-- Each trigger is one line for the existing D1 migration splitter.
CREATE TRIGGER scheduled_run_count_insert AFTER INSERT ON scheduled_task_runs BEGIN UPDATE workspaces SET scheduled_run_count = scheduled_run_count + 1 WHERE id = NEW.workspace_id; UPDATE scheduled_tasks SET run_count = run_count + 1 WHERE id = NEW.task_id AND workspace_id = NEW.workspace_id; END;
CREATE TRIGGER scheduled_run_count_delete AFTER DELETE ON scheduled_task_runs BEGIN UPDATE workspaces SET scheduled_run_count = scheduled_run_count - 1 WHERE id = OLD.workspace_id; UPDATE scheduled_tasks SET run_count = run_count - 1 WHERE id = OLD.task_id AND workspace_id = OLD.workspace_id; END;
CREATE TRIGGER scheduled_run_count_move AFTER UPDATE OF workspace_id, task_id ON scheduled_task_runs WHEN OLD.workspace_id IS NOT NEW.workspace_id OR OLD.task_id IS NOT NEW.task_id BEGIN UPDATE workspaces SET scheduled_run_count = scheduled_run_count - 1 WHERE id = OLD.workspace_id AND OLD.workspace_id IS NOT NEW.workspace_id; UPDATE workspaces SET scheduled_run_count = scheduled_run_count + 1 WHERE id = NEW.workspace_id AND OLD.workspace_id IS NOT NEW.workspace_id; UPDATE scheduled_tasks SET run_count = run_count - 1 WHERE id = OLD.task_id AND workspace_id = OLD.workspace_id; UPDATE scheduled_tasks SET run_count = run_count + 1 WHERE id = NEW.task_id AND workspace_id = NEW.workspace_id; END;
CREATE TRIGGER scheduled_run_count_task_identity AFTER UPDATE OF id, workspace_id ON scheduled_tasks WHEN OLD.id IS NOT NEW.id OR OLD.workspace_id IS NOT NEW.workspace_id BEGIN UPDATE scheduled_tasks SET run_count = (SELECT COUNT(*) FROM scheduled_task_runs r WHERE r.task_id = NEW.id AND r.workspace_id = NEW.workspace_id) WHERE id = NEW.id; END;
CREATE TRIGGER scheduled_run_count_workspace_identity AFTER UPDATE OF id ON workspaces WHEN OLD.id IS NOT NEW.id BEGIN UPDATE workspaces SET scheduled_run_count = (SELECT COUNT(*) FROM scheduled_task_runs r WHERE r.workspace_id = NEW.id) WHERE id = NEW.id; END;
