import type { ClipboardState, SavePayload, SaveResult } from "./types";

declare global {
  interface Window {
    clipboardSidebar: {
      getState: () => Promise<ClipboardState>;
      setPaused: (paused: boolean) => Promise<ClipboardState>;
      deleteItem: (id: string) => Promise<ClipboardState>;
      clearItems: () => Promise<ClipboardState>;
      saveToObsidian: (payload: SavePayload) => Promise<SaveResult>;
      revealVault: () => Promise<string>;
      refresh: () => Promise<ClipboardState>;
      showMainWindow: () => Promise<ClipboardState>;
      toggleMainWindow: () => Promise<ClipboardState>;
      openExternal: (url: string) => Promise<boolean>;
      quitApp: () => Promise<void>;
      onStateChanged: (callback: (state: ClipboardState) => void) => () => void;
    };
  }
}

export {};
