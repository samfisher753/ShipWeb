// Makes sure the game assets extracted from the player's ROM are in /assets before the game starts.
//
// The page ships no Nintendo content: the first time (or after a game update), the player picks their ROM, which is
// validated here like the desktop extractor does (soh/soh/Extractor/Extract.cpp) and extracted by torch in a Web
// Worker (extractor-worker.js). The resulting oot.o2r / oot-mq.o2r is kept in IndexedDB (see persistence.js).
// The page UI (shell.html) is reached through Module.romSetupUI.

const SHIP_ASSETS_DIR = "/assets";
// Records which game version the assets were extracted for; they must be re-extracted when it changes.
const SHIP_ASSETS_VERSION_FILE = SHIP_ASSETS_DIR + "/version";
const SHIP_ROM_ARCHIVES = ["oot.o2r", "oot-mq.o2r"];

// Supported ROMs by the version CRC in their header, with their asset metadata directory (soh/assets/yml).
// Listed in the order shown to the player.
const SHIP_ROM_VERSIONS = new Map([
    [0xec7011b7, { dir: "ntsc_1-0", name: "NTSC N64 1.0" }],
    [0xd43da81f, { dir: "ntsc_1-1", name: "NTSC N64 1.1" }],
    [0x693ba2ae, { dir: "ntsc_1-2", name: "NTSC N64 1.2" }],
    [0xb044b569, { dir: "pal_1-0", name: "PAL N64 1.0" }],
    [0xb2055fbd, { dir: "pal_1-1", name: "PAL N64 1.1" }],
    [0xf3dd35ba, { dir: "ntsc_u_gc", name: "NTSC-U GameCube" }],
    [0xf611f4ba, { dir: "ntsc_j_gc", name: "NTSC-J GameCube" }],
    [0xf7f52db8, { dir: "ntsc_j_gc_collection", name: "NTSC-J GameCube (Collector's Edition)" }],
    [0x09465ac3, { dir: "pal_gc", name: "PAL GameCube" }],
    [0xf034001a, { dir: "ntsc_u_mq", name: "NTSC-U Master Quest (GameCube)" }],
    [0xf43b45ba, { dir: "ntsc_j_mq", name: "NTSC-J Master Quest (GameCube)" }],
    [0x1d4136f3, { dir: "pal_mq", name: "PAL Master Quest (GameCube)" }],
    [0x871e1c92, { dir: "pal_gc_dbg", name: "PAL GameCube Debug" }],
    [0x917d18f6, { dir: "pal_mq_dbg", name: "PAL Master Quest Debug" }],
]);
const SHIP_PAL_MQ_DBG = 0x917d18f6;

// CRC32C of known good dumps (Extract.cpp goodCrcs).
const SHIP_GOOD_ROM_CRCS = new Set([
    0xfa8c0555, 0x8652ac4c, 0x5b8a1eb7, 0x1f731ffe, 0x044b3982, 0xeb15d7b9, 0xda8e61bf, 0x7a2fae68, 0xfd9913b1,
    0xe033fbba, 0x460c938c, 0xd0c76fa9, 0x3496ee47, 0xa25d1262, 0x15736a58, 0x83b8967d, 0xd61453de, 0x4129c825,
    0x11a4be61, 0x2bc6c6fd, 0x02cd974c,
]);

const SHIP_MB = 1024 * 1024;
const SHIP_ROM_SIZES = [32 * SHIP_MB, 54 * SHIP_MB, 64 * SHIP_MB];

function shipFileExists(path) {
    return FS.analyzePath(path).exists;
}

function shipHasRomAssets() {
    // Development builds can preload an archive next to the game instead.
    if (SHIP_ROM_ARCHIVES.some((name) => shipFileExists("/" + name))) {
        return true;
    }
    const extracted = SHIP_ROM_ARCHIVES.filter((name) => shipFileExists(SHIP_ASSETS_DIR + "/" + name));
    if (extracted.length === 0) {
        return false;
    }
    const version = shipFileExists(SHIP_ASSETS_VERSION_FILE)
        ? FS.readFile(SHIP_ASSETS_VERSION_FILE, { encoding: "utf8" })
        : "";
    if (version === SHIP_PORT_VERSION) {
        return true;
    }
    // Extracted by an older version of the game: the archive format may have changed.
    extracted.forEach((name) => FS.unlink(SHIP_ASSETS_DIR + "/" + name));
    return false;
}

// Called by persistence.js once IndexedDB is loaded. Calls onReady when the game can start.
function shipEnsureRomAssets(onReady) {
    if (shipHasRomAssets()) {
        onReady();
        return;
    }
    const ui = Module.romSetupUI;
    const updated = shipFileExists(SHIP_ASSETS_VERSION_FILE);
    ui.show({
        versions: [...SHIP_ROM_VERSIONS.values()].map((v) => v.name),
        updated,
        onRomChosen: (file) => shipExtractRom(file, ui, onReady),
    });
}

