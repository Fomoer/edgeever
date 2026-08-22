import { describe, expect, test } from "bun:test";
import { createSlashCommandItems, filterSlashCommandItems } from "./SlashCommandMenu.tsx";

const labels = {
  menu: "插入功能菜单",
  empty: "没有匹配的功能。",
  close: "关闭菜单",
  groups: { suggested: "建议", basic: "基本区块", insert: "插入" },
  items: {
    ai: "用 AI 处理",
    paragraph: "正文",
    "heading-1": "标题 1",
    "heading-2": "标题 2",
    "heading-3": "标题 3",
    "bullet-list": "无序列表",
    "ordered-list": "有序列表",
    "task-list": "任务清单",
    blockquote: "引用",
    "code-block": "代码块",
    divider: "分割线",
    table: "表格",
    attachment: "上传附件",
    "note-link": "引用笔记",
    "external-link": "插入超链接",
  },
};

describe("slash command menu", () => {
  const items = createSlashCommandItems(labels);

  test("shows all commands for a bare slash", () => {
    expect(filterSlashCommandItems(items, "")).toHaveLength(15);
  });

  test("searches localized labels and aliases", () => {
    expect(filterSlashCommandItems(items, "AI").map((item) => item.id)).toEqual(["ai"]);
    expect(filterSlashCommandItems(items, "待办").map((item) => item.id)).toEqual(["task-list"]);
    expect(filterSlashCommandItems(items, "h2").map((item) => item.id)).toEqual(["heading-2"]);
  });
});
