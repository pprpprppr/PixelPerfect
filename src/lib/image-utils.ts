import imageCompression from 'browser-image-compression';

export type OutputFormat = 
  | 'image/jpeg' 
  | 'image/png' 
  | 'image/webp' 
  | 'image/avif'
  | 'image/bmp' 
  | 'image/tiff' 
  | 'image/gif';

export interface ProcessingOptions {
  format: OutputFormat;
  targetSizeKB?: number;
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0.0 to 1.0
  stripMetadata?: boolean;
  progressive?: boolean;
  backgroundColor?: string; // Default #ffffff for formats without transparency
}

export interface ProcessedImage {
  blob: Blob;
  url: string;
  name: string;
  size: number;
  width: number;
  height: number;
  format: OutputFormat;
  originalSize: number;
  originalWidth: number;
  originalHeight: number;
}

/**
 * Pure TypeScript BMP Encoder
 * Encodes standard 32-bit BGRA uncompressed BMP format
 */
export function encodeBMP(imageData: ImageData): Blob {
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;
  
  // 32-bit BMP: 4 bytes per pixel, row size already 4-byte aligned
  const rowSize = width * 4;
  const pixelArraySize = rowSize * height;
  const fileHeaderSize = 14;
  const infoHeaderSize = 40;
  const fileSize = fileHeaderSize + infoHeaderSize + pixelArraySize;
  
  const buffer = new ArrayBuffer(fileSize);
  const view = new DataView(buffer);
  
  // BITMAPFILEHEADER
  view.setUint16(0, 0x4D42, true); // 'BM'
  view.setUint32(2, fileSize, true); // File size
  view.setUint16(6, 0, true); // Reserved
  view.setUint16(8, 0, true); // Reserved
  view.setUint32(10, fileHeaderSize + infoHeaderSize, true); // Offset to pixel data
  
  // BITMAPINFOHEADER
  view.setUint32(14, infoHeaderSize, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true); // Bottom-up bitmap
  view.setUint16(26, 1, true); // 1 plane
  view.setUint16(28, 32, true); // 32 bits per pixel
  view.setUint32(30, 0, true); // BI_RGB (uncompressed)
  view.setUint32(34, pixelArraySize, true);
  view.setInt32(38, 2835, true); // ~72 DPI horizontal
  view.setInt32(42, 2835, true); // ~72 DPI vertical
  view.setUint32(46, 0, true); // 0 colors in palette
  view.setUint32(50, 0, true); // all colors important
  
  // Scanlines in BMP are stored bottom to top, BGRA format
  let offset = fileHeaderSize + infoHeaderSize;
  for (let y = height - 1; y >= 0; y--) {
    const rowOffset = y * width * 4;
    for (let x = 0; x < width; x++) {
      const idx = rowOffset + x * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];
      
      view.setUint8(offset++, b);
      view.setUint8(offset++, g);
      view.setUint8(offset++, r);
      view.setUint8(offset++, a);
    }
  }
  
  return new Blob([buffer], { type: 'image/bmp' });
}

/**
 * Pure TypeScript Baseline TIFF Encoder
 * Encodes standard Little-Endian 32-bit RGBA TIFF 6.0 format
 */
