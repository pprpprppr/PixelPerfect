import imageCompression from 'browser-image-compression';

export type OutputFormat = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/bmp' | 'image/tiff' | 'image/gif';

export interface ProcessingOptions {
  format: OutputFormat;
  targetSizeKB?: number;
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  stripMetadata?: boolean;
  progressive?: boolean;
}

export interface ProcessedImage {
  blob: Blob;
  url: string;
  name: string;
  size: number;
  width: number;
  height: number;
  format: string;
}

export async function processImage(
  file: File,
  options: ProcessingOptions
): Promise<ProcessedImage> {
  const { 
    format, 
    targetSizeKB, 
    maxWidth, 
    maxHeight, 
    quality = 0.8,
    stripMetadata = true,
    progressive = true
  } = options;

  try {
    // 1. Initial pass with browser-image-compression for resizing and basic optimization
    const initialOptions = {
      maxSizeMB: targetSizeKB ? (targetSizeKB / 1024) * 1.2 : 20, // Give it some headroom
      maxWidthOrHeight: maxWidth || maxHeight || undefined,
      useWebWorker: true,
      fileType: format,
      initialQuality: quality,
      alwaysKeepResolution: !maxWidth && !maxHeight,
    };

    let processedBlob: Blob = await imageCompression(file, initialOptions);

    // 2. Strict Target Size Enforcement & Quality Control
    // If targetSizeKB is set, we use a canvas-based iterative approach to hit the target size precisely
    if (targetSizeKB) {
      const targetBytes = targetSizeKB * 1024;
      
      // Load the image into a canvas to have full control over quality and format
      const img = new Image();
      const tempUrl = URL.createObjectURL(processedBlob);
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = tempUrl;
      });
      URL.revokeObjectURL(tempUrl);

      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get canvas context');
      
      // Handle transparency for JPEG conversion
      if (format === 'image/jpeg') {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      
      ctx.drawImage(img, 0, 0);

      // Binary search or iterative approach for quality to hit target size
      let low = 0.01;
      let high = quality; // Start from user selected quality
      let bestBlob = processedBlob;
      let iterations = 0;

      while (iterations < 5) { // Max 5 passes for performance
        const mid = (low + high) / 2;
        const currentBlob = await new Promise<Blob>((resolve) => {
          canvas.toBlob((b) => resolve(b!), format, mid);
        });

        if (currentBlob.size <= targetBytes) {
          bestBlob = currentBlob;
          low = mid; // Try higher quality
        } else {
          high = mid; // Need lower quality
        }
        iterations++;
      }
      processedBlob = bestBlob;
    }

    // Final check: if format conversion is needed and not handled well by library
    // (e.g. PNG to JPEG transparency issues)
    
    const finalImg = new Image();
    const finalUrl = URL.createObjectURL(processedBlob);
    await new Promise((resolve, reject) => {
      finalImg.onload = resolve;
      finalImg.onerror = reject;
      finalImg.src = finalUrl;
    });

    const extensions: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/bmp': '.bmp',
      'image/tiff': '.tiff',
      'image/gif': '.gif'
    };

    const result: ProcessedImage = {
      blob: processedBlob,
      url: finalUrl,
      name: file.name.replace(/\.[^/.]+$/, "") + (extensions[format] || '.jpg'),
      size: processedBlob.size,
      width: finalImg.width,
      height: finalImg.height,
      format: format,
    };

    return result;
  } catch (error) {
    console.error('Error processing image:', error);
    throw error;
  }
}

export function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
