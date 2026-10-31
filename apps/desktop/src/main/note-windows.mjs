export const NOTE_WINDOW_QUERY_PARAM = "noteWindow";
export const NOTE_WINDOW_CLOSE_REQUEST_CHANNEL = "desktop:note-window-close-request";

const MEMO_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export const isValidNoteWindowMemoId = (value) => typeof value === "string" && MEMO_ID_PATTERN.test(value);

export const noteWindowUrl = (entryUrl, memoId) => {
  const url = new URL(entryUrl);
  url.searchParams.set(NOTE_WINDOW_QUERY_PARAM, memoId);
  return url.href;
};

/**
 * Tracks the separate note windows. A note is shown in at most one of them,
 * and a window closes only after its renderer confirms that pending edits were
 * saved, so closing never silently drops typing. A new window counts as open
 * only once its renderer reports that the note is shown; a window that fails
 * to load or crashes is closed so the note returns to the main window.
 */
export const createNoteWindowController = ({
  createWindow,
  showWindow,
  onChange = () => {},
  onFailed = () => {},
  forcedCloseTimeoutMs = 5_000,
  readyTimeoutMs = 30_000,
  now = () => Date.now(),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) => {
  const entries = new Map();
  const failureReasons = new Map();

  const list = () => [...entries.keys()];
  const live = (entry) => entry && !entry.window.isDestroyed();
  const entryForContents = (contents) => {
    for (const entry of entries.values()) {
      if (live(entry) && entry.window.webContents === contents) return entry;
    }
    return null;
  };

  const settleClose = (entry, closed) => {
    const request = entry.closeRequest;
    if (!request) return;
    entry.closeRequest = null;
    if (request.timer) clearTimer(request.timer);
    for (const resolve of request.waiters) resolve(closed);
  };

  const allowClose = (entry) => {
    entry.closeAllowed = true;
    if (live(entry)) entry.window.close();
  };

  const settleReady = (entry, ready) => {
    if (entry.readyTimer) clearTimer(entry.readyTimer);
    entry.readyTimer = null;
    for (const resolve of entry.readyWaiters.splice(0)) resolve(ready);
  };

  const failEntry = (entry, reason) => {
    // A window already being closed on purpose (by the user, on quit) aborts
    // its own load; that is not a failure to report.
    if (!live(entry) || entry.failed || entry.closeAllowed) return;
    entry.failed = true;
    failureReasons.set(entry.memoId, reason);
    const handedOff = entry.ready;
    settleReady(entry, false);
    entry.closeAllowed = true;
    // Destroy rather than close: a hung renderer may never finish closing,
    // and the note must not stay owned by a dead window.
    entry.window.destroy();
    // Before the handoff completed, the caller waiting for readiness tells
    // the user; afterwards nobody is waiting, so the main window must.
    onFailed(entry.memoId, reason, { handedOff });
  };

  const requestClose = (entry, { forced = false } = {}) => {
    if (!live(entry)) return Promise.resolve(true);
    // A crashed renderer, or one that has not shown the note yet, cannot
    // answer and has nothing unsaved beyond the local draft store.
    if (!entry.listening || entry.window.webContents.isCrashed?.()) {
      allowClose(entry);
      return Promise.resolve(true);
    }
    if (entry.closeRequest) {
      // Closing again after an unanswered request means the renderer is stuck.
      if (!forced && now() - entry.closeRequest.startedAt >= forcedCloseTimeoutMs) {
        allowClose(entry);
        return Promise.resolve(true);
      }
      if (forced && !entry.closeRequest.timer) {
        entry.closeRequest.timer = setTimer(() => allowClose(entry), forcedCloseTimeoutMs);
      }
      return new Promise((resolve) => entry.closeRequest.waiters.push(resolve));
    }
    return new Promise((resolve) => {
      entry.closeRequest = {
        startedAt: now(),
        waiters: [resolve],
        timer: forced ? setTimer(() => allowClose(entry), forcedCloseTimeoutMs) : null,
      };
      entry.window.webContents.send(NOTE_WINDOW_CLOSE_REQUEST_CHANNEL);
    });
  };

  const open = (memoId) => {
    if (!isValidNoteWindowMemoId(memoId)) throw new Error("Invalid note id");
    const existing = entries.get(memoId);
    // A failed window that is still going away is replaced, not reused.
    if (live(existing) && !existing.failed) {
      showWindow(existing.window);
      return { opened: false };
    }
    failureReasons.delete(memoId);
    const window = createWindow(memoId);
    const entry = {
      memoId, window, closeAllowed: false, closeRequest: null, listening: false,
      ready: false, readyWaiters: [], readyTimer: null, failed: false,
    };
    entries.set(memoId, entry);
    window.on("close", (event) => {
      if (entry.closeAllowed) return;
      event.preventDefault();
      void requestClose(entry);
    });
    window.on("closed", () => {
      settleClose(entry, true);
      settleReady(entry, false);
      if (entries.get(memoId) !== entry) return;
      entries.delete(memoId);
      onChange(list());
    });
    onChange(list());
    return { opened: true };
  };

  const focus = (memoId) => {
    const entry = entries.get(memoId);
    if (!live(entry)) return false;
    showWindow(entry.window);
    return true;
  };

  /** Why the window for this note failed, if it did. */
  const failureReason = (memoId) => failureReasons.get(memoId) ?? null;

  /** Resolves true once the window shows its note, false if it closes or fails first. */
  const waitUntilReady = (memoId) => {
    const entry = entries.get(memoId);
    if (!live(entry)) return Promise.resolve(false);
    if (entry.ready) return Promise.resolve(true);
    return new Promise((resolve) => {
      entry.readyWaiters.push(resolve);
      entry.readyTimer ??= setTimer(() => failEntry(entry, "timeout"), readyTimeoutMs);
    });
  };

  /** The renderer shows its note and owns it from now on. */
  const markReady = (contents) => {
    const entry = entryForContents(contents);
    if (!entry || entry.failed) return false;
    entry.ready = true;
    settleReady(entry, true);
    return true;
  };

  /** The window could not load or show its note, or its renderer is gone. */
  const fail = (contents, reason) => {
    const entry = entryForContents(contents);
    if (entry) failEntry(entry, reason);
    return Boolean(entry);
  };

  /** Deliver a main-window update to the window showing this note. */
  const sendTo = (memoId, channel, payload) => {
    const entry = entries.get(memoId);
    if (!live(entry) || entry.failed) return false;
    entry.window.webContents.send(channel, payload);
    return true;
  };

  /** The renderer is ready to answer close requests. */
  const markListening = (contents) => {
    const entry = entryForContents(contents);
    if (entry) entry.listening = true;
    return Boolean(entry);
  };

  /** The renderer answers a close request after trying to save. */
  const resolveClose = (contents, allowed) => {
    const entry = entryForContents(contents);
    if (!entry?.closeRequest) return false;
    if (allowed === true) {
      allowClose(entry);
      return true;
    }
    if (entry.closeRequest.timer) return false;
    settleClose(entry, false);
    return true;
  };

  /** Close every note window, waiting for saves up to the forced timeout. */
  const closeAll = () => Promise.all([...entries.values()].map((entry) => requestClose(entry, { forced: true })));

  return {
    closeAll,
    fail,
    failureReason,
    focus,
    has: (memoId) => live(entries.get(memoId)),
    isNoteWindowContents: (contents) => Boolean(entryForContents(contents)),
    list,
    markListening,
    markReady,
    memoIdForContents: (contents) => entryForContents(contents)?.memoId ?? null,
    open,
    resolveClose,
    sendTo,
    waitUntilReady,
  };
};
