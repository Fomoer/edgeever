// Build-time only. The gallery never imports this renderer.
import { buildPosterDesign, DESIGN_TEMPLATES, templatesFor } from "../../apps/web/src/lib/poster-design/templates";
import { renderPosterBlob } from "../../apps/web/src/lib/poster-canvas";
import { loadPosterFont } from "../../apps/web/src/lib/poster-design/fonts";
import { installEditorBodyFontFaces } from "../../apps/web/src/lib/editor-body-font-faces";
installEditorBodyFontFaces();
import { posterTemplateSampleCopy } from "../../apps/web/src/lib/poster-design/paper-list-content";
const prepared = new Map<string, Awaited<ReturnType<typeof buildPosterDesign>>>();
const recommended = new Set(templatesFor(undefined).map(template => template.id));
Object.assign(window, {
  posterThumbnailGenerator: {
    templates: DESIGN_TEMPLATES.map(template => ({ id: template.id, recommended: recommended.has(template.id) })),
    async prepare(id: string, zh: boolean) {
      const input = {
        id, zh, width: 1080, height: 1440,
        ...posterTemplateSampleCopy(id, zh),
      };
      const draft = await buildPosterDesign(input);
      const texts = draft.elements.filter(element => element.type === "text");
      // Generation must wait for the actual typefaces; never freeze a temporary
      // system-font fallback into a released thumbnail.
      await Promise.all([...new Set(texts.map(element => element.fontFamily))].map(family =>
        loadPosterFont(family, texts.map(element => element.text).join(" "), { deadline: false }),
      ));
      const document = await buildPosterDesign(input);
      prepared.set(`${id}:${zh}`, document);
      return JSON.stringify(document);
    },
    async render(id: string, zh: boolean) {
      const document = prepared.get(`${id}:${zh}`);
      if (!document) throw new Error("Prepare template before rendering");
      const blob = await renderPosterBlob(document, async () => { throw new Error("Thumbnail cannot read note resources"); }, "webp", true, 1, 0.85);
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
    },
  },
});
