# PixelPerfect Image Converter & Explorer

PixelPerfect is a professional-grade desktop application designed for high-precision image conversion, resizing, and compression. Built with a focus on speed and quality, it provides a seamless workflow for both casual users and professionals.

## 🚀 Key Features

- **Universal Conversion**: Support for all major formats including JPEG, PNG, WebP, BMP, TIFF, and GIF.
- **Automatic Format Detection**: Instantly identifies the format of uploaded images.
- **Precision Compression**: Target specific file sizes (KB) or use optimization strength sliders to balance quality and size.
- **Lossless Mode**: Maximize image quality for professional use cases.
- **Format Explorer**: A built-in encyclopedia explaining the pros, cons, and best use cases for every image format.
- **Dark Mode Support**: A sleek, eye-friendly interface that adapts to your preference.
- **Batch Processing**: Convert multiple images simultaneously with a single click.
- **Cross-Platform**: Available for Windows (Portable) and Linux (Debian/AppImage).

## 🛠 Technical Functions

- **Smart Resizing**: Maintains aspect ratio while optimizing for the web.
- **Real-time Status**: Track the processing state of every file in your queue.
- **Instant Preview**: Visual indicators for different file types (🎨 for PNG, 🖼 for WebP, 📷 for others).
- **One-Click Export**: Download converted files individually or export the entire processed batch.

## 💻 Installation

### Windows
1. Download the `PixelPerfect-Converter-Portable.exe` from the releases.
2. Run the executable directly (no installation required).

### Linux (Debian/Ubuntu)
1. Download the `.deb` package.
2. Install via terminal: `sudo dpkg -i pixelperfect-converter_1.0.0_amd64.deb`
3. Or use the `.AppImage` for a portable experience.

## 🛠 Development & Building

If you wish to build the application from source:

1. **Clone the repository**
2. **Install dependencies**: `npm install`
3. **Run in development mode**: `npm run electron:dev`
4. **Build installers**: `npm run electron:build`

---
*Created with precision by the PixelPerfect Team.*
