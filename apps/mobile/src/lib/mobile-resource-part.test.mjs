import { expect, test } from "bun:test";
import { readMobileResourcePart } from "./mobile-resource-part.ts";

test("reads exact binary upload ranges and closes each file handle", () => {
  const source = new Uint8Array([0, 255, 37, 80, 68, 70, 13, 10]);
  const handles = [];
  const open = () => {
    const handle = {
      offset: 0,
      closed: false,
      readBytes(length) {
        return source.slice(this.offset, this.offset + length);
      },
      close() { this.closed = true; },
    };
    handles.push(handle);
    return handle;
  };

  expect([...readMobileResourcePart(open, 0, 4)]).toEqual([0, 255, 37, 80]);
  expect([...readMobileResourcePart(open, 4, 8)]).toEqual([68, 70, 13, 10]);
  expect(handles.map((handle) => handle.closed)).toEqual([true, true]);
});

test("rejects truncated file parts and still closes the handle", () => {
  let closed = false;
  expect(() => readMobileResourcePart(() => ({
    offset: 0,
    readBytes: () => new Uint8Array([1]),
    close: () => { closed = true; },
  }), 0, 2)).toThrow("附件读取不完整");
  expect(closed).toBe(true);
});
