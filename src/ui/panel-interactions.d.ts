export function bindPanelInteractions(options: {
  panel: HTMLElement;
  documentRef?: Document;
  isOpen(): boolean;
  hasDialog?(): boolean;
  isTrigger?(event: Event): boolean;
  close(restoreFocus?: boolean): void;
  escape?(): void;
}): { reset(): void; destroy(): void };
