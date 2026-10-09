import { describe, expect, test } from "bun:test";
import { attachMobileReaderScroll } from "./mobile-reader-scroll";

const setup = () => {
  const container = Object.assign(new EventTarget(), { scrollTop: 0 });
  const reports: boolean[] = [];
  let pending: (() => void) | undefined;
  const dispose = attachMobileReaderScroll(container, (value) => reports.push(value), {
    setTimeout: ((callback: () => void) => {
      pending = callback;
      return 1;
    }) as typeof setTimeout,
    clearTimeout: (() => { pending = undefined; }) as typeof clearTimeout,
  });
  const send = (name: string, top = container.scrollTop) => {
    container.scrollTop = top;
    container.dispatchEvent(new Event(name));
  };
  const idle = () => {
    const callback = pending;
    pending = undefined;
    callback?.();
  };
  return { reports, send, idle, dispose };
};

describe("mobile reader header layout", () => {
  test("holds layout during a slow drag and the following momentum", () => {
    const reader = setup();
    reader.send("touchstart");
    reader.send("scroll", 60);
    reader.idle();
    reader.send("scrollend");
    expect(reader.reports).toEqual([]);
    reader.send("touchend");
    reader.send("scroll", 100);
    expect(reader.reports).toEqual([]);
    reader.send("scrollend");
    reader.idle();
    expect(reader.reports).toEqual([true]);
    reader.dispose();
  });

  test("expands once at the top and ignores scroll caused by native resizing", () => {
    const reader = setup();
    reader.send("wheel");
    reader.send("scroll", 100);
    reader.idle();
    reader.send("touchstart");
    reader.send("scroll", 0);
    expect(reader.reports).toEqual([true]);
    reader.send("touchend");
    reader.idle();
    reader.send("scroll", 80);
    reader.idle();
    reader.send("touchstart");
    reader.send("touchend");
    reader.idle();
    expect(reader.reports).toEqual([true, false]);
    reader.dispose();
  });

  test("keeps the collapsed state in the 4–24px hysteresis band", () => {
    const reader = setup();
    reader.send("wheel");
    reader.send("scroll", 25);
    reader.idle();
    reader.send("wheel");
    reader.send("scroll", 10);
    reader.idle();
    expect(reader.reports).toEqual([true]);
    reader.send("wheel");
    reader.send("scroll", 4);
    reader.idle();
    expect(reader.reports).toEqual([true, false]);
    reader.dispose();
  });

  test("cancels pending reports when the reader unmounts", () => {
    const reader = setup();
    reader.send("wheel");
    reader.send("scroll", 100);
    reader.dispose();
    reader.idle();
    reader.send("scrollend");
    expect(reader.reports).toEqual([]);
  });
});
