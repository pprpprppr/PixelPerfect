# PixelPerfect Image Converter & Explorer

[![Release](https://img.shields.io/badge/version-1.1.1-indigo.svg)](https://github.com/pprpprppr/PixelPerfect/releases)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux-blue.svg)](https://github.com/pprpprppr/PixelPerfect/releases)
[![License](https://img.shields.io/badge/license-Apache%202.0-green.svg)](LICENSE)

**PixelPerfect** is a high-performance desktop application designed for instant image conversion, intelligent resizing, and precision compression. Built with Electron, Vite, React, and TypeScript, it delivers native desktop speed and zero-latency offline workflows.

---

## ⚡ What's New in v1.1.1

- 💾 **Storage & Bundle Optimization**: Trimmed unused Electron locales (~45 MB), removed redundant bundled `node_modules` from `app.asar` (~1.7 MB), stripped unused 19 MB Chromium license dump and 26.5 MB WebGPU DXC compiler DLLs (Windows), cutting installed disk footprint by ~70–95 MB without sacrificing any features or startup speed.

## ⚡ What's New in v1.1.0

- 🚀 **Zero Launch Delay & Fast Startup**: Optimized Electron lifecycle with `ready-to-show` rendering, pre-warmed GPU rasterization, single-instance lock, and removed blocking remote font calls for instantaneous startup.
- 🖼 **Universal High-Fidelity Formats**:
  - **AVIF**: Next-gen image format with up to 50% better compression than WebP.
  - **True BMP & TIFF**: Pure client-side binary encoders producing valid 32-bit BMP and TIFF 6.0 files.
  - **WebP, JPEG, PNG, GIF**: Full lossy and lossless support.
- ⚡ **High-Speed Parallel Processing**: Batch conversion running across 4 concurrent worker threads with real-time progress tracking.
- 📦 **One-Click Batch ZIP Export**: Download all converted images bundled into a single `.zip` file with one click.
- 🔍 **Interactive Side-by-Side Comparison**: Inspect Before vs. After results with side-by-side zoom, exact dimensions, and percentage of storage saved.
- 📋 **Copy to System Clipboard**: Copy converted images directly to clipboard with a single click.
- 📐 **Proportional Resizing with Dynamic Aspect Ratio Lock**: Smart recalculation of width and height preserving natural aspect ratios.
- 🎨 **Transparency Background Control**: Select custom fill colors (white, black, or custom hex) when converting transparent images to formats without alpha channels (e.g., JPEG, BMP).
- 🌙 **Persistent Theme**: Automatic system color scheme detection and persistent Dark/Light mode toggle.
- 🎯 **Keyboard Shortcuts**:
  - `Ctrl+O` / `Cmd+O`: Open files
  - `Ctrl+Enter` / `Cmd+Enter`: Convert batch
  - `Escape`: Close comparison modal

---

## 🚀 Key Features

- **Universal Conversion**: Seamless conversion between AVIF, WebP, JPEG, PNG, BMP, TIFF, and GIF.
- **Precision Target File Size**: Specify a target size in KB (e.g. 200 KB) and PixelPerfect performs binary search optimization to hit the target.
- **Lossless Mode**: 100% pixel fidelity for graphic design and archival preservation.
- **Format Explorer**: Built-in interactive guide outlining technical trade-offs, compression ratios, and optimal use cases for each image format.
- **Full Window Drag & Drop**: Animated dropzone with drag-counter tracking across the entire window.

---

## 💻 Downloads & Installation

### Windows
1. Download **`PixelPerfect-Converter-1.1.1-Portable.exe`** from the [Releases](https://github.com/pprpprppr/PixelPerfect/releases).
2. Run directly—no installation or admin rights required.

### Linux (Debian / Ubuntu / Mint / Pop!_OS)
1. Download **`pixelperfect-converter_1.1.1_amd64.deb`** from the [Releases](https://github.com/pprpprppr/PixelPerfect/releases).
2. Install via terminal:
   ```bash
   sudo dpkg -i pixelperfect-converter_1.1.1_amd64.deb
   ```
   Or open with your distribution's Software Installer.

---

## 🛠 Building from Source

```bash
# 1. Clone the repository
git clone https://github.com/pprpprppr/PixelPerfect.git
cd PixelPerfect

# 2. Install dependencies
npm install

# 3. Run in development mode
npm run electron:dev

# 4. Build production packages (.deb and portable .exe)
npm run electron:build
```

---

*Crafted with precision by the PixelPerfect Team.*
