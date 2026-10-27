import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { globSync, readFileSync } from "node:fs";

const applyMigrations = (sqlite, predicate) => {
  for (const file of globSync("migrations/*.sql").sort().filter(predicate)) {
    sqlite.exec(readFileSync(file, "utf8"));
  }
};

describe("default notebook colors", () => {
  test("clears untouched factory hues and keeps a saved appearance", () => {
    const sqlite = new Database(":memory:");
    try {
      sqlite.exec("PRAGMA foreign_keys = ON");
      applyMigrations(sqlite, (file) => file.split("/").at(-1) < "0078");
      sqlite.exec(`
        UPDATE notebooks SET icon = 'star', color = '#2563eb' WHERE slug = 'work-projects';
        UPDATE notebooks SET is_bold = 1 WHERE slug = 'learning-resources';
        INSERT INTO notebooks (id, workspace_id, parent_id, name, slug, icon, color, sort_order)
        VALUES
          ('nb_demo_features', 'ws_default', 'nb_projects', '功能演示', 'demo-features', 'notebook', '#0891b2', 21),
          ('nb_trips', 'ws_default', NULL, 'Trips', 'trips', 'notebook', '#2563eb', 60),
          ('nb_custom_inbox', 'ws_other', NULL, 'Inbox', 'inbox', 'notebook', '#112233', 10);
      `);

      sqlite.exec(readFileSync("migrations/0078_clear_default_notebook_colors.sql", "utf8"));

      const colorOf = (id) => sqlite.query("SELECT color FROM notebooks WHERE id = ?").get(id).color;
      expect(colorOf("nb_inbox")).toBeNull();
      expect(colorOf("nb_personal")).toBeNull();
      expect(colorOf("nb_creative")).toBeNull();
      expect(colorOf("nb_demo_features")).toBeNull();
      expect(colorOf("nb_projects")).toBe("#2563eb");
      expect(colorOf("nb_learning")).toBe("#7c3aed");
      expect(colorOf("nb_trips")).toBe("#2563eb");
      expect(colorOf("nb_custom_inbox")).toBe("#112233");
      expect(sqlite.query("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally {
      sqlite.close();
    }
  });
});
