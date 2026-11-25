import {
  applyEdgePreservingDenoise,
  computeFastSSIM,
  encodeOptimizedPNG,
} from './compression-engine';

export type OutputFormat =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'image/avif'
  | 'image/bmp'
  | 'image/tiff'
  | 'image/gif';

export type PerceptualPreset = 'visually-lossless' | 'balanced' | 'compact';

export interface ProcessingOptions {
  format: OutputFormat;
  targetSizeKB?: number;
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0.0 to 1.0
  lossless?: boolean;
  smartPerceptual?: boolean;
  perceptualPreset?: PerceptualPreset;
  denoise?: boolean;
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
  ssimScore?: number; // 0.0 to 1.0 perceptual similarity score
  methodUsed?: string;
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

const PRESET_SSIM_TARGET: Record<PerceptualPreset, number> = {
  'visually-lossless': 0.985,
  'balanced': 0.970,
  'compact': 0.945,
};

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
 * Decode a Blob back into RGBA pixels on a disposable canvas for perceptual SSIM verification
 */
async function decodeBlobToRgba(blob: Blob, width: number, height: number): Promise<Uint8Array | null> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  try {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    if (typeof createImageBitmap === 'function') {
      const bmp = await createImageBitmap(blob);
      try {
        ctx.drawImage(bmp, 0, 0, width, height);
      } finally {
        bmp.close();
      }
    } else {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      try {
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject();
          img.src = url;
        });
        ctx.drawImage(img, 0, 0, width, height);
      } finally {
        img.src = '';
        URL.revokeObjectURL(url);
      }
    }

    return new Uint8Array(ctx.getImageData(0, 0, width, height).data.buffer);
  } catch {
    return null;
  } finally {
    releaseCanvas(canvas);
  }
}

