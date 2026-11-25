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

export interface AndroidBridge {
  saveFile?: (base64Data: string, fileName: string, mimeType: string) => string;
  setTheme?: (isDark: boolean) => void;
  isAndroid?: () => boolean;
}

declare global {
  interface Window {
    PixelPerfectAndroid?: AndroidBridge;
  }
}

/**
 * Determine safe worker concurrency based on device memory & platform
 * Prevents OOM on Android/mobile devices while preserving 4-way speed on desktop
 */
export function getOptimalConcurrency(): number {
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || !!window.PixelPerfectAndroid;
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (isMobile || (deviceMemory !== undefined && deviceMemory <= 4)) {
    return 2;
  }
  return 4;
}

/**
 * Release GPU/Skia backing memory for a canvas immediately
 */
function releaseCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
}

/**
 * Create a lightweight <=96px thumbnail object URL and extract native dimensions
 * Avoids decoding full-resolution multi-megabyte camera photos just for UI list rows
 */
export async function createThumbnail(
  file: File,
  maxSize = 96
): Promise<{ previewUrl: string; width: number; height: number }> {
  const rawUrl = URL.createObjectURL(file);
  const img = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to probe image'));
      img.src = rawUrl;
    });

    const origWidth = img.naturalWidth || img.width;
    const origHeight = img.naturalHeight || img.height;

    if (origWidth <= maxSize && origHeight <= maxSize) {
      return { previewUrl: rawUrl, width: origWidth, height: origHeight };
    }

    const { width, height } = calculateDimensions(origWidth, origHeight, maxSize, maxSize);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    try {
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return { previewUrl: rawUrl, width: origWidth, height: origHeight };
      }
      ctx.drawImage(img, 0, 0, width, height);
      const thumbBlob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/webp', 0.75)
      );
      if (thumbBlob) {
        URL.revokeObjectURL(rawUrl);
        return {
          previewUrl: URL.createObjectURL(thumbBlob),
          width: origWidth,
          height: origHeight,
        };
      }
      return { previewUrl: rawUrl, width: origWidth, height: origHeight };
    } finally {
      releaseCanvas(canvas);
    }
  } catch {
    return { previewUrl: rawUrl, width: 0, height: 0 };
  } finally {
    img.src = '';
  }
}

/**
 * Pure TypeScript BMP Encoder
 * Encodes standard 32-bit BGRA uncompressed BMP format
 */
