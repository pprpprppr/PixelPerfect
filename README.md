# PixelPerfect Image Converter & Explorer

[![Release](https://img.shields.io/badge/version-1.3.0-indigo.svg)](https://github.com/pprpprppr/PixelPerfect/releases)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20Android-blue.svg)](https://github.com/pprpprppr/PixelPerfect/releases)
[![License](https://img.shields.io/badge/license-Apache%202.0-green.svg)](LICENSE)

**PixelPerfect** is a high-performance cross-platform application designed for instant image conversion, intelligent resizing, and precision compression. Built with React, TypeScript, Tailwind CSS, Electron (Desktop), and native Android WebView, it delivers fast offline workflows across Windows, Linux, and Android.

---

## ⚡ What's New in v1.3.0

- 🧠 **Perceptual SSIM Rate-Distortion Auto-Optimization**: Computes fast 8×8 Structural Similarity (SSIM) on luminance blocks and binary-searches the lowest bitrate that mathematically preserves visual fidelity (`Visually Lossless 98.5%+`, `Balanced 97.0%+`, or `Max Savings 94.5%+`).
- 🎨 **Advanced Adaptive PNG Compression Engine**: Pure cross-platform TypeScript encoder applying lossless color-type reduction (RGBA → RGB / Grayscale / Indexed-8), perceptual Median-Cut palette quantization with Floyd-Steinberg dithering, 5-predictor adaptive scanline filtering (`None/Sub/Up/Avg/Paeth`), and Level-9 zlib deflate—shrinking PNGs by **40%–85%** across Windows, Linux, and Android.
- 🧹 **Edge-Preserving ISO Grain & Noise Cleaner**: Optional 3×3 bilateral-style pre-filter that strips invisible sensor noise while keeping text and sharp edges crisp, cutting JPEG/WebP/PNG bitrates an additional **10%–30%**.
- 🛡️ **Same-Format Size Safeguard & Real-Time Fidelity Badges**: Displays exact measured SSIM scores and optimization engines in both the queue and comparison modal, and never outputs a larger file on same-format conversions without resizing.

## ⚡ Previous Releases

- **v1.2.0**: Ultra-light native Android APK (~240 KB), explicit White & Dark themes, responsive mobile UI, and thumbnail/canvas memory optimizations.

- 📱 **Android App Support (~240 KB APK)**: Ultra-lightweight native Android shell using the system WebView with zero bloated third-party SDKs, R8 minification, resource shrinking, native multi-image gallery picker, and direct `MediaStore` saving to `Downloads/PixelPerfect/`.
- 🎨 **Explicit White & Dark Themes**: Crisp White and deep Dark themes with proper Tailwind v4 class-based theming, an explicit `White / Dark` switcher pill, persistent theme storage, and synchronized Android system status/navigation bars.
- 🧠 **Memory Optimizations**:
  - Generates lightweight `<=96px` thumbnail previews in the queue instead of keeping full multi-megabyte camera bitmaps decoded in DOM memory (>95% RAM reduction for large photo batches).
  - Uses `createImageBitmap` pre-scaled decoding when resizing down and immediately releases canvas backing stores (`width = 0; height = 0`) after encoding.
  - Adaptive worker concurrency (`2` workers on mobile/low-RAM devices, `4` on desktop) and automatic `onTrimMemory` cache cleanup on Android.
- 📲 **Responsive Mobile & Desktop UI**: Seamless layout adapting between the 3-column desktop workspace and touch-friendly mobile tabs (`Queue`, `Settings`, `Formats`).

## ⚡ Previous Releases

- **v1.1.1**: Desktop storage optimizations (-71 MB Linux / -101 MB Windows via locale trimming, `app.asar` cleanup, and unused binary removal).
- **v1.1.0**: Zero launch delay fixes, native BMP & TIFF 6.0 encoders, AVIF support, parallel batch worker pool, one-click ZIP export, side-by-side comparison modal, copy to clipboard, and dynamic aspect ratio lock.

---

## 💻 Downloads & Installation

### Android (7.0+)
1. Download **`PixelPerfect-Converter-1.3.0-Android.apk`** (~245 KB) from [Releases](https://github.com/pprpprppr/PixelPerfect/releases).
2. Install the APK on your device. Converted images and `.zip` archives are saved directly to `Downloads/PixelPerfect/`.

### Windows (10 / 11 64-bit)
1. Download **`PixelPerfect-Converter-1.3.0-Portable.exe`** from [Releases](https://github.com/pprpprppr/PixelPerfect/releases).
2. Run directly—no installation or admin rights required.

### Linux (Debian / Ubuntu / Mint / Pop!_OS)
1. Download **`pixelperfect-converter_1.3.0_amd64.deb`** from [Releases](https://github.com/pprpprppr/PixelPerfect/releases).
2. Install via terminal:
   ```bash
   sudo dpkg -i pixelperfect-converter_1.3.0_amd64.deb
   ```

---

## 🛠 Building from Source

```bash
# Install dependencies
npm install

# Desktop development mode
npm run electron:dev

# Build Desktop packages (.deb and portable .exe)
npm run electron:build

# Build Android APK (requires Android SDK + Gradle)
npm run android:build
```

---

## ↩️ Rollback Instructions

A clean rollback checkpoint before the theme/Android updates is preserved on both tag `v1.1.1` and branch `rollback/v1.1.1-desktop-only`:

```bash
# Switch to the pre-Android desktop-only state
git checkout rollback/v1.1.1-desktop-only

# Or reset main back to v1.1.1
git reset --hard v1.1.1
```

---

*Crafted with precision by the PixelPerfect Team.*
