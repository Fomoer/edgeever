const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("edgeeverScreenshotRegion", {
  onStart(callback) {
    ipcRenderer.on("desktop:screenshot-region-start", (_event, payload) => callback(payload));
  },
  complete(selection) {
    ipcRenderer.send("desktop:screenshot-region-complete", selection);
  },
  cancel() {
    ipcRenderer.send("desktop:screenshot-region-cancel");
  },
});
