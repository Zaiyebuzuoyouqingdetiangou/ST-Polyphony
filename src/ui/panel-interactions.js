// Current QQJ panel.js outside-tap and Escape chain, with the Vue shell's ownership hooks.
const windowSelector = 'dialog,[role~="dialog"],[role~="alertdialog"],[role~="menu"],[role~="listbox"],[role~="combobox"]';
const controlSelector = 'button,input,textarea,select,a[href],label,summary,[contenteditable]:not([contenteditable="false"]),[tabindex]:not([tabindex="-1"]),[role~="button"],[role~="link"],[role~="checkbox"],[role~="radio"],[role~="switch"],[role~="textbox"]';

export function bindPanelInteractions({ panel, documentRef = globalThis.document, isOpen, hasDialog = () => false, isTrigger = () => false, close, escape = () => close() }) {
  const host = panel.getRootNode().host;
  const viewport = documentRef.defaultView;
  const mobile = () => Number(viewport?.innerWidth) <= 640 || viewport?.matchMedia?.('(max-width: 640px)')?.matches === true;
  let gesture = null;
  const foreignWindow = path => path?.some(node => node !== panel && (
    node?.matches?.(windowSelector) || typeof node?.popover === 'string' && node.matches?.(':popover-open'))
    || node?.nodeType === 11 && node.host !== host && viewport?.getComputedStyle?.(node.host)?.position === 'fixed');
  const backdrop = event => {
    const path = event.composedPath?.();
    const inside = path?.includes(panel) ?? panel.contains(event.target);
    const rect = inside ? panel.getBoundingClientRect() : null;
    const outsidePoint = rect && (event.clientX < rect.left || event.clientX > rect.left + rect.width || event.clientY < rect.top || event.clientY > rect.top + rect.height);
    return mobile() && isOpen() && !hasDialog() && !foreignWindow(path) && !isTrigger(event) && (!inside || outsidePoint);
  };
  const move = event => {
    if (gesture?.id === event.pointerId && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 5) gesture.moved = true;
  };
  const down = event => { gesture = event.button === 0 && event.isPrimary !== false && backdrop(event)
    ? { id: event.pointerId, x: event.clientX, y: event.clientY, up: false, moved: false } : null; };
  const up = event => {
    if (gesture?.id !== event.pointerId) { gesture = null; return; }
    move(event); gesture.up = backdrop(event);
  };
  const reset = () => { gesture = null; };
  const click = event => {
    const outsideClick = gesture?.up && !gesture.moved && mobile() && isOpen() && !hasDialog();
    reset();
    if (!outsideClick) return;
    if (event.composedPath?.().includes(panel)) { event.preventDefault(); event.stopImmediatePropagation(); }
    close(false);
  };
  const keydown = event => {
    if (event.key !== 'Escape' || !isOpen() || event.defaultPrevented || event.isComposing || hasDialog()) return;
    const path = event.composedPath?.();
    if (!path?.includes(panel) && (foreignWindow(path) || path?.some(node => node?.matches?.(controlSelector)
      || ['true', 'menu', 'listbox', 'tree', 'grid', 'dialog'].includes(node?.getAttribute?.('aria-haspopup'))))) return;
    escape();
  };
  const bindings = [['pointerdown', down, true], ['pointermove', move, true], ['pointerup', up, true], ['pointercancel', reset, true], ['click', click, true], ['keydown', keydown, false]];
  for (const [name, listener, capture] of bindings) documentRef.addEventListener(name, listener, capture);
  return { reset, destroy() { reset(); for (const [name, listener, capture] of bindings) documentRef.removeEventListener(name, listener, capture); } };
}
