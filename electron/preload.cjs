const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("clipboardSidebar", {
  getState: () => ipcRenderer.invoke("clipboard:get-state"),
  setPaused: (paused) => ipcRenderer.invoke("clipboard:set-paused", paused),
  deleteItem: (id) => ipcRenderer.invoke("clipboard:delete-item", id),
  clearItems: () => ipcRenderer.invoke("clipboard:clear-items"),
  saveToObsidian: (payload) => ipcRenderer.invoke("clipboard:save-to-obsidian", payload),
  revealVault: () => ipcRenderer.invoke("clipboard:reveal-vault"),
  refresh: () => ipcRenderer.invoke("clipboard:refresh"),
  showMainWindow: () => ipcRenderer.invoke("window:show-main"),
  toggleMainWindow: () => ipcRenderer.invoke("window:toggle-main"),
  openExternal: (url) => ipcRenderer.invoke("shell:open-external", url),
  quitApp: () => ipcRenderer.invoke("app:quit"),
  onStateChanged: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("clipboard:state-changed", listener);
    return () => ipcRenderer.removeListener("clipboard:state-changed", listener);
  }
});
