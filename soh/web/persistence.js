// Persists the game's files in IndexedDB, in two IDBFS mounts (each its own IndexedDB database):
// - /data: the app directory (settings, saves, presets, randomizer spoilers...). Export/Import Data works on this one.
// - /assets: the assets extracted from the player's ROM (see rom-setup.js).
//
// Both are loaded before main() runs. Writes go to memory as usual; afterwards the mounts are copied back to
// IndexedDB, shortly after the last change to /data and right away when the page is hidden or closed.

const SHIP_DATA_DIR = "/data";
const SHIP_SYNC_DELAY_MS = 500;

Module["preRun"] = [].concat(Module["preRun"] || [], () => {
    FS.mkdir(SHIP_DATA_DIR);
    FS.mount(IDBFS, {}, SHIP_DATA_DIR);
    FS.mkdir(SHIP_ASSETS_DIR);
    FS.mount(IDBFS, {}, SHIP_ASSETS_DIR);

    addRunDependency("ship-data-load");
    FS.syncfs(true, (err) => {
        if (err) {
            console.warn("Couldn't load saved data from IndexedDB; changes won't persist this session.", err);
        } else {
            shipWatchDataChanges();
        }
        // The game can't start without the ROM assets.
        shipEnsureRomAssets(() => removeRunDependency("ship-data-load"));
    });
});

let shipSyncTimer = null;
let shipSyncing = false;
let shipSyncAgain = false;
// Callbacks waiting for a sync that starts after they were queued.
let shipSyncWaiters = [];

function shipSaveData(onSaved) {
    clearTimeout(shipSyncTimer);
    shipSyncTimer = null;
    if (onSaved) {
        shipSyncWaiters.push(onSaved);
    }
    if (shipSyncing) {
        shipSyncAgain = true;
        return;
    }
    shipSyncing = true;
    const waiters = shipSyncWaiters;
    shipSyncWaiters = [];
    FS.syncfs(false, (err) => {
        shipSyncing = false;
        if (err) {
            console.warn("Couldn't save data to IndexedDB.", err);
        }
        waiters.forEach((callback) => callback(err));
        if (shipSyncAgain) {
            shipSyncAgain = false;
            shipSaveData();
        }
    });
}

function shipDataChanged(path) {
    if (typeof path !== "string" || !(path === SHIP_DATA_DIR || path.startsWith(SHIP_DATA_DIR + "/"))) {
        return;
    }
    clearTimeout(shipSyncTimer);
    shipSyncTimer = setTimeout(shipSaveData, SHIP_SYNC_DELAY_MS);
}

function shipWatchDataChanges() {
    // FS.trackingDelegate only exists in FS_DEBUG builds, so wrap the FS calls that modify files instead.
    const wrap = (name, getPath) => {
        const original = FS[name];
        FS[name] = function (...args) {
            const result = original.apply(this, args);
            shipDataChanged(getPath(...args));
            return result;
        };
    };
    wrap("write", (stream) => stream.path);
    wrap("truncate", (path) => path);
    wrap("ftruncate", (fd) => FS.getStream(fd)?.path);
    wrap("mkdir", (path) => path);
    wrap("rmdir", (path) => path);
    wrap("unlink", (path) => path);
    wrap("rename", (oldPath, newPath) => newPath);
    wrap("symlink", (oldPath, newPath) => newPath);

    // Don't wait for the delay when the page is going away.
    const flush = () => {
        if (shipSyncTimer !== null) {
            shipSaveData();
        }
    };
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
            flush();
        }
    });
    window.addEventListener("pagehide", flush);
}