export function encodeBMP(imageData: ImageData): Blob {
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;

  const rowSize = width * 4;
  const pixelArraySize = rowSize * height;
  const fileHeaderSize = 14;
  const infoHeaderSize = 40;
  const fileSize = fileHeaderSize + infoHeaderSize + pixelArraySize;

  const buffer = new ArrayBuffer(fileSize);
  const view = new DataView(buffer);

  // BITMAPFILEHEADER
  view.setUint16(0, 0x4D42, true); // 'BM'
  view.setUint32(2, fileSize, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, 0, true);
  view.setUint32(10, fileHeaderSize + infoHeaderSize, true);

  // BITMAPINFOHEADER
  view.setUint32(14, infoHeaderSize, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 32, true);
  view.setUint32(30, 0, true);
  view.setUint32(34, pixelArraySize, true);
  view.setInt32(38, 2835, true);
  view.setInt32(42, 2835, true);
  view.setUint32(46, 0, true);
  view.setUint32(50, 0, true);

  let offset = fileHeaderSize + infoHeaderSize;
  for (let y = height - 1; y >= 0; y--) {
    const rowOffset = y * width * 4;
    for (let x = 0; x < width; x++) {
      const idx = rowOffset + x * 4;
      view.setUint8(offset++, data[idx + 2]); // B
      view.setUint8(offset++, data[idx + 1]); // G
      view.setUint8(offset++, data[idx]);     // R
      view.setUint8(offset++, data[idx + 3]); // A
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
  const ifdSize = 2 + numTags * 12 + 4;
  const extraDataOffset = headerSize + ifdSize;

  const bitsPerSampleOffset = extraDataOffset;
  const xResOffset = bitsPerSampleOffset + 8;
  const yResOffset = xResOffset + 8;
  const pixelDataOffset = yResOffset + 8;

  const pixelDataSize = width * height * 4;
  const totalFileSize = pixelDataOffset + pixelDataSize;

  const buffer = new ArrayBuffer(totalFileSize);
  const view = new DataView(buffer);

  view.setUint16(0, 0x4949, true); // 'II' Little-Endian
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);
  view.setUint16(8, numTags, true);

  let tagIdx = 10;
  function writeTag(tag: number, type: number, count: number, valueOrOffset: number) {
    view.setUint16(tagIdx, tag, true);
    view.setUint16(tagIdx + 2, type, true);
    view.setUint32(tagIdx + 4, count, true);
    view.setUint32(tagIdx + 8, valueOrOffset, true);
    tagIdx += 12;
  }

  writeTag(256, 4, 1, width);
  writeTag(257, 4, 1, height);
  writeTag(258, 3, 4, bitsPerSampleOffset);
  writeTag(259, 3, 1, 1);
  writeTag(262, 3, 1, 2);
  writeTag(273, 4, 1, pixelDataOffset);
  writeTag(277, 3, 1, 4);
  writeTag(278, 4, 1, height);
  writeTag(279, 4, 1, pixelDataSize);
  writeTag(282, 5, 1, xResOffset);
  writeTag(283, 5, 1, yResOffset);
  writeTag(296, 3, 1, 2);

  view.setUint32(tagIdx, 0, true);

  view.setUint16(bitsPerSampleOffset, 8, true);
  view.setUint16(bitsPerSampleOffset + 2, 8, true);
  view.setUint16(bitsPerSampleOffset + 4, 8, true);
  view.setUint16(bitsPerSampleOffset + 6, 8, true);

  view.setUint32(xResOffset, 72, true);
  view.setUint32(xResOffset + 4, 1, true);
  view.setUint32(yResOffset, 72, true);
  view.setUint32(yResOffset + 4, 1, true);

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
 * Process a single image file with high-fidelity encoding and memory-safe disposal
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

  // 2. Set up offscreen canvas and explicitly release backing store in finally
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  let processedBlob: Blob;
  try {
    const ctx = canvas.getContext('2d', { willReadFrequently: format === 'image/bmp' || format === 'image/tiff' });
    if (!ctx) throw new Error('Could not initialize 2D canvas context');

    const needsBackground = format === 'image/jpeg' || format === 'image/bmp';
    if (needsBackground) {
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, targetWidth, targetHeight);
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Use pre-scaled ImageBitmap when downsizing large images to reduce memory overhead
    let bitmap: ImageBitmap | null = null;
    if (typeof createImageBitmap === 'function' && (targetWidth < origWidth || targetHeight < origHeight)) {
      try {
        bitmap = await createImageBitmap(file, {
          resizeWidth: targetWidth,
          resizeHeight: targetHeight,
          resizeQuality: 'high',
        });
        ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
      } catch {
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
      } finally {
        bitmap?.close();
      }
    } else {
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
    }

    // Clear decoded image reference early
    img.src = '';

    // 3. Encode depending on target format
    if (format === 'image/bmp') {
      const imgData = ctx.getImageData(0, 0, targetWidth, targetHeight);
      processedBlob = encodeBMP(imgData);
    } else if (format === 'image/tiff') {
      const imgData = ctx.getImageData(0, 0, targetWidth, targetHeight);
      processedBlob = encodeTIFF(imgData);
    } else {
      const targetMime = (format === 'image/avif' && !isFormatSupported('image/avif'))
        ? 'image/webp'
        : format;

      processedBlob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((b) => {
          if (b) {
            resolve(b);
          } else {
            canvas.toBlob((fallback) => resolve(fallback!), 'image/png');
          }
        }, targetMime, quality);
      });

      // 4. Strict Target Size Enforcement
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
            if (diffRatio < 0.04) break;
            low = mid;
          } else {
            high = mid;
          }
          iterations++;
        }
        processedBlob = bestBlob;
      }
    }
  } finally {
    img.src = '';
    releaseCanvas(canvas);
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
  const baseName = file.name.replace(/\.[^/.]+$/, '');

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
 * Save a Blob cleanly on Desktop, Web, or Android WebView
 */
export async function saveBlobToDevice(
  blob: Blob,
  fileName: string
): Promise<{ ok: boolean; location?: string }> {
  if (window.PixelPerfectAndroid?.saveFile) {
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    const base64 = btoa(binary);
    const savedPath = window.PixelPerfectAndroid.saveFile(base64, fileName, blob.type || 'application/octet-stream');
    return { ok: !!savedPath, location: savedPath };
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return { ok: true };
}

/**
 * Check if the browser / WebView engine supports a given mime type for encoding
 */
export function isFormatSupported(mimeType: string): boolean {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  try {
    const dataUrl = canvas.toDataURL(mimeType);
    return dataUrl.startsWith(`data:${mimeType}`);
  } catch {
    return false;
  } finally {
    releaseCanvas(canvas);
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
