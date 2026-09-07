import { expect, test } from 'bun:test';
import { attachDiagramScroll } from './diagram-scroll';

const setup = () => {
  const container = new EventTarget();
  container.clientHeight = 600;
  let position = { tx: 0, ty: 0 };
  const detach = attachDiagramScroll(container, { translate(x, y) {
    if (x !== undefined) position = { tx: x, ty: y };
    return position;
  } });
  const wheel = (values) => {
    const event = new Event('wheel', { cancelable: true });
    Object.assign(event, { deltaX: 0, deltaY: 0, deltaMode: 0, ...values });
    container.dispatchEvent(event);
    return event;
  };
  return { wheel, detach, position: () => position };
};

test('scroll reaches below the fold and returns without changing zoom', () => {
  const view = setup();
  expect(view.wheel({ deltaY: 1200 }).defaultPrevented).toBe(true);
  expect(view.position()).toEqual({ tx: 0, ty: -1200 });
  view.wheel({ deltaY: -1200 });
  expect(view.position()).toEqual({ tx: 0, ty: 0 });
  view.detach();
  view.wheel({ deltaY: 100 });
  expect(view.position().ty).toBe(0);
});

test('trackpad axes, shift wheel and line/page deltas are supported', () => {
  const view = setup();
  view.wheel({ deltaX: 20, deltaY: 30 });
  view.wheel({ deltaY: 2, deltaMode: 1, shiftKey: true });
  view.wheel({ deltaY: 1, deltaMode: 2 });
  expect(view.position()).toEqual({ tx: -52, ty: -630 });
});

test('Ctrl and Command wheel remain available for zoom', () => {
  const view = setup();
  for (const modifier of ['ctrlKey', 'metaKey']) {
    expect(view.wheel({ deltaY: 100, [modifier]: true }).defaultPrevented).toBe(false);
  }
  expect(view.position()).toEqual({ tx: 0, ty: 0 });
});
