import { expect, test } from 'bun:test';
import { POSTER_DESIGN_TEMPLATES, createPosterDocument } from '@edgeever/shared';
import {
  paperListCurrentCopy,
  paperListSampleCopy,
  paperListSelectionCopy,
  parsePaperListRow,
  posterTemplateSampleCopy,
  posterTemplateSelectionCopy,
} from './paper-list-content';

const starter = { title: '写下你的标题', subtitle: '把想法变成值得分享的作品', badge: '' };
const source = () => ({ ...createPosterDocument(starter.title, starter.subtitle), copy: starter });

test('selecting the list template on a fresh poster seeds two complete entries', () => {
  const copy = paperListSelectionCopy(source(), starter, true, starter);
  expect(copy).toEqual(paperListSampleCopy(true));
  expect(copy.subtitle.split('\n\n')).toHaveLength(2);
  expect(copy.subtitle.split('\n\n').every(entry => entry.split('\n').length === 4)).toBe(true);
});

test('custom text and imported notes never receive sample content', () => {
  for (const copy of [{ ...starter, title: '我的标题' }, { ...starter, subtitle: '我的正文' }, { ...starter, badge: '我的标签' }]) {
    expect(paperListSelectionCopy(source(), copy, true, starter)).toEqual(copy);
  }
  expect(paperListSelectionCopy({ ...source(), sourceMemoId: 'memo' }, starter, true, starter)).toEqual(starter);
  expect(paperListSelectionCopy(source(), starter, true)).toEqual(starter);
});

test('template reapplication reads edited row text instead of stale copy', () => {
  const document = source();
  document.templateId = 'paper-list';
  const text = document.elements.find(element => element.type === 'text');
  document.elements = [
    { ...text, id: 'design_2', name: 'paper-list:row:0:heading', text: '我的小标题', sourceText: '我的小标题' },
    { ...text, id: 'design_3', name: 'paper-list:row:0:body', text: '编辑后的正文', sourceText: '编辑后的正文' },
    { ...text, id: 'design_4', name: 'paper-list:row:1:heading', text: '第二项', sourceText: undefined },
  ];
  expect(paperListCurrentCopy(document, starter).subtitle).toBe('我的小标题\n编辑后的正文\n\n第二项');
  expect(paperListCurrentCopy({ ...document, templateId: 'folio' }, starter)).toEqual(starter);
});


test('row subtitles are explicit and ordinary body lines keep their meaning', () => {
  expect(parsePaperListRow('《书名》\n副标题：22 条序列与扮演法\n核心设定：正文')).toEqual({ heading: '《书名》', subtitle: '22 条序列与扮演法', body: '核心设定：正文' });
  expect(parsePaperListRow('Book\nSubtitle: A second level\nBody')).toEqual({ heading: 'Book', subtitle: 'A second level', body: 'Body' });
  expect(parsePaperListRow('Old heading\nFirst paragraph\nSecond paragraph')).toEqual({ heading: 'Old heading', subtitle: undefined, body: 'First paragraph\nSecond paragraph' });
});

test('edited row subtitles survive save and reapply alongside the body', () => {
  const document = source();
  document.templateId = 'paper-list';
  const text = document.elements.find(element => element.type === 'text');
  document.elements = [
    { ...text, id: 'design_1', name: 'paper-list:row:0:heading', text: '《书名》', sourceText: undefined },
    { ...text, id: 'design_2', name: 'paper-list:row:0:subtitle', text: '修改后的副标题', sourceText: '修改后的副标题' },
    { ...text, id: 'design_3', name: 'paper-list:row:0:body', text: '正文', sourceText: undefined },
  ];
  const copy = paperListCurrentCopy(document, paperListSampleCopy(true));
  expect(parsePaperListRow(copy.subtitle)).toEqual({ heading: '《书名》', subtitle: '修改后的副标题', body: '正文' });
});


test('the previous unedited example gains subtitles without upgrading custom paragraphs', () => {
  const sample = paperListSampleCopy(true);
  const previous = { ...sample, subtitle: sample.subtitle.replace(/\n副标题：[^\n]*\n/g, '\n') };
  const document = { ...source(), templateId: 'paper-list' };
  expect(paperListSelectionCopy(document, previous, true)).toEqual(sample);
  const edited = { ...previous, subtitle: previous.subtitle + '我的补充' };
  expect(paperListSelectionCopy(document, edited, true)).toEqual(edited);
});


test('independent paragraphs reconstruct in order and retain edits across template changes', () => {
  const document = { ...source(), templateId: 'paper-list' };
  const text = document.elements.find(element => element.type === 'text');
  document.elements = [
    { ...text, id: 'p2', name: 'paper-list:row:0:paragraph:2', text: '第三段', sourceText: undefined },
    { ...text, id: 'head', name: 'paper-list:row:0:heading', text: '《书名》', sourceText: undefined },
    { ...text, id: 'p1', name: 'paper-list:row:0:paragraph:1', text: '修改后的第二段', sourceText: '修改后的第二段' },
    { ...text, id: 'body', name: 'paper-list:row:0:body', text: '第一段', sourceText: undefined },
  ];
  expect(paperListCurrentCopy(document, starter).subtitle).toBe('《书名》\n第一段\n修改后的第二段\n第三段');
  document.elements = document.elements.filter(element => element.id !== 'body');
  expect(paperListCurrentCopy(document, starter).subtitle).toBe('《书名》\n修改后的第二段\n第三段');
});

