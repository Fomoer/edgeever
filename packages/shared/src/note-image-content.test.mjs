import { expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { prepareNoteImageContent } from "./note-image-content";

test("removes the whole unified image panel from exports without removing the image", () => {
  const { document } = parseHTML('<div id="source"><figure class="edgeever-image-node"><img src="photo.png"><div class="edgeever-image-panel"><div class="edgeever-image-controls"><button>Small</button></div><div class="edgeever-image-resource-actions"><div data-edgeever-resource-menu><button>Download</button></div></div></div></figure></div>');
  const source = document.querySelector("#source");
  const clone = source.cloneNode(true);
  prepareNoteImageContent(clone);
  expect(clone.querySelector(".edgeever-image-panel")).toBeNull();
  expect(clone.querySelector("[data-edgeever-resource-menu]")).toBeNull();
  expect(clone.querySelector("img").getAttribute("src")).toBe("photo.png");
  expect(source.querySelector(".edgeever-image-panel")).not.toBeNull();
});

test("reflows wide labelled tables without dropping values or changing the source", () => {
  const { document } = parseHTML(`<div id="source"><div class="tableWrapper" style="width:1800px;overflow:auto"><table style="min-width:1800px"><colgroup><col width="300"></colgroup><tbody><tr>${[1,2,3,4,5,6].map(n => `<th>Field ${n}</th>`).join("")}</tr><tr>${[1,2,3,4,5,6].map(n => `<td style="width:300px"><p><strong>Value ${n}</strong></p></td>`).join("")}</tr></tbody></table></div></div>`);
  const source = document.querySelector("#source");
  const original = source.innerHTML;
  const clone = source.cloneNode(true);
  prepareNoteImageContent(clone);
  expect(source.innerHTML).toBe(original);
  expect(clone.querySelector("table").getAttribute("data-edgeever-export-table")).toBe("stacked");
  expect(clone.querySelectorAll(".edgeever-table-label").length).toBe(6);
  for (let n = 1; n <= 6; n++) {
    expect(clone.querySelectorAll(".edgeever-table-label")[n-1].textContent).toBe(`Field ${n}`);
    expect(clone.querySelectorAll(".edgeever-table-value strong")[n-1].textContent).toBe(`Value ${n}`);
  }
  expect(clone.querySelector("colgroup")).toBeNull();
  expect(clone.querySelector(".tableWrapper").style.width).toBeFalsy();
  const once = clone.innerHTML;
  prepareNoteImageContent(clone);
  expect(clone.innerHTML).toBe(once);
});

test("keeps merged cells, unlabelled tables and nested table boundaries intact", () => {
  for (const html of [
    '<table><tr><th colspan="5">Merged</th></tr><tr><td colspan="5">All fields</td></tr></table>',
    `<table><tr>${[1,2,3,4,5].map(n => `<td>${n}</td>`).join("")}</tr></table>`,
    '<table><tr><td><table><tr><td>Nested</td></tr></table></td></tr></table>',
  ]) {
    const { document } = parseHTML(`<div>${html}</div>`);
    const root = document.querySelector("div");
    prepareNoteImageContent(root);
    expect(root.querySelector("[data-edgeever-export-table]")).toBeNull();
    expect(root.innerHTML).toBe(html);
  }
});

test("releases gallery cropping and unwraps native controls without losing images", () => {
  const { document } = parseHTML('<div id="root"><div data-edgeever-image-gallery="true"><div class="edgeever-native-gallery-toolbar"><button>Layout</button></div><div class="edgeever-native-gallery-content"><div class="edgeever-image-node" style="height:120px;overflow:hidden"><img src="portrait.png" width="320" height="1200" style="width:50%;height:120px;object-fit:cover"></div><img src="landscape.png"></div></div><pre><code>unchanged\tcode\nEND</code></pre></div>');
  const root = document.querySelector("#root");
  prepareNoteImageContent(root);
  expect(root.querySelectorAll("img").length).toBe(2);
  expect(root.querySelector(".edgeever-native-gallery-toolbar")).toBeNull();
  expect(root.querySelector(".edgeever-native-gallery-content")).toBeNull();
  expect(root.querySelector("img").style.maxWidth).toBe("50%");
  expect(root.querySelector("img").hasAttribute("height")).toBe(false);
  expect(root.querySelector("pre").textContent).toBe("unchanged\tcode\nEND");
  const once = root.innerHTML;
  prepareNoteImageContent(root);
  expect(root.innerHTML).toBe(once);
});

test("keeps a note's chosen image percentage while releasing fixed crop dimensions", () => {
  const { document } = parseHTML('<div id="root"><figure class="edgeever-image-node" data-width="35" style="width:35%;height:160px;overflow:hidden"><img src="photo.png" style="width:100%;height:160px"></figure></div>');
  const root = document.querySelector("#root");
  prepareNoteImageContent(root);
  expect(root.querySelector("figure").style.width).toBe("35%");
  expect(root.querySelector("figure").style.height).toBeFalsy();
  expect(root.querySelector("img").style.maxWidth).toBe("100%");
});