/**
 * Pure TypeScript BMP Encoder (32-bit BGRA uncompressed BMP)
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

  view.setUint16(0, 0x4D42, true);
  view.setUint32(2, fileSize, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, 0, true);
  view.setUint32(10, fileHeaderSize + infoHeaderSize, true);

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
      view.setUint8(offset++, data[idx + 2]);
      view.setUint8(offset++, data[idx + 1]);
      view.setUint8(offset++, data[idx]);
      view.setUint8(offset++, data[idx + 3]);
    }
  }

  return new Blob([buffer], { type: 'image/bmp' });
}

/**
 * Pure TypeScript Baseline TIFF Encoder (32-bit RGBA TIFF 6.0)
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

  view.setUint16(0, 0x4949, true);
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
 * Process a single image file with perceptual SSIM auto-optimization,
 * adaptive PNG quantization, edge-preserving denoise, and memory-safe disposal.
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
    lossless = false,
    smartPerceptual = true,
    perceptualPreset = 'visually-lossless',
    denoise = false,
    backgroundColor = '#ffffff'
  } = options;

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

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  let processedBlob: Blob;
  let ssimScore: number | undefined;
  let methodUsed: string | undefined;

  try {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Could not initialize 2D canvas context');

    const needsBackground = format === 'image/jpeg' || format === 'image/bmp';
    if (needsBackground) {
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, targetWidth, targetHeight);
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

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

    img.src = '';

    // Grab original RGBA pixels for SSIM verification & custom encoders
    const rawImageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
    const origRgba = new Uint8Array(rawImageData.data.buffer);

    // Optional Edge-Preserving Noise Cleaner to strip invisible ISO grain before encoding
    let workRgba = origRgba;
    if (denoise && !lossless) {
      workRgba = applyEdgePreservingDenoise(origRgba, targetWidth, targetHeight, 8);
      const cleanedData = new ImageData(new Uint8ClampedArray(workRgba), targetWidth, targetHeight);
      ctx.putImageData(cleanedData, 0, 0);
    }

    if (format === 'image/bmp') {
      processedBlob = encodeBMP(ctx.getImageData(0, 0, targetWidth, targetHeight));
      ssimScore = 1.0;
      methodUsed = '32-bit BMP';
    } else if (format === 'image/tiff') {
      processedBlob = encodeTIFF(ctx.getImageData(0, 0, targetWidth, targetHeight));
      ssimScore = 1.0;
      methodUsed = 'Baseline TIFF';
    } else if (format === 'image/png') {
      // Advanced PNG Pipeline:
      // Always evaluate lossless adaptive-filter + color-reduction PNG vs native Chromium PNG,
      // and when smartPerceptual is enabled, also evaluate Median-Cut quantized PNG.
      const losslessBytes = encodeOptimizedPNG(workRgba, targetWidth, targetHeight, { lossless: true });
      const losslessBlob = new Blob([losslessBytes.buffer as ArrayBuffer], { type: 'image/png' });
      const nativeBlob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b!), 'image/png')
      );

      let bestPngBlob = losslessBlob.size <= nativeBlob.size ? losslessBlob : nativeBlob;
      let bestMethod = losslessBlob.size <= nativeBlob.size ? 'Lossless PNG (Adaptive Filter)' : 'Lossless PNG';
      let bestSSIM = 1.0;

      if (!lossless && smartPerceptual) {
        const maxColors = perceptualPreset === 'compact' ? 128 : 256;
        const quantBytes = encodeOptimizedPNG(workRgba, targetWidth, targetHeight, {
          lossless: false,
          maxColors,
          dither: true,
        });
        const quantBlob = new Blob([quantBytes.buffer as ArrayBuffer], { type: 'image/png' });

        if (quantBlob.size < bestPngBlob.size) {
          const compRgba = await decodeBlobToRgba(quantBlob, targetWidth, targetHeight);
          const measured = compRgba ? computeFastSSIM(origRgba, compRgba, targetWidth, targetHeight) : 0.985;
          const minAcceptSSIM = Math.max(0.92, PRESET_SSIM_TARGET[perceptualPreset] - 0.025);

          if (measured >= minAcceptSSIM) {
            bestPngBlob = quantBlob;
            bestSSIM = measured;
            bestMethod = `Quantized PNG (${maxColors} colors)`;
          }
        }
      }

      processedBlob = bestPngBlob;
      ssimScore = bestSSIM;
      methodUsed = bestMethod;
    } else {
      // Lossy / Hybrid Formats: JPEG, WebP, AVIF, GIF
      const targetMime = (format === 'image/avif' && !isFormatSupported('image/avif'))
        ? 'image/webp'
        : format;

      const encodeAtQuality = (q: number) =>
        new Promise<Blob>((resolve) => {
          canvas.toBlob((b) => {
            if (b) resolve(b);
            else canvas.toBlob((fb) => resolve(fb!), 'image/png');
          }, targetMime, q);
        });

      const initialQ = lossless ? 1.0 : quality;
      processedBlob = await encodeAtQuality(initialQ);
      methodUsed = lossless ? 'Lossless / Max Quality' : `Quality ${Math.round(initialQ * 100)}%`;

      // Mode A: Strict Target File Size KB override
      if (targetSizeKB && !lossless && (format === 'image/jpeg' || format === 'image/webp' || format === 'image/avif')) {
        const targetBytes = targetSizeKB * 1024;
        let low = 0.05;
        let high = initialQ;
        let bestBlob = processedBlob;
        let bestQ = initialQ;
        let iterations = 0;

        while (iterations < 6) {
          const mid = (low + high) / 2;
          const currentBlob = await encodeAtQuality(mid);
          const diffRatio = Math.abs(currentBlob.size - targetBytes) / targetBytes;
          if (currentBlob.size <= targetBytes) {
            bestBlob = currentBlob;
            bestQ = mid;
            if (diffRatio < 0.04) break;
            low = mid;
          } else {
            high = mid;
          }
          iterations++;
        }
        processedBlob = bestBlob;
        methodUsed = `Target ${targetSizeKB}KB (q=${Math.round(bestQ * 100)}%)`;
        const compRgba = await decodeBlobToRgba(processedBlob, targetWidth, targetHeight);
        if (compRgba) ssimScore = computeFastSSIM(origRgba, compRgba, targetWidth, targetHeight);
      }
      // Mode B: Smart Perceptual SSIM Rate-Distortion Auto-Optimization
      else if (smartPerceptual && !lossless && (format === 'image/jpeg' || format === 'image/webp' || format === 'image/avif')) {
        const targetSSIM = PRESET_SSIM_TARGET[perceptualPreset];
        let low = perceptualPreset === 'compact' ? 0.25 : 0.35;
        let high = Math.max(low + 0.05, initialQ);
        let bestBlob = processedBlob;
        let bestQ = initialQ;
        let bestSSIM = 1.0;

        // First verify baseline initialQ SSIM
        const baseRgba = await decodeBlobToRgba(processedBlob, targetWidth, targetHeight);
        if (baseRgba) {
          bestSSIM = computeFastSSIM(origRgba, baseRgba, targetWidth, targetHeight);
        }

        // Binary search lowest bitrate that preserves SSIM >= targetSSIM
        for (let iter = 0; iter < 5; iter++) {
          const mid = (low + high) / 2;
          const candidate = await encodeAtQuality(mid);
          const compRgba = await decodeBlobToRgba(candidate, targetWidth, targetHeight);
          if (!compRgba) break;

          const score = computeFastSSIM(origRgba, compRgba, targetWidth, targetHeight);
          if (score >= targetSSIM) {
            if (candidate.size < bestBlob.size) {
              bestBlob = candidate;
              bestQ = mid;
              bestSSIM = score;
            }
            high = mid; // Try lower bitrate while keeping SSIM >= target
          } else {
            low = mid; // Need higher quality
          }
        }

        processedBlob = bestBlob;
        ssimScore = bestSSIM;
        methodUsed = `SSIM Auto (q=${Math.round(bestQ * 100)}%)`;
      } else if (!lossless) {
        const compRgba = await decodeBlobToRgba(processedBlob, targetWidth, targetHeight);
        if (compRgba) ssimScore = computeFastSSIM(origRgba, compRgba, targetWidth, targetHeight);
      } else {
        ssimScore = 1.0;
      }
    }

    // Same-format size safeguard: never output a larger file if no resize/denoise/targetSize was requested
    const noResize = !maxWidth && !maxHeight;
    if (
      noResize &&
      !targetSizeKB &&
      !denoise &&
      file.type === format &&
      processedBlob.size > file.size
    ) {
      processedBlob = file;
      ssimScore = 1.0;
      methodUsed = 'Original Kept (Already Optimal)';
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
    ssimScore,
    methodUsed,
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
