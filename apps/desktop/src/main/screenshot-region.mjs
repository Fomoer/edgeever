const START_CHANNEL = "desktop:screenshot-region-start";
const COMPLETE_CHANNEL = "desktop:screenshot-region-complete";
const CANCEL_CHANNEL = "desktop:screenshot-region-cancel";

let cancelActiveRegionSelection = null;

export const cancelScreenshotRegionSelection = () => {
  cancelActiveRegionSelection?.();
};

export const openScreenshotRegionSelector = ({
  BrowserWindow,
  ipcMain,
  display,
  image,
  copy,
  preloadPath,
  htmlPath,
}) => new Promise((resolve, reject) => {
  const displaySize = {
    width: Number(display?.size?.width) || Number(display?.bounds?.width) || 0,
    height: Number(display?.size?.height) || Number(display?.bounds?.height) || 0,
  };
  const bounds = display?.bounds;
  if (!bounds || displaySize.width <= 0 || displaySize.height <= 0) {
    reject(new Error("Screen capture is unavailable"));
    return;
  }

  let imageUrl = "";
  try {
    imageUrl = image?.toDataURL?.() || "";
  } catch (error) {
    reject(error);
    return;
  }
  if (!imageUrl) {
    reject(new Error("Screen capture is unavailable"));
    return;
  }

  let settled = false;
  let win = null;
  const detach = () => {
    ipcMain.removeListener(COMPLETE_CHANNEL, onComplete);
    ipcMain.removeListener(CANCEL_CHANNEL, onCancel);
    if (cancelActiveRegionSelection === finish) cancelActiveRegionSelection = null;
  };
  const finish = (selection) => {
    if (settled) return;
    settled = true;
    detach();
    const closing = win;
    win = null;
    if (closing && !closing.isDestroyed()) {
      closing.removeListener("closed", onClosed);
      closing.close();
    }
    resolve(selection);
  };
  const fail = (error) => {
    if (settled) return;
    settled = true;
    detach();
    const closing = win;
    win = null;
    if (closing && !closing.isDestroyed()) {
      closing.removeListener("closed", onClosed);
      closing.close();
    }
    reject(error instanceof Error ? error : new Error("Screen capture is unavailable"));
  };
  const onComplete = (event, payload) => {
    if (!win || win.isDestroyed() || event.sender !== win.webContents) return;
    if (payload?.full === true) {
      finish({ full: true });
      return;
    }
    const width = Number(payload?.width);
    const height = Number(payload?.height);
    const x = Number(payload?.x);
    const y = Number(payload?.y);
    if (![x, y, width, height].every(Number.isFinite)) return;
    finish({ x, y, width, height });
  };
  const onCancel = (event) => {
    if (!win || win.isDestroyed() || event.sender !== win.webContents) return;
    finish(null);
  };
  const onClosed = () => finish(null);

  ipcMain.on(COMPLETE_CHANNEL, onComplete);
  ipcMain.on(CANCEL_CHANNEL, onCancel);
  cancelActiveRegionSelection = finish;

  try {
    win = new BrowserWindow({
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height),
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      focusable: true,
      show: false,
      hasShadow: false,
      roundedCorners: false,
      thickFrame: false,
      enableLargerThanScreen: true,
      autoHideMenuBar: true,
      backgroundColor: "#111111",
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
  } catch (error) {
    fail(error);
    return;
  }

  win.setMenu(null);
  win.setMenuBarVisibility(false);
  win.on("closed", onClosed);
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("did-finish-load", () => {
    if (settled || !win || win.isDestroyed()) return;
    win.webContents.send(START_CHANNEL, {
      imageUrl,
      hint: copy?.hint || "",
      cancel: copy?.cancel || "",
      full: copy?.full || "",
      displayWidth: displaySize.width,
      displayHeight: displaySize.height,
    });
    win.setBounds({
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height),
    });
    win.show();
    try {
      win.setAlwaysOnTop(true, "screen-saver");
    } catch {
      win.setAlwaysOnTop(true);
    }
    win.moveTop?.();
    win.focus();
    win.webContents.on("will-navigate", (event) => event.preventDefault());
  });
  win.webContents.on("did-fail-load", (_event, _errorCode, _description, _url, isMainFrame) => {
    if (isMainFrame === false) return;
    fail(new Error("Screen capture is unavailable"));
  });
  win.loadFile(htmlPath).catch((error) => fail(error));
});
