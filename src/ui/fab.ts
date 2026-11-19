export const FAB_HOST_ID = 'dollars-world-fab-host';
const POSITION_KEY = 'st-dollars-fab-pos';
const SIZE = 36;

type Position = { x: number; y: number };
type Viewport = { width: number; height: number; mobile: boolean; size: number };

export type FabPresentation = {
  icon: string;
  defaultPosition(viewport: Viewport): Position;
};

const clamp = (position: number, limit: number) => Math.max(0, Math.min(limit - SIZE, position));

/** Pointer capture, move threshold and per-viewport positions follow QQJ cache359's FAB. */
export function createFab({ presentation, onClick, documentRef = document, windowRef = window, storage }: {
  presentation: FabPresentation;
  onClick(event: MouseEvent): void;
  documentRef?: Document;
  windowRef?: Window;
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
}) {
  const view = (): Viewport => ({
    width: windowRef.innerWidth,
    height: windowRef.innerHeight,
    mobile: windowRef.innerWidth <= 640 || windowRef.matchMedia?.('(max-width: 640px)')?.matches === true,
    size: SIZE,
  });
  const readDesktop = (): Position | null => {
    try {
      const value = JSON.parse((storage ?? windowRef.localStorage)?.getItem(POSITION_KEY) || 'null');
      return Number.isFinite(value?.x) && Number.isFinite(value?.y) ? value : null;
    } catch { return null; }
  };
  let desktop = readDesktop();
  let mobile: Position | null = null;
  let gesture: { id: number; origin: Position; start: Position; dragging: boolean } | null = null;
  let suppressClick = false;

  const host = documentRef.createElement('div');
  host.id = FAB_HOST_ID;
  const root = host.attachShadow({ mode: 'open' });
  const style = documentRef.createElement('style');
  style.textContent = `
    :host{--qqj-focus-ring:calc(2px * var(--qqj-ui-scale,1));--qqj-motion-fast:150ms;position:fixed;z-index:10061;touch-action:none}
    button{width:${SIZE}px;height:${SIZE}px;box-sizing:border-box;border:1.5px solid color-mix(in srgb,var(--qqj-fab-primary) 45%,var(--qqj-fab-surface));border-radius:50%;background:transparent;color:var(--qqj-fab-ink);cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.4);touch-action:none;display:grid;place-items:center;padding:0;opacity:.45;transition:transform var(--qqj-motion-fast),box-shadow var(--qqj-motion-fast),color var(--qqj-motion-fast),background var(--qqj-motion-fast),opacity var(--qqj-motion-fast)}
    button:hover{transform:scale(1.1);box-shadow:0 6px 20px rgba(0,0,0,.5);opacity:1}
    button:active{transform:scale(.95)}
    button:focus-visible{outline:var(--qqj-focus-ring) solid var(--qqj-fab-ink);outline-offset:3px;opacity:1}
    svg{width:24px;height:24px;display:block;stroke-width:.777778}
    @media(prefers-reduced-motion:reduce){button{transition:none!important}button:hover,button:active{transform:none}}
  `;
  const button = documentRef.createElement('button');
  button.type = 'button';
  button.setAttribute('aria-label', '打开百面相');
  button.setAttribute('aria-pressed', 'false');
  button.innerHTML = presentation.icon;
  root.appendChild(style);
  root.appendChild(button);

  function position(point: Position, viewport = view()) {
    const x = clamp(point.x, viewport.width);
    const y = clamp(point.y, viewport.height);
    host.style.left = `${x}px`;
    host.style.top = `${y}px`;
    return { x, y };
  }

  function restore() {
    const viewport = view();
    position((viewport.mobile ? mobile : desktop) ?? presentation.defaultPosition(viewport), viewport);
  }

  function pointerDown(event: PointerEvent) {
    if (gesture || event.button !== 0 || event.isPrimary === false) return;
    const rect = host.getBoundingClientRect();
    gesture = { id: event.pointerId, origin: { x: rect.left, y: rect.top }, start: { x: event.clientX, y: event.clientY }, dragging: false };
    suppressClick = false;
    button.setPointerCapture?.(event.pointerId);
  }

  function pointerMove(event: PointerEvent) {
    if (!gesture || event.pointerId !== gesture.id) return;
    const dx = event.clientX - gesture.start.x;
    const dy = event.clientY - gesture.start.y;
    if (!gesture.dragging && Math.hypot(dx, dy) <= 5) return;
    gesture.dragging = true;
    event.preventDefault();
    position({ x: gesture.origin.x + dx, y: gesture.origin.y + dy });
  }

  function finish(pointerId: number, persist: boolean) {
    if (!gesture || pointerId !== gesture.id) return;
    const { dragging } = gesture;
    gesture = null;
    suppressClick = dragging || !persist;
    if (button.hasPointerCapture?.(pointerId)) button.releasePointerCapture(pointerId);
    if (!persist) { restore(); return; }
    if (!dragging) return;
    const rect = host.getBoundingClientRect();
    const viewport = view();
    const saved = position({ x: rect.left, y: rect.top }, viewport);
    if (viewport.mobile) { mobile = saved; return; }
    desktop = saved;
    try {
      (storage ?? windowRef.localStorage)?.setItem(POSITION_KEY, JSON.stringify({ x: Math.round(saved.x), y: Math.round(saved.y) }));
    } catch { /* The button remains usable if position storage is unavailable. */ }
  }

  button.addEventListener('pointerdown', pointerDown);
  button.addEventListener('pointermove', pointerMove);
  button.addEventListener('pointerup', event => finish(event.pointerId, true));
  button.addEventListener('pointercancel', event => finish(event.pointerId, false));
  button.addEventListener('lostpointercapture', event => finish(event.pointerId, false));
  button.addEventListener('click', event => {
    if (suppressClick && event.detail > 0) { suppressClick = false; event.preventDefault(); return; }
    onClick(event);
  });
  const resize = () => { if (gesture) finish(gesture.id, false); else restore(); };
  windowRef.addEventListener('resize', resize);
  restore();

  return {
    host,
    button,
    setVisible(enabled: boolean, shown: boolean) {
      const visible = enabled && shown;
      if (!visible && gesture) finish(gesture.id, false);
      host.style.display = visible ? '' : 'none';
      if (visible && !gesture) restore();
    },
    setPanelOpen(open: boolean) {
      button.setAttribute('aria-label', open ? '关闭百面相' : '打开百面相');
      button.setAttribute('aria-pressed', String(open));
    },
    setAppearance(palette: { knot: string; ink: string; panel: string }, scale: number) {
      host.style.setProperty('--qqj-fab-primary', palette.knot);
      host.style.setProperty('--qqj-fab-ink', palette.ink);
      host.style.setProperty('--qqj-fab-surface', palette.panel);
      host.style.setProperty('--qqj-ui-scale', String(scale));
    },
    destroy() {
      if (gesture) finish(gesture.id, false);
      windowRef.removeEventListener('resize', resize);
      host.remove();
    },
  };
}
