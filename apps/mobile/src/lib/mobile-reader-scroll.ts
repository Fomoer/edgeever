/** Native metadata changes the WebView's size. Only switch it after a user
 * scroll settles; resize-generated scroll events must not start another switch. */
export const attachMobileReaderScroll = (
  container: Pick<HTMLElement, "scrollTop" | "addEventListener" | "removeEventListener">,
  reportCollapsed: (collapsed: boolean) => void,
  timers = { setTimeout, clearTimeout }
) => {
  let collapsed = false;
  let touching = false;
  let userScroll = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const cancel = () => {
    if (timer !== undefined) timers.clearTimeout(timer);
    timer = undefined;
  };
  const settle = () => {
    cancel();
    if (touching || !userScroll) return;
    userScroll = false;
    const next = container.scrollTop > (collapsed ? 4 : 24);
    if (next === collapsed) return;
    collapsed = next;
    reportCollapsed(next);
  };
  const schedule = () => {
    cancel();
    if (!touching && userScroll) timer = timers.setTimeout(settle, 150);
  };
  const startTouch = () => {
    touching = true;
    userScroll = false;
    cancel();
  };
  const endTouch = () => {
    touching = false;
    schedule();
  };
  const startScroll = () => {
    userScroll = true;
    schedule();
  };
  const onScroll = () => {
    if (touching) userScroll = true;
    schedule();
  };
  const onKey = (event: Event) => {
    if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes((event as KeyboardEvent).key)) startScroll();
  };
  const listeners: Array<[string, EventListener]> = [
    ["touchstart", startTouch],
    ["touchend", endTouch],
    ["touchcancel", endTouch],
    ["wheel", startScroll],
    ["keydown", onKey],
    ["scroll", onScroll],
    ["scrollend", settle],
  ];
  for (const [name, listener] of listeners) container.addEventListener(name, listener, { passive: true });
  return () => {
    cancel();
    for (const [name, listener] of listeners) container.removeEventListener(name, listener);
  };
};
