// Entry point of the web ROM extractor. It's a separate small module (just torch, no game) that runs inside a Web
// Worker (see soh/web/extractor-worker.js), so the page stays responsive during the minutes extraction takes.

#include <cstdint>
#include <filesystem>
#include <fstream>
#include <iterator>
#include <string>
#include <vector>

#include <emscripten.h>

#include "TorchExtract.h"

namespace fs = std::filesystem;

// Paths inside the worker's in-memory file system. The worker writes the ROM to kRomPath, and the yml package of
// the ROM's version is preloaded under kYmlDir.
static const char* kRomPath = "/rom.z64";
static const char* kYmlDir = "/yml";
static const char* kOutDir = "/out";

EM_JS(void, shipweb_extract_progress, (int done, int total), { postMessage({ type: "progress", done, total }); });

// Extracts kRomPath (big-endian, already validated) into kOutDir. versionDir is the ROM's directory under kYmlDir.
// Returns the archive name (oot.o2r or oot-mq.o2r), or an empty string if extraction failed.
extern "C" EMSCRIPTEN_KEEPALIVE const char* ShipWeb_ExtractRom(const char* versionDir) {
    static std::string archiveName;

    std::vector<uint8_t> rom;
    {
        std::ifstream romFile(kRomPath, std::ios::binary);
        rom.assign(std::istreambuf_iterator<char>(romFile), std::istreambuf_iterator<char>());
    }
    fs::remove(kRomPath);
    fs::create_directories(kOutDir);

    const int total = (int)SohTorch::CountAssetFiles(std::string(kYmlDir) + "/" + versionDir);
    int done = 0;
    archiveName = SohTorch::Extract(std::move(rom), kYmlDir, kOutDir, SHIPWEB_PORT_VERSION, nullptr, [&]() {
        done++;
        // Every asset would be thousands of messages; this is plenty for a progress bar.
        if (done % 20 == 0 || done == total) {
            shipweb_extract_progress(done, total);
        }
    });
    return archiveName.c_str();
}
