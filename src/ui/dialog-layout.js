const dialogCounts = new WeakMap();

// The independent QQJ dialog follows the visible viewport, including transformed hosts.
export function bindDialogViewport(element, viewport = globalThis) {
  const shadowHost = element.getRootNode?.().host;
  const host = shadowHost?.id === 'dollars-world-host' ? shadowHost : null;
  if (host) {
    dialogCounts.set(host, (dialogCounts.get(host) ?? 0) + 1);
    host.setAttribute('data-bmx-dialog-open', '');
  }
  const visual = viewport.visualViewport;
  const sync = () => {
    Object.assign(element.style, { left: '0px', top: '0px', width: `${visual?.width || viewport.innerWidth}px`, height: `${visual?.height || viewport.innerHeight}px` });
    const origin = element.getBoundingClientRect();
    element.style.left = `${(visual?.offsetLeft || 0) - origin.left}px`;
    element.style.top = `${(visual?.offsetTop || 0) - origin.top}px`;
  };
  const bindings = [[viewport, 'resize'], [viewport, 'scroll'], [viewport, 'orientationchange'], [visual, 'resize'], [visual, 'scroll']];
  sync();
  for (const [target, type] of bindings) target?.addEventListener(type, sync);
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    for (const [target, type] of bindings) target?.removeEventListener(type, sync);
    if (!host) return;
    const remaining = dialogCounts.get(host) - 1;
    if (remaining) dialogCounts.set(host, remaining);
    else {
      dialogCounts.delete(host);
      host.removeAttribute('data-bmx-dialog-open');
    }
  };
}

export function createDialogBackdropHandlers(cancel) {
  let gesture = null;
  const move = event => { if (gesture?.id === event.pointerId && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 5) gesture.moved = true; };
  return {
    pointerdown(event) { gesture = event.target === event.currentTarget && event.button === 0 && event.isPrimary !== false ? { id: event.pointerId, x: event.clientX, y: event.clientY, up: false, moved: false } : null; },
    pointermove: move,
    pointerup(event) { if (gesture?.id !== event.pointerId) { gesture = null; return; } move(event); gesture.up = event.target === event.currentTarget; },
    pointercancel() { gesture = null; },
    click(event) { const outside = gesture?.up && !gesture.moved && event.target === event.currentTarget; gesture = null; if (outside) cancel(); },
  };
}
