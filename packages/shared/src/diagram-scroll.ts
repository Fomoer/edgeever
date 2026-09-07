type ScrollGraph = {
  translate: { (): { tx: number; ty: number }; (x: number, y: number): unknown };
};

/** Wheel pans the viewport; modified wheel remains available to X6 zoom. */
export const attachDiagramScroll = (container: HTMLElement, graph: ScrollGraph) => {
  const onWheel = (event: WheelEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target;
    if (typeof Element !== 'undefined' && target instanceof Element
      && target.closest('input, textarea, select, [contenteditable="true"]')) return;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? Math.max(1, container.clientHeight) : 1;
    const x = (event.shiftKey && event.deltaX === 0 ? event.deltaY : event.deltaX) * unit;
    const y = (event.shiftKey && event.deltaX === 0 ? 0 : event.deltaY) * unit;
    if (!x && !y) return;
    event.preventDefault();
    // Handle the viewport before nested SVG handlers can consume the wheel.
    event.stopPropagation();
    const position = graph.translate();
    graph.translate(position.tx - x, position.ty - y);
  };
  container.addEventListener('wheel', onWheel, { capture: true, passive: false });
  return () => container.removeEventListener('wheel', onWheel, { capture: true });
};