export function encodeTIFF(imageData: ImageData): Blob {
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;
  
  const numTags = 12;
  const headerSize = 8;
  const ifdSize = 2 + numTags * 12 + 4; // count + tags + nextIFD
  const extraDataOffset = headerSize + ifdSize;
  
  // Extra data:
  // - BitsPerSample: 4 x 16-bit uints = 8 bytes
  // - XResolution: rational (72/1) = 8 bytes
  // - YResolution: rational (72/1) = 8 bytes
  const bitsPerSampleOffset = extraDataOffset;
  const xResOffset = bitsPerSampleOffset + 8;
  const yResOffset = xResOffset + 8;
  const pixelDataOffset = yResOffset + 8;
  
  const pixelDataSize = width * height * 4;
  const totalFileSize = pixelDataOffset + pixelDataSize;
  
  const buffer = new ArrayBuffer(totalFileSize);
  const view = new DataView(buffer);
  
  // TIFF Header
  view.setUint16(0, 0x4949, true); // 'II' Little-Endian
  view.setUint16(2, 42, true); // Magic 42
  view.setUint32(4, 8, true); // Offset to first IFD
  
  // IFD: tag count
  view.setUint16(8, numTags, true);
  
  let tagIdx = 10;
  function writeTag(tag: number, type: number, count: number, valueOrOffset: number) {
    view.setUint16(tagIdx, tag, true);
    view.setUint16(tagIdx + 2, type, true);
    view.setUint32(tagIdx + 4, count, true);
    view.setUint32(tagIdx + 8, valueOrOffset, true);
    tagIdx += 12;
  }
  
  // Type: 3 = SHORT, 4 = LONG, 5 = RATIONAL
  writeTag(256, 4, 1, width); // ImageWidth
  writeTag(257, 4, 1, height); // ImageLength
  writeTag(258, 3, 4, bitsPerSampleOffset); // BitsPerSample [8,8,8,8]
  writeTag(259, 3, 1, 1); // Compression: 1 = uncompressed
  writeTag(262, 3, 1, 2); // PhotometricInterpretation: 2 = RGB
  writeTag(273, 4, 1, pixelDataOffset); // StripOffsets
  writeTag(277, 3, 1, 4); // SamplesPerPixel: 4 (RGBA)
  writeTag(278, 4, 1, height); // RowsPerStrip
  writeTag(279, 4, 1, pixelDataSize); // StripByteCounts
  writeTag(282, 5, 1, xResOffset); // XResolution
  writeTag(283, 5, 1, yResOffset); // YResolution
  writeTag(296, 3, 1, 2); // ResolutionUnit: 2 = inch
  
  view.setUint32(tagIdx, 0, true); // Next IFD (none)
  
  // BitsPerSample values [8, 8, 8, 8]
  view.setUint16(bitsPerSampleOffset, 8, true);
  view.setUint16(bitsPerSampleOffset + 2, 8, true);
  view.setUint16(bitsPerSampleOffset + 4, 8, true);
  view.setUint16(bitsPerSampleOffset + 6, 8, true);
  
  // XResolution: 72 / 1
  view.setUint32(xResOffset, 72, true);
  view.setUint32(xResOffset + 4, 1, true);
  // YResolution: 72 / 1
  view.setUint32(yResOffset, 72, true);
  view.setUint32(yResOffset + 4, 1, true);
  
  // Pixel Data (RGBA copy)
  new Uint8Array(buffer, pixelDataOffset, pixelDataSize).set(data);
  
  return new Blob([buffer], { type: 'image/tiff' });
}

/**
 * Calculates proportional target dimensions preserving aspect ratio
 */
export function calculateDimensions(
  origWidth: number,
  origHeight: number,
  maxWidth?: number,
  maxHeight?: number
): { width: number; height: number } {
  if (!maxWidth && !maxHeight) {
    return { width: origWidth, height: origHeight };
  }

  let ratio = 1;
  if (maxWidth && maxHeight) {
    ratio = Math.min(maxWidth / origWidth, maxHeight / origHeight);
  } else if (maxWidth) {
    ratio = maxWidth / origWidth;
  } else if (maxHeight) {
    ratio = maxHeight / origHeight;
  }

  return {
    width: Math.max(1, Math.round(origWidth * ratio)),
    height: Math.max(1, Math.round(origHeight * ratio)),
  };
}

/**
 * Process a single image file with high-fidelity encoding and optimization
 */
