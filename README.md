# ShipWeb

**An unofficial web port of [Ship of Harkinian](https://github.com/HarbourMasters/Shipwright): play Ocarina of Time in your browser.**

ShipWeb is Ship of Harkinian, the PC port of *The Legend of Zelda: Ocarina of Time* by [HarbourMasters](https://github.com/HarbourMasters), compiled to WebAssembly with a few changes so it runs in a web browser. Nearly all of the work is theirs: the game, the enhancements, the randomizer, the menus and the engine.

> [!IMPORTANT]
> ShipWeb is **not affiliated with or endorsed by HarbourMasters**. Please don't ask them for help with ShipWeb; open an issue here instead.
> For the real thing on Windows, Linux, macOS, Switch or Wii U, use the official [Ship of Harkinian](https://github.com/HarbourMasters/Shipwright) ([website](https://www.shipofharkinian.com), [Discord](https://discord.com/invite/harbourmasters)).

ShipWeb doesn't include any copyrighted assets. You need your own, legally obtained copy of the game. We do not condone piracy.

## Playing

1. **Open the page** in a recent desktop browser (Chrome, Edge or Firefox).
2. **Choose your ROM** the first time. ShipWeb builds the game's graphics, sounds and text from it, right in the browser; it takes under a minute and the ROM never leaves your computer. After that, the game starts directly.
   * Accepted files: `.z64`, `.n64` or `.v64`, uncompressed (32, 54 or 64 MB).
   * Supported versions: N64 NTSC 1.0, 1.1 and 1.2; N64 PAL 1.0 and 1.1; GameCube NTSC-U, NTSC-J, NTSC-J Collector's Edition and PAL; Master Quest NTSC-U, NTSC-J and PAL; and the PAL GameCube and Master Quest debug ROMs. You can check your dump at [ship.equipment](https://ship.equipment/).
3. **Play!** Press **Esc** to open the Ship of Harkinian menu, and **F11** (or *Settings → Graphics → Toggle Fullscreen*) for fullscreen.

### Your data

* Saves, settings and presets are kept in your browser's storage, so they're still there next time.
* *Settings → General → Export Data* downloads them as a `.zip`, and *Import Data* restores one (for backups, or to move to another browser). Importing only replaces the files in the zip, so a zip with just the `Save` folder only restores your saves.
* The data built from your ROM is stored separately and isn't part of the export. If you clear the site's data in your browser, you'll be asked for the ROM again.

### What's different from the PC version

* Network features (Crowd Control, Anchor, Sail) aren't available: browsers can't open the connections they need.
* Mods can't be loaded yet.
* Options that don't apply in a browser are hidden from the menu (renderer and audio backend, VSync, multiple windows, opening the app folder...).
* Keyboard, mouse and controllers work. Menu navigation with a controller (*Settings → General → Menu Controller Navigation*) uses the standard Xbox/PlayStation layout.

## Hosting

The build is a static website: serve the contents of the output folder (see below) with any web server or static hosting. A few notes:

* Some files are large (`soh.wasm` is ~28 MB), so check the per-file size limit of free hosting services.
* Serve `.wasm` files as `application/wasm` so they start faster.
* **Never host a build with the game's assets in it** (an `oot.o2r` in the `preload` folder, see below). That would be distributing Nintendo's content.

## Building

### Requirements

* [Git](https://git-scm.com/) and [CMake](https://cmake.org/) 3.26 or newer.
* The [Emscripten SDK](https://emscripten.org/docs/getting_started/downloads.html) (emsdk). ShipWeb is tested with Emscripten 6.0.12. On Windows emsdk also installs Ninja and Python; on Linux and macOS install `ninja` (and Python 3) with your package manager.

```bash
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk
./emsdk install 6.0.12
./emsdk activate 6.0.12
```

On Windows use `emsdk` instead of `./emsdk`.

### Build

Open a terminal with the emsdk environment loaded (`source ./emsdk_env.sh` on Linux and macOS, `emsdk_env.ps1` or `emsdk_env.bat` on Windows), then:

```bash
git clone --recursive https://github.com/samfisher753/ShipWeb.git
cd ShipWeb
emcmake cmake -S . -B build-web -G Ninja -DCMAKE_BUILD_TYPE=Release
cmake --build build-web --target soh
```

The first build takes a while. The website ends up in `build-web/soh`:

| File | What it is |
| - | - |
| `soh.html`, `soh.js`, `soh.wasm`, `soh.data` | The game |
| `extractor-worker.js`, `soh-extractor.js`, `soh-extractor.wasm` | The ROM extractor, run in a Web Worker |
| `yml/` | Asset metadata for each supported ROM version (only the one matching the player's ROM is downloaded) |

To try it locally, serve that folder and open `http://localhost:8000/soh.html`:

```bash
python -m http.server 8000 --directory build-web/soh
```

To rebuild after changing something, run the `cmake --build` line again.

### Development tips

* Everything in `build-web/preload` is bundled into `soh.data`. The build puts `soh.o2r` and `gamecontrollerdb.txt` there itself. If you also put an `oot.o2r` there (extracted from your ROM by the PC version, for example), the ROM screen is skipped. Handy while developing, but remember the warning in [Hosting](#hosting).
* The web-specific code is under `#ifdef __EMSCRIPTEN__`, plus the page and its scripts in [`soh/web`](soh/web).
* The game's log goes to the browser console.

## Credits

* [Ship of Harkinian](https://github.com/HarbourMasters/Shipwright) and [libultraship](https://github.com/Kenix3/libultraship) by HarbourMasters and their contributors.
* [Torch](https://github.com/HarbourMasters/Torch), the asset extractor.
* The [Ocarina of Time decompilation](https://github.com/zeldaret/oot) by ZeldaRET, which Ship of Harkinian is built on.
* The randomizer is based on [OoT Randomizer](https://github.com/TestRunnerSRL/OoT-Randomizer).

libultraship, Torch and the randomizer code are under the MIT license; see their `LICENSE` files.

*The Legend of Zelda* and *Ocarina of Time* are trademarks of Nintendo. ShipWeb is a fan project not affiliated with Nintendo.
