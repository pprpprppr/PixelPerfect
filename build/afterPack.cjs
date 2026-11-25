const fs = require('fs');
const path = require('path');

/**
 * Post-pack hook for electron-builder to reduce installed disk footprint
 * without impacting runtime performance or application features.
 */
exports.default = async function afterPack(context) {
  const { appOutDir, electronPlatformName } = context;

  // 1. Remove 19 MB Chromium third-party license dump HTML (keep LICENSE.electron.txt)
  const chromiumLicenses = path.join(appOutDir, 'LICENSES.chromium.html');
  if (fs.existsSync(chromiumLicenses)) {
    fs.unlinkSync(chromiumLicenses);
  }

  // 2. Ensure only en-US.pak remains in locales/ (~45 MB saved)
  const localesDir = path.join(appOutDir, 'locales');
  if (fs.existsSync(localesDir)) {
    for (const file of fs.readdirSync(localesDir)) {
      if (file !== 'en-US.pak') {
        fs.unlinkSync(path.join(localesDir, file));
      }
    }
  }

  // 3. On Windows, strip unused WebGPU DirectX Shader Compiler DLLs (~26.5 MB saved)
  if (electronPlatformName === 'win32') {
    for (const unusedDll of ['dxcompiler.dll', 'dxil.dll']) {
      const dllPath = path.join(appOutDir, unusedDll);
      if (fs.existsSync(dllPath)) {
        fs.unlinkSync(dllPath);
      }
    }
  }
};
