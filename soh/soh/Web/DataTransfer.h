#pragma once

#ifdef __EMSCRIPTEN__

// Moving the player's data (saves, settings, presets, spoilers...) in and out of the browser as a .zip file.
namespace ShipWeb {

// Zips the app directory and has the browser download it.
void ExportData();

// Lets the player pick a .zip made by ExportData. Its files replace the current ones (files not in the zip are kept),
// then the page reloads so the game picks them up.
void ImportData();

} // namespace ShipWeb

#endif