export async function processImage(
  file: File,
  options: ProcessingOptions
): Promise<ProcessedImage> {
  const { 
    format, 
    targetSizeKB, 
    maxWidth, 
    maxHeight, 
    quality = 0.82,
    backgroundColor = '#ffffff'
  } = options;

  // 1. Load source image to read native dimensions
  const img = new Image();
  const fileUrl = URL.createObjectURL(file);
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load image file'));
      img.src = fileUrl;
    });
  } finally {
    URL.revokeObjectURL(fileUrl);
  }

  const origWidth = img.naturalWidth || img.width;
  const origHeight = img.naturalHeight || img.height;
  const { width: targetWidth, height: targetHeight } = calculateDimensions(
    origWidth,
    origHeight,
    maxWidth,
    maxHeight
  );

  // 2. Set up offscreen canvas
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not initialize 2D canvas context');

  // Handle transparency for formats that do not support alpha channel
  const needsBackground = format === 'image/jpeg' || format === 'image/bmp';
  if (needsBackground) {
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, targetWidth, targetHeight);
  }

  // Draw image with smooth bicubic scaling
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

  let processedBlob: Blob;

  // 3. Encode depending on target format
  if (format === 'image/bmp') {
    const imgData = ctx.getImageData(0, 0, targetWidth, targetHeight);
    processedBlob = encodeBMP(imgData);
  } else if (format === 'image/tiff') {
    const imgData = ctx.getImageData(0, 0, targetWidth, targetHeight);
    processedBlob = encodeTIFF(imgData);
  } else {
    // Standard formats: JPEG, PNG, WebP, AVIF, GIF
    // Use canvas toBlob with fallback
    const targetMime = (format === 'image/avif' && !isFormatSupported('image/avif')) 
      ? 'image/webp' 
      : format;

    // Direct canvas toBlob encoding
    processedBlob = await new Promise<Blob>((resolve) => {
      canvas.toBlob((b) => {
        if (b) {
          resolve(b);
        } else {
          // Fallback if mime not supported
          canvas.toBlob((fallback) => resolve(fallback!), 'image/png');
        }
      }, targetMime, quality);
    });

    // 4. Strict Target Size Enforcement (if user specified target size in KB)
    if (targetSizeKB && (format === 'image/jpeg' || format === 'image/webp' || format === 'image/avif')) {
      const targetBytes = targetSizeKB * 1024;
      let low = 0.05;
      let high = quality;
      let bestBlob = processedBlob;
      let iterations = 0;

      while (iterations < 6) {
        const mid = (low + high) / 2;
        const currentBlob = await new Promise<Blob>((resolve) => {
          canvas.toBlob((b) => resolve(b || bestBlob), targetMime, mid);
        });

        const diffRatio = Math.abs(currentBlob.size - targetBytes) / targetBytes;
        if (currentBlob.size <= targetBytes) {
          bestBlob = currentBlob;
          if (diffRatio < 0.04) break; // Within 4% of target size, early exit
          low = mid;
        } else {
          high = mid;
        }
        iterations++;
      }
      processedBlob = bestBlob;
    }
  }

  const extensions: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/avif': '.avif',
    'image/bmp': '.bmp',
    'image/tiff': '.tiff',
    'image/gif': '.gif'
  };

  const finalUrl = URL.createObjectURL(processedBlob);
  const ext = extensions[format] || '.jpg';
  const baseName = file.name.replace(/\.[^/.]+$/, "");

  return {
    blob: processedBlob,
    url: finalUrl,
    name: `${baseName}${ext}`,
    size: processedBlob.size,
    width: targetWidth,
    height: targetHeight,
    format: format,
    originalSize: file.size,
    originalWidth: origWidth,
    originalHeight: origHeight,
  };
}

/**
 * Check if the browser / Chromium engine supports a given mime type for encoding
 */
export function isFormatSupported(mimeType: string): boolean {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const dataUrl = canvas.toDataURL(mimeType);
    return dataUrl.startsWith(`data:${mimeType}`);
  } catch {
    return false;
  }
}

/**
 * Format bytes into human-readable string (KB, MB, etc.)
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
