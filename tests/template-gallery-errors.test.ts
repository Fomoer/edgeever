import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const templatesPaneSource = read("../apps/web/src/components/TemplatesPane.tsx");
const workspaceSource = read("../apps/web/src/components/WorkspaceApp.tsx");

describe("template gallery save failures", () => {
  test("shows a notice when creating a template fails", () => {
    const start = workspaceSource.indexOf("const createTemplateMutation = useMutation({");
    const end = workspaceSource.indexOf("const useTemplateMutation", start);
    const mutation = workspaceSource.slice(start, end);
    expect(mutation).toContain("onError:");
    expect(mutation).toContain('t("templates.createFailedTitle")');
    expect(mutation).toContain('t("templates.createFailed")');
  });

  test("handles a rejected gallery add instead of leaving it unhandled", () => {
    const start = templatesPaneSource.indexOf("const addGalleryTemplate = async");
    const end = templatesPaneSource.indexOf("const draftHtmlPreview", start);
    const handler = templatesPaneSource.slice(start, end);
    expect(handler).toContain("} catch {");
    expect(handler).toContain("setAddingGalleryKey(null);");
  });

  test("ignores a second gallery add while the first is still saving", () => {
    const start = templatesPaneSource.indexOf("const addGalleryTemplate = async");
    const end = templatesPaneSource.indexOf("const draftHtmlPreview", start);
    const handler = templatesPaneSource.slice(start, end);
    expect(handler.indexOf("if (addingGalleryRef.current) return;"))
      .toBeLessThan(handler.indexOf("await onCreateSavedTemplate"));
    expect(handler).toContain("addingGalleryRef.current = true;");
    expect(handler).toContain("addingGalleryRef.current = false;");
  });
});
