export function bindDialogViewport(element: HTMLElement, viewport?: Window): () => void;
export function createDialogBackdropHandlers(cancel: () => void): Record<'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel' | 'click', (event: PointerEvent) => void>;
