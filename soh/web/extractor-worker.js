// Web Worker that extracts the game assets from the player's ROM with torch (soh-extractor.js/.wasm).
//
// Message in:  { rom: ArrayBuffer (big-endian, validated), versionDir: "pal_gc", ... }
// Messages out: { type: "progress", done, total }
//               { type: "done", name: "oot.o2r", data: ArrayBuffer }
//               { type: "error", message }

self.onmessage = (event) => {
    const { rom, versionDir } = event.data;

    self.Module = {
        // The yml package (yml/<version>.data) sits in its own folder next to this script.
        locateFile: (path) => (path.endsWith(".data") ? "yml/" + path : path),
        print: (text) => console.log("[extractor]", text),
        printErr: (text) => console.error("[extractor]", text),
        onRuntimeInitialized() {
            try {
                Module.FS.writeFile("/rom.z64", new Uint8Array(rom));
                const name = Module.ccall("ShipWeb_ExtractRom", "string", ["string"], [versionDir]);
                if (!name) {
                    postMessage({ type: "error", message: "The extraction failed." });
                    return;
                }
                const data = Module.FS.readFile("/out/" + name);
                postMessage({ type: "done", name, data: data.buffer }, [data.buffer]);
            } catch (e) {
                postMessage({ type: "error", message: String(e) });
            }
        },
        onAbort(what) {
            postMessage({ type: "error", message: "The extractor crashed: " + what });
        },
    };

    try {
        // The package registers itself with Module before the extractor starts, so its files are ready by then.
        importScripts("yml/" + versionDir + ".js", "soh-extractor.js");
    } catch (e) {
        postMessage({ type: "error", message: "Couldn't load the extractor: " + e.message });
    }
};