test('paragraph lead-ins follow current wording and leave other templates alone', async () => {
  const { paperListParagraphStyles } = await import('./paper-list-content');
  const paragraph = { type: 'text', name: 'paper-list:row:0:body', text: '核心设定：正文' };
  const styles = paperListParagraphStyles(paragraph);
  expect(Object.keys(styles[0])).toHaveLength(5);
  expect(styles[0][4].fontWeight).toBe('bold');
  expect(paperListParagraphStyles({ ...paragraph, text: '新的正文，没有段首标签' })).toBeUndefined();
  expect(paperListParagraphStyles({ ...paragraph, name: 'ordinary-body' })).toBeUndefined();
  expect(paperListParagraphStyles({ ...paragraph, name: 'paper-list:row:0:paragraph:1', text: '颠覆点：新内容' })[0][3].fontWeight).toBe('bold');
});

test('every catalog template has distinct bilingual initial sample copy tailored to its structure', () => {
  const zhTitles = new Set();
  const enTitles = new Set();
  for (const template of POSTER_DESIGN_TEMPLATES) {
    const zh = posterTemplateSampleCopy(template.id, true);
    const en = posterTemplateSampleCopy(template.id, false);
    expect(zh.title.trim().length).toBeGreaterThan(0);
    expect(zh.subtitle.trim().length).toBeGreaterThan(0);
    expect(en.title.trim().length).toBeGreaterThan(0);
    expect(en.subtitle.trim().length).toBeGreaterThan(0);
    zhTitles.add(zh.title);
    enTitles.add(en.title);
  }
  expect(zhTitles.size).toBe(POSTER_DESIGN_TEMPLATES.length);
  expect(enTitles.size).toBe(POSTER_DESIGN_TEMPLATES.length);
  expect(posterTemplateSampleCopy('compare', true).subtitle).toContain('|');
  expect(posterTemplateSampleCopy('brush', true).subtitle.split('、')).toHaveLength(3);
  expect(posterTemplateSampleCopy('bento', true).subtitle.split('、')).toHaveLength(3);
  expect(posterTemplateSampleCopy('notes', true).subtitle.split('\n')).toHaveLength(3);
});

test('browsing templates in unedited state switches sample copy while preserving user edits', () => {
  const folioDoc = { ...source(), templateId: 'folio', copy: posterTemplateSampleCopy('folio', true) };
  // Switching from untouched folio -> paper-list -> brush -> chat updates to each template's sample copy
  const toPaperList = posterTemplateSelectionCopy(folioDoc, folioDoc.copy, 'paper-list', true, starter);
  expect(toPaperList).toEqual(posterTemplateSampleCopy('paper-list', true));

  const paperListDoc = { ...source(), templateId: 'paper-list', copy: toPaperList };
  const toBrush = posterTemplateSelectionCopy(paperListDoc, paperListDoc.copy, 'brush', true, starter);
  expect(toBrush).toEqual(posterTemplateSampleCopy('brush', true));

  const brushDoc = { ...source(), templateId: 'brush', copy: toBrush };
  const toChat = posterTemplateSelectionCopy(brushDoc, brushDoc.copy, 'chat', true, starter);
  expect(toChat).toEqual(posterTemplateSampleCopy('chat', true));

  // Once the user edits any field, switching templates preserves their custom copy
  const userEdited = { ...toChat, title: '用户自定义标题' };
  const chatDoc = { ...source(), templateId: 'chat', copy: userEdited };
  expect(posterTemplateSelectionCopy(chatDoc, userEdited, 'folio', true, starter)).toEqual(userEdited);
  expect(posterTemplateSelectionCopy(chatDoc, userEdited, 'paper-list', true, starter)).toEqual(userEdited);
});

test('edited checklist and compare items reconstruct into subtitle copy', () => {
  const text = source().elements.find(element => element.type === 'text');
  const bentoDoc = {
    ...source(),
    templateId: 'bento',
    copy: posterTemplateSampleCopy('bento', true),
    elements: [
      { ...text, id: 'item0', name: 'poster:item:0', text: '回顾最初目标', sourceText: '回顾最初目标' },
      { ...text, id: 'item1', name: 'poster:item:1', text: '分析核心数据', sourceText: '分析核心数据' },
      { ...text, id: 'item2', name: 'poster:item:2', text: '提炼下次行动', sourceText: '提炼下次行动' },
    ],
  };
  const updatedBento = paperListCurrentCopy(bentoDoc, bentoDoc.copy);
  expect(updatedBento.subtitle).toBe('回顾最初目标、分析核心数据、提炼下次行动');
  expect(posterTemplateSelectionCopy(bentoDoc, updatedBento, 'folio', true, starter)).toEqual(updatedBento);

  const compareDoc = {
    ...source(),
    templateId: 'compare',
    copy: posterTemplateSampleCopy('compare', true),
    elements: [
      { ...text, id: 'c0', name: 'poster:compare:0', text: '改前冗长难懂', sourceText: '改前冗长难懂' },
      { ...text, id: 'c1', name: 'poster:compare:1', text: '改后直击重点', sourceText: '改后直击重点' },
    ],
  };
  const updatedCompare = paperListCurrentCopy(compareDoc, compareDoc.copy);
  expect(updatedCompare.subtitle).toBe('改前冗长难懂 | 改后直击重点');
  expect(posterTemplateSelectionCopy(compareDoc, updatedCompare, 'folio', true, starter)).toEqual(updatedCompare);
});