function shipCrc32c(bytes) {
    let table = shipCrc32c.table;
    if (!table) {
        table = shipCrc32c.table = new Uint32Array(256);
        for (let i = 0; i < 256; i++) {
            let c = i;
            for (let k = 0; k < 8; k++) {
                c = c & 1 ? 0x82f63b78 ^ (c >>> 1) : c >>> 1;
            }
            table[i] = c >>> 0;
        }
    }
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
        crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

// Converts a .v64 (16-bit swapped) or .n64 (little-endian) dump to .z64 (big-endian) in place.
function shipRomToBigEndian(rom) {
    if (rom[0] === 0x37) {
        for (let i = 0; i + 1 < rom.length; i += 2) {
            [rom[i], rom[i + 1]] = [rom[i + 1], rom[i]];
        }
    } else if (rom[0] === 0x40) {
        for (let i = 0; i + 3 < rom.length; i += 4) {
            [rom[i], rom[i + 1], rom[i + 2], rom[i + 3]] = [rom[i + 3], rom[i + 2], rom[i + 1], rom[i]];
        }
    }
}

// Returns the ROM's version entry, or throws an Error with a message for the player.
function shipValidateRom(rom) {
    const startsWith = (...bytes) => bytes.every((b, i) => rom[i] === b);
    if (startsWith(0x50, 0x4b, 0x03, 0x04) || startsWith(0x52, 0x61, 0x72, 0x21) ||
        startsWith(0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c)) {
        throw new Error("This file is compressed (zip, rar or 7z). Extract the ROM from it and choose that file.");
    }
    if (!SHIP_ROM_SIZES.includes(rom.length)) {
        throw new Error(`This file is ${(rom.length / SHIP_MB).toFixed(1)} MB; an Ocarina of Time ROM is 32, 54 ` +
                        "or 64 MB. Make sure you chose the right file.");
    }
    shipRomToBigEndian(rom);
    const view = new DataView(rom.buffer, rom.byteOffset, rom.byteLength);
    const versionCrc = view.getUint32(0x10);
    const version = SHIP_ROM_VERSIONS.get(versionCrc);
    if (!version) {
        throw new Error("This ROM isn't a supported version of Ocarina of Time.");
    }
    // The MQ debug ROM sometimes has its header patched to look like a US ROM; check it as if changed back.
    const region = rom[0x3e];
    if (versionCrc === SHIP_PAL_MQ_DBG) {
        rom[0x3e] = "P".charCodeAt(0);
    }
    const crc = shipCrc32c(rom);
    rom[0x3e] = region;
    if (!SHIP_GOOD_ROM_CRCS.has(crc)) {
        throw new Error(`This looks like the ${version.name} version, but the dump doesn't match a known good one ` +
                        "(it may be modified or a bad dump).");
    }
    return version;
}

async function shipExtractRom(file, ui, onReady) {
    let rom;
    let version;
    try {
        ui.setProgress(0, "Checking the ROM…");
        rom = new Uint8Array(await file.arrayBuffer());
        version = shipValidateRom(rom);
    } catch (e) {
        ui.showError(e.message);
        return;
    }

    ui.setProgress(0, `Extracting the game assets from your ${version.name} ROM…`);
    const worker = new Worker("extractor-worker.js");
    worker.onmessage = (event) => {
        const message = event.data;
        if (message.type === "progress") {
            ui.setProgress(message.done / message.total,
                           `Extracting the game assets from your ${version.name} ROM… ` +
                               `${Math.floor((100 * message.done) / message.total)}%`);
        } else if (message.type === "done") {
            worker.terminate();
            FS.writeFile(SHIP_ASSETS_DIR + "/" + message.name, new Uint8Array(message.data));
            FS.writeFile(SHIP_ASSETS_VERSION_FILE, SHIP_PORT_VERSION);
            ui.setProgress(1, "Saving…");
            shipSaveData((err) => {
                if (err) {
                    console.warn("The extracted assets couldn't be stored; the ROM will be needed again next time.");
                }
                ui.hide();
                onReady();
            });
        } else if (message.type === "error") {
            worker.terminate();
            console.error(message.message);
            ui.showError("Something went wrong while extracting the ROM. See the browser console for details.");
        }
    };
    worker.onerror = (event) => {
        worker.terminate();
        ui.showError("The extractor couldn't start: " + event.message);
    };
    worker.postMessage({ rom: rom.buffer, versionDir: version.dir }, [rom.buffer]);
}
