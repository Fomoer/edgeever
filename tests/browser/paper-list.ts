import { PosterDocumentSchema, parsePosterDocument, serializePosterDocument } from "@edgeever/shared";
import { buildPosterDesign, applyPosterDesign, templatesFor } from "../../apps/web/src/lib/poster-design/templates";
import { paperListSampleCopy } from "../../apps/web/src/lib/poster-design/paper-list-content";
import { renderPosterBlob } from "../../apps/web/src/lib/poster-canvas";

import { paperListReferenceCopy } from "./paper-list-reference";

const status = document.querySelector('#status')!;
const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
try {
  assert(templatesFor('xhs').some(template => template.id === 'paper-list'), 'Template must be discoverable');
  for (const zh of [true, false]) {
    const { title, subtitle } = paperListSampleCopy(zh);
    // Reproduce the real editor path: fresh Folio -> select Bookish list.
    const starter = zh ? { title: '写下你的标题', subtitle: '把想法变成值得分享的作品' } : { title: 'Write your title', subtitle: 'Turn ideas into something worth sharing' };
    const initial = await buildPosterDesign({ id: 'folio', ...starter, width: 1080, height: 1440, zh });
    const selected = await applyPosterDesign(initial, 'paper-list', zh, 1080, 1440, starter);
    assert(selected.copy?.title === title && selected.copy?.subtitle === subtitle, 'Actual selection must seed sample copy');
    assert(selected.elements.some(element => element.type === 'text' && element.text === '2.'), 'Actual selection must show two entries');
    for (const [width, height] of [[1080, 1440], [1080, 1080], [1920, 1080], [600, 320]]) {
      const design = height === 1440 ? selected : await buildPosterDesign({ id: 'paper-list', title, subtitle, width, height, zh });
      const roundtrip = parsePosterDocument(serializePosterDocument(design));
      assert(roundtrip.templateId === 'paper-list', 'Template must survive saving');
      assert(roundtrip.copy?.subtitle === subtitle, 'Original text must survive saving');
      const texture = roundtrip.elements.filter(element => element.name.startsWith('paper-list:paper:'));
      assert(texture.length === 6 && texture.some(element => element.type === 'path'), 'Paper fibres and creases must survive saving');
      assert(roundtrip.elements.filter(element => element.name === 'paper-list:watermark').length === 2, 'Faint background lettering must survive saving');
      for (const index of [0, 1]) {
        const heading = roundtrip.elements.find(element => element.name === `paper-list:row:${index}:heading`);
        const subhead = roundtrip.elements.find(element => element.name === `paper-list:row:${index}:subtitle`);
        const body = roundtrip.elements.find(element => element.name === `paper-list:row:${index}:body`);
        assert(heading?.type === 'text' && subhead?.type === 'text' && body?.type === 'text', 'Three text levels must exist');
        if (heading?.type === 'text' && subhead?.type === 'text' && body?.type === 'text') {
          assert(heading.fontSize > subhead.fontSize && subhead.fontSize > body.fontSize, 'Book title, subtitle and body need distinct sizes');
          assert(subhead.y >= heading.y + heading.height && body.y >= subhead.y + subhead.height, 'The three levels must not overlap');
        }
      }
      const paragraph = roundtrip.elements.find(element => element.name === 'paper-list:row:0:paragraph:1');
      const firstParagraph = roundtrip.elements.find(element => element.name === 'paper-list:row:0:body');
      assert(paragraph?.type === 'text' && firstParagraph?.type === 'text', 'Body paragraphs must be independently editable');
      if (paragraph?.type === 'text' && firstParagraph?.type === 'text') {
        assert(paragraph.y - firstParagraph.y - firstParagraph.height >= firstParagraph.fontSize * 0.4, 'Paragraphs need visible breathing room');
      }
      assert(roundtrip.elements.some(element => element.type === 'text' && element.text === '1.' && element.fontFamily === '思源宋体' && element.fontWeight === 'normal'), 'Numerals must use the regular book serif');
      const text = design.elements.filter(element => element.type === 'text');
      assert(text.some(element => element.text === '2.'), 'Both entries must survive');
      for (const element of design.elements) {
        // Background lettering intentionally bleeds past the page, like text
        // showing through a cropped scan. Foreground content must remain inside.
        if (element.name === 'paper-list:watermark') {
          assert(element.opacity < 0.06 && element.x < 0, 'Background lettering must stay faint and cropped');
          continue;
        }
        assert(element.x >= 0 && element.y >= 0 && element.x + element.width <= width + 2 && element.y + element.height <= height + 2,
          `Element ${element.id} outside ${width}×${height} (${zh ? 'zh' : 'en'})`);
      }
      if (height === 1440) {
        const blob = await renderPosterBlob(design, async () => { throw new Error('No resources expected'); }, 'png', false);
        const img = document.createElement('img');
        img.src = URL.createObjectURL(blob);
        img.alt = zh ? '书页清单中文 PNG 导出' : 'Bookish list English PNG export';
        img.style.width = '400px';
        document.querySelector('main')!.append(img);
        await img.decode();
        assert(img.naturalWidth === width && img.naturalHeight === height, 'Export dimensions must match');
        const reapplied = await applyPosterDesign(design, 'paper-list', zh);
        assert(reapplied.elements.length === design.elements.length, 'Reapplying must not duplicate content');
        PosterDocumentSchema.parse(reapplied);
        const subhead = design.elements.find(element => element.name === 'paper-list:row:0:subtitle');
        if (subhead?.type === 'text') {
          subhead.text = subhead.sourceText = zh ? '编辑后的副标题' : 'My edited subtitle';
          const editedSubhead = await applyPosterDesign(design, 'paper-list', zh);
          assert(editedSubhead.elements.some(element => element.name === subhead.name && element.type === 'text' && element.sourceText === subhead.sourceText), 'Edited subtitle must survive reapplication');
        }
        const secondParagraph = design.elements.find(element => element.name === 'paper-list:row:0:paragraph:1');
        if (secondParagraph?.type === 'text') {
          secondParagraph.text = secondParagraph.sourceText = zh ? '我修改后的第二段。' : 'My edited second paragraph.';
          const editedParagraph = await applyPosterDesign(design, 'paper-list', zh);
          assert(editedParagraph.elements.some(element => element.name === secondParagraph.name && element.type === 'text' && element.sourceText === secondParagraph.sourceText), 'Second paragraph edits must survive resizing and reapplication');
        }
        const body = design.elements.find(element => element.name === 'paper-list:row:0:body');
        assert(body?.type === 'text', 'Entry body must be separately editable');
        if (body?.type === 'text') {
          body.text = body.sourceText = zh ? '我编辑后的正文，重新应用必须保留。' : 'My edited paragraph must survive.';
          const edited = await applyPosterDesign(design, 'paper-list', zh, 1080, 1440, starter);
          assert(edited.elements.some(element => element.type === 'text' && element.sourceText === body.sourceText), 'Reapplying must preserve edited paragraph');
        }
      }
    }
    const points = await buildPosterDesign({ id: 'paper-list', title, subtitle: '', points: ['First\nA complete paragraph.', 'Second\nAnother paragraph.', 'Third\nLast paragraph.'], width: 1080, height: 1440, zh });
    assert(points.elements.some(element => element.type === 'text' && element.text === '3.'), 'Points must create numbered entries');
  }
  const reference = await buildPosterDesign({ id: 'paper-list', ...paperListReferenceCopy, width: 1080, height: 1440, zh: true });
  const referenceBlob = await renderPosterBlob(reference, async () => { throw new Error('No resources expected'); }, 'png', false);
  const referenceImage = document.createElement('img');
  referenceImage.src = URL.createObjectURL(referenceBlob);
  referenceImage.alt = '原图同文案排版对照';
  referenceImage.style.width = '400px';
  document.querySelector('main')!.append(referenceImage);
  await referenceImage.decode();
  const metrics = document.createElement('pre');
  metrics.id = 'reference-metrics';
  metrics.textContent = JSON.stringify(reference.elements.filter(element => element.type === 'text' && element.name.startsWith('paper-list:row:')).map(element => ({ name: element.name, x: element.x, y: element.y, height: element.height, fontSize: element.type === 'text' ? element.fontSize : 0, text: element.type === 'text' ? element.text : '' })), null, 2);
  const measurements = document.createElement('details');
  const measurementsLabel = document.createElement('summary');
  measurementsLabel.textContent = '同文案版心测量（px）';
  measurements.append(measurementsLabel, metrics);
  document.body.append(measurements);
  const title = reference.elements.find(element => element.role === 'title');
  const firstHeading = reference.elements.find(element => element.name === 'paper-list:row:0:heading');
  const firstSubheading = reference.elements.find(element => element.name === 'paper-list:row:0:subtitle');
  const firstBody = reference.elements.find(element => element.name === 'paper-list:row:0:body');
  assert(title && title.y < 1440 * 0.05, 'Reference title must sit close to the page top');
  assert(firstHeading && firstSubheading && firstBody && firstBody.x < firstHeading.x && firstHeading.x < firstSubheading.x, 'Reference book, subtitle and body have distinct left edges');
  assert(firstBody?.type === 'text' && firstBody.text.split('\n').length === 4, 'Reference opening paragraph must occupy four lines');
  assert(firstBody && Math.abs(firstBody.y / 1440 - 0.33) < 0.035, 'Reference body must begin near one third of the page');
  status.textContent = 'PASS：同文案版心对照、粗体段首、真实模板选择、中英文 × 4 种尺寸、宋体数字、段间留白、裁切水印、编辑保留与 PNG 导出均通过。';
} catch (error) {
  status.textContent = `FAIL: ${String(error)}`;
  console.error(error);
}
