/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, 
  Image as ImageIcon, 
  Download, 
  Trash2, 
  Maximize2, 
  FileJson, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  ArrowRightLeft,
  Moon,
  Sun,
  FileText,
  Zap,
  ShieldCheck,
  Archive,
  Copy,
  Check,
  Sparkles,
  Sliders,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import JSZip from 'jszip';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { 
  processImage, 
  formatBytes,
  createThumbnail,
  saveBlobToDevice,
  getOptimalConcurrency,
  type OutputFormat, 
  type ProcessedImage 
} from './lib/image-utils';

interface FileItem {
  id: string;
  file: File;
  preview: string; // Lightweight <=96px thumbnail URL
  status: 'idle' | 'processing' | 'completed' | 'error';
  result?: ProcessedImage;
  error?: string;
  origWidth?: number;
  origHeight?: number;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'converter' | 'explorer'>('converter');
  const [mobileSection, setMobileSection] = useState<'queue' | 'settings'>('queue');
  
  // White (light) & Dark theme with localStorage persistence
  const [theme, setTheme] = useState<'white' | 'dark'>(() => {
    const saved = localStorage.getItem('pixelperfect_theme');
    if (saved === 'dark' || saved === 'white') return saved;
    if (saved === 'light') return 'white';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'white';
  });
  const isDarkMode = theme === 'dark';

  const [files, setFiles] = useState<FileItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [, setDragCounter] = useState(0);

  // Settings
  const [format, setFormat] = useState<OutputFormat>('image/jpeg');
  const [quality, setQuality] = useState(82);
  const [targetSizeKB, setTargetSizeKB] = useState<string>('');
  const [maxWidth, setMaxWidth] = useState<string>('');
  const [maxHeight, setMaxHeight] = useState<string>('');
  const [lockAspectRatio, setLockAspectRatio] = useState(true);
  const [backgroundColor, setBackgroundColor] = useState('#ffffff');
  const [lossless, setLossless] = useState(false);

  // Processing & feedback state
  const [isProcessingAll, setIsProcessingAll] = useState(false);
  const [processingProgress, setProcessingProgress] = useState({ current: 0, total: 0 });
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Comparison Modal state (stores full-res original URL transiently while modal is open)
  const [inspectedItem, setInspectedItem] = useState<FileItem | null>(null);
  const [inspectedOrigUrl, setInspectedOrigUrl] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(prev => (prev === msg ? null : prev)), 3200);
  };

  // Sync White/Dark theme class, meta theme-color, and native Android status bar
  useEffect(() => {
    const root = document.documentElement;
    if (isDarkMode) {
      root.classList.add('dark');
      localStorage.setItem('pixelperfect_theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('pixelperfect_theme', 'white');
    }

    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', isDarkMode ? '#0f172a' : '#ffffff');
    }

    window.PixelPerfectAndroid?.setTheme?.(isDarkMode);
  }, [isDarkMode]);

  // Manage transient full-resolution URL for Comparison Modal to avoid wasting RAM
  useEffect(() => {
    if (!inspectedItem) {
      setInspectedOrigUrl(null);
      return;
    }
    const url = URL.createObjectURL(inspectedItem.file);
    setInspectedOrigUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [inspectedItem]);

  // Clean up created URLs on unmount
  const filesRef = useRef<FileItem[]>(files);
  filesRef.current = files;
  useEffect(() => {
    return () => {
      filesRef.current.forEach(f => {
        URL.revokeObjectURL(f.preview);
        if (f.result?.url) URL.revokeObjectURL(f.result.url);
      });
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault();
        fileInputRef.current?.click();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (files.length > 0 && !isProcessingAll) {
          processAll();
        }
      }
      if (e.key === 'Escape') {
        setInspectedItem(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [files, isProcessingAll]);

  // Full-window drag and drop handling
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    setDragCounter(prev => prev + 1);
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragCounter(prev => {
      const next = prev - 1;
      if (next <= 0) {
        setIsDragging(false);
        return 0;
      }
      return next;
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    setDragCounter(0);
    const droppedFiles = (Array.from(e.dataTransfer.files) as File[]).filter((f: File) => 
      f.type.startsWith('image/') || /\.(png|jpe?g|webp|avif|bmp|tiff?|gif|svg)$/i.test(f.name)
    );
    if (droppedFiles.length > 0) {
      addFiles(droppedFiles);
    }
  };

  const addFiles = (newFiles: File[]) => {
    const items: FileItem[] = newFiles.map(file => ({
      id: Math.random().toString(36).substring(2, 9),
      file,
      preview: '',
      status: 'idle'
    }));

    setFiles(prev => [...prev, ...items]);

    // Generate memory-efficient <=96px thumbnails & probe dimensions asynchronously
    items.forEach(async (item) => {
      const { previewUrl, width, height } = await createThumbnail(item.file, 96);
      setFiles(prev => {
        const exists = prev.some(f => f.id === item.id);
        if (!exists) {
          if (previewUrl) URL.revokeObjectURL(previewUrl);
          return prev;
        }
        return prev.map(f => f.id === item.id ? {
          ...f,
          preview: previewUrl,
          origWidth: width || undefined,
          origHeight: height || undefined,
        } : f);
      });
    });
  };

  const removeFile = (id: string) => {
    setFiles(prev => {
      const removed = prev.find(f => f.id === id);
      if (removed) {
        if (removed.preview) URL.revokeObjectURL(removed.preview);
        if (removed.result?.url) URL.revokeObjectURL(removed.result.url);
      }
      return prev.filter(f => f.id !== id);
    });
  };

  const clearFiles = () => {
    files.forEach(f => {
      if (f.preview) URL.revokeObjectURL(f.preview);
      if (f.result?.url) URL.revokeObjectURL(f.result.url);
    });
    setFiles([]);
  };

  const clearCompleted = () => {
    setFiles(prev => {
      const kept: FileItem[] = [];
      prev.forEach(f => {
        if (f.status === 'completed') {
          if (f.preview) URL.revokeObjectURL(f.preview);
          if (f.result?.url) URL.revokeObjectURL(f.result.url);
        } else {
          kept.push(f);
        }
      });
      return kept;
    });
  };

  // Handle aspect ratio auto-calculation when typing Width or Height
  const handleWidthChange = (val: string) => {
    setMaxWidth(val);
    if (lockAspectRatio && val && files.length > 0) {
      const first = files.find(f => f.origWidth && f.origHeight);
      if (first && first.origWidth && first.origHeight) {
        const numW = parseFloat(val);
        if (!isNaN(numW)) {
          const ratio = first.origHeight / first.origWidth;
          setMaxHeight(Math.round(numW * ratio).toString());
        }
      }
    }
  };

  const handleHeightChange = (val: string) => {
    setMaxHeight(val);
    if (lockAspectRatio && val && files.length > 0) {
      const first = files.find(f => f.origWidth && f.origHeight);
      if (first && first.origWidth && first.origHeight) {
        const numH = parseFloat(val);
        if (!isNaN(numH)) {
          const ratio = first.origWidth / first.origHeight;
          setMaxWidth(Math.round(numH * ratio).toString());
        }
      }
    }
  };

  // Process a single file
  const handleProcess = async (id: string) => {
    const item = filesRef.current.find(f => f.id === id);
    if (!item || item.status === 'processing') return;

    if (item.result?.url) {
      URL.revokeObjectURL(item.result.url);
    }

    setFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'processing', result: undefined, error: undefined } : f));

    try {
      const result = await processImage(item.file, {
        format,
        quality: lossless ? 1.0 : quality / 100,
        targetSizeKB: targetSizeKB ? parseInt(targetSizeKB) : undefined,
        maxWidth: maxWidth ? parseInt(maxWidth) : undefined,
        maxHeight: maxHeight ? parseInt(maxHeight) : undefined,
        backgroundColor,
      });

      setFiles(prev => prev.map(f => f.id === id ? { 
        ...f, 
        status: 'completed', 
        result,
        origWidth: result.originalWidth,
        origHeight: result.originalHeight
      } : f));
    } catch (err: any) {
      setFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'error', error: err?.message || 'Processing failed' } : f));
    }
  };

  // Adaptive parallel batch processing
  const processAll = async () => {
    if (files.length === 0 || isProcessingAll) return;
    setIsProcessingAll(true);
    setProcessingProgress({ current: 0, total: files.length });

    const queue = [...files];
    let completedCount = 0;
    const concurrency = getOptimalConcurrency();

    const worker = async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) break;
        await handleProcess(item.id);
        completedCount++;
        setProcessingProgress({ current: completedCount, total: files.length });
      }
    };

    const workers = Array.from({ length: Math.min(concurrency, files.length) }, () => worker());
    await Promise.all(workers);

    setIsProcessingAll(false);
    setMobileSection('queue');
    showToast(`Converted ${files.length} image${files.length > 1 ? 's' : ''}`);
  };

  // Download a single converted image (Desktop, Web, & Android compatible)
  const downloadImage = async (result: ProcessedImage) => {
    const res = await saveBlobToDevice(result.blob, result.name);
    if (res.ok && res.location) {
      showToast(`Saved to ${res.location}`);
    } else if (res.ok) {
      showToast(`Exported ${result.name}`);
    }
  };

  // Download all completed images as a ZIP archive
  const downloadAllAsZip = async () => {
    const completedFiles = files.filter(f => f.status === 'completed' && f.result);
    if (completedFiles.length === 0) return;

    const zip = new JSZip();
    completedFiles.forEach((item) => {
      if (item.result) {
        zip.file(item.result.name, item.result.blob);
      }
    });

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const zipName = `pixelperfect-batch-${Date.now()}.zip`;
    const res = await saveBlobToDevice(zipBlob, zipName);
    if (res.ok && res.location) {
      showToast(`Saved ZIP to ${res.location}`);
    } else if (res.ok) {
      showToast(`Exported ${zipName}`);
    }
  };

  // Copy converted image to clipboard
  const copyToClipboard = async (item: FileItem) => {
    if (!item.result) return;
    try {
      if (item.result.blob.type === 'image/png') {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': item.result.blob })
        ]);
      } else {
        const img = new Image();
        img.src = item.result.url;
        await new Promise(r => { img.onload = r; });
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        try {
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0);
          const pngBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
          if (pngBlob) {
            await navigator.clipboard.write([
              new ClipboardItem({ 'image/png': pngBlob })
            ]);
          }
        } finally {
          canvas.width = 0;
          canvas.height = 0;
          img.src = '';
        }
      }
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.warn('Clipboard write failed:', err);
    }
  };

  const completedCount = files.filter(f => f.status === 'completed').length;
  const queueTotalBytes = files.reduce((acc, f) => acc + f.file.size, 0);
  const processedTotalBytes = files.reduce((acc, f) => acc + (f.result?.size || 0), 0);
  const totalSavingsBytes = queueTotalBytes > 0 && processedTotalBytes > 0 ? queueTotalBytes - processedTotalBytes : 0;
  const savingsPercent = queueTotalBytes > 0 && totalSavingsBytes > 0 ? Math.round((totalSavingsBytes / queueTotalBytes) * 100) : 0;

  const ThemeSwitcher = ({ compact = false }: { compact?: boolean }) => (
    <div
      role="group"
      aria-label="Theme selection"
      className={cn(
        "inline-flex items-center p-0.5 rounded-xl border transition-colors",
        isDarkMode ? "bg-slate-900 border-slate-800" : "bg-slate-100 border-slate-200"
      )}
    >
      <button
        type="button"
        onClick={() => setTheme('white')}
        title="White Theme"
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer",
          !isDarkMode
            ? "bg-white text-slate-900 shadow-sm"
            : "text-slate-400 hover:text-slate-200"
        )}
      >
        <Sun className="w-3.5 h-3.5 text-amber-500" />
        {!compact && <span>White</span>}
      </button>
      <button
        type="button"
        onClick={() => setTheme('dark')}
        title="Dark Theme"
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer",
          isDarkMode
            ? "bg-slate-800 text-white shadow-sm"
            : "text-slate-500 hover:text-slate-900"
        )}
      >
        <Moon className="w-3.5 h-3.5 text-indigo-400" />
        {!compact && <span>Dark</span>}
      </button>
    </div>
  );

  const settingsContent = (
    <div className="space-y-6">
      {/* Format Selection */}
      <section>
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-1.5">
          <Sliders className="w-3.5 h-3.5 text-indigo-500" />
          Target Format
        </h2>
        <div className="space-y-2">
          <Select value={format} onValueChange={(v) => setFormat(v as OutputFormat)}>
            <SelectTrigger className={cn(
              "w-full rounded-xl h-11 font-medium",
              isDarkMode ? "bg-slate-800 border-slate-700 text-slate-100" : "bg-white border-slate-200 text-slate-900"
            )}>
              <SelectValue placeholder="Select format" />
            </SelectTrigger>
            <SelectContent className={isDarkMode ? "bg-slate-800 border-slate-700 text-slate-100" : "bg-white border-slate-200 text-slate-900"}>
              <SelectItem value="image/jpeg">JPEG (.jpg) — Universal</SelectItem>
              <SelectItem value="image/png">PNG (.png) — Lossless / Alpha</SelectItem>
              <SelectItem value="image/webp">WebP (.webp) — Modern Web</SelectItem>
              <SelectItem value="image/avif">AVIF (.avif) — Next-Gen High Efficiency</SelectItem>
              <SelectItem value="image/bmp">BMP (.bmp) — Uncompressed Bitmap</SelectItem>
              <SelectItem value="image/tiff">TIFF (.tiff) — Studio Baseline</SelectItem>
              <SelectItem value="image/gif">GIF (.gif) — Compact Graphics</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>

      {/* Compression & Quality */}
      <section className="space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
          Compression & Quality
        </h2>

        <div className={cn(
          "flex items-center justify-between p-3 rounded-xl border transition-colors",
          isDarkMode ? "bg-slate-800/60 border-slate-700" : "bg-slate-50 border-slate-200"
        )}>
          <div className="flex flex-col">
            <span className="text-xs font-bold">Lossless Mode</span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400">100% pixel fidelity</span>
          </div>
          <input 
            type="checkbox" 
            checked={lossless} 
            onChange={(e) => setLossless(e.target.checked)}
            className="w-4 h-4 accent-indigo-600 cursor-pointer"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-[11px] font-semibold text-slate-500 uppercase">Target Max Size (KB)</Label>
          <Input 
            type="number" 
            value={targetSizeKB}
            onChange={(e) => setTargetSizeKB(e.target.value)}
            placeholder="e.g. 250 (Optional)"
            disabled={lossless}
            className={cn(
              "rounded-xl h-10 text-xs font-mono",
              isDarkMode ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"
            )}
          />
        </div>

        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <Label className="text-[11px] font-semibold text-slate-500 uppercase">Quality Strength</Label>
            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
              {lossless ? '100%' : `${quality}%`}
            </span>
          </div>
          <Slider 
            value={[quality]} 
            onValueChange={(vals) => setQuality(vals[0])} 
            min={10} 
            max={100} 
            step={1}
            disabled={lossless}
            className={cn("w-full cursor-pointer", lossless && "opacity-40 pointer-events-none")}
          />
        </div>
      </section>

      {/* Background fill for transparent images */}
      {(format === 'image/jpeg' || format === 'image/bmp') && (
        <section className="space-y-2.5">
          <Label className="text-[11px] font-semibold text-slate-500 uppercase">
            Transparency Background
          </Label>
          <div className="flex items-center gap-2">
            <div 
              className="w-8 h-8 rounded-lg border border-slate-300 dark:border-slate-700 shadow-sm shrink-0" 
              style={{ backgroundColor }} 
            />
            <Input 
              type="text" 
              value={backgroundColor} 
              onChange={(e) => setBackgroundColor(e.target.value)}
              placeholder="#ffffff"
              className={cn(
                "rounded-xl h-9 text-xs font-mono uppercase",
                isDarkMode ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"
              )}
            />
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => setBackgroundColor(backgroundColor === '#ffffff' ? '#000000' : '#ffffff')}
              className="h-9 px-2.5 text-xs"
            >
              {backgroundColor === '#ffffff' ? 'Black' : 'White'}
            </Button>
          </div>
        </section>
      )}

      {/* Resize Controls */}
      <section className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Resize Dimensions (px)
        </h2>
        <div className="grid grid-cols-2 gap-2.5">
          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold text-slate-500 uppercase">Width</Label>
            <Input 
              type="number" 
              value={maxWidth}
              onChange={(e) => handleWidthChange(e.target.value)}
              placeholder="Auto"
              className={cn(
                "rounded-xl h-10 text-xs font-mono",
                isDarkMode ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold text-slate-500 uppercase">Height</Label>
            <Input 
              type="number" 
              value={maxHeight}
              onChange={(e) => handleHeightChange(e.target.value)}
              placeholder="Auto"
              className={cn(
                "rounded-xl h-10 text-xs font-mono",
                isDarkMode ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"
              )}
            />
          </div>
        </div>
        
        <div className="flex items-center justify-between pt-1">
          <label className="flex items-center gap-2 cursor-pointer text-xs font-medium">
            <input 
              type="checkbox" 
              checked={lockAspectRatio} 
              onChange={(e) => setLockAspectRatio(e.target.checked)} 
              className="w-3.5 h-3.5 accent-indigo-600 rounded" 
            />
            Lock Aspect Ratio
          </label>
          {(maxWidth || maxHeight) && (
            <button 
              onClick={() => { setMaxWidth(''); setMaxHeight(''); }}
              className="text-[10px] text-indigo-500 hover:underline"
            >
              Reset size
            </button>
          )}
        </div>
      </section>

      {/* Batch Stats Widget */}
      <section className="pt-2">
        <div className="grid grid-cols-2 gap-2.5">
          <div className={cn(
            "p-3 rounded-xl border",
            isDarkMode ? "bg-slate-800/50 border-slate-700" : "bg-slate-50 border-slate-200"
          )}>
            <span className="text-[10px] font-semibold uppercase text-slate-400 block mb-1">Original</span>
            <span className="text-sm font-bold font-mono">{formatBytes(queueTotalBytes)}</span>
          </div>
          <div className={cn(
            "p-3 rounded-xl border",
            isDarkMode ? "bg-slate-800/50 border-slate-700" : "bg-slate-50 border-slate-200"
          )}>
            <span className="text-[10px] font-semibold uppercase text-slate-400 block mb-1">Converted</span>
            <span className="text-sm font-bold font-mono text-emerald-500">{formatBytes(processedTotalBytes)}</span>
          </div>
        </div>
        {totalSavingsBytes > 0 && (
          <div className="mt-2 text-center text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 py-1.5 px-3 rounded-lg border border-emerald-500/20">
            Saved {formatBytes(totalSavingsBytes)} ({savingsPercent}%)
          </div>
        )}
      </section>

      {/* Action Button */}
      <Button 
        onClick={processAll}
        disabled={files.length === 0 || isProcessingAll}
        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white h-12 rounded-xl font-bold text-sm shadow-md transition-all active:scale-[0.98]"
      >
        {isProcessingAll ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Processing ({processingProgress.current}/{processingProgress.total})...
          </>
        ) : (
          <>
            Convert All Images
          </>
        )}
      </Button>
    </div>
  );

  return (
    <div 
      onDragEnter={handleDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "relative flex flex-col lg:flex-row h-screen w-full font-sans overflow-hidden transition-colors duration-200 select-none",
        isDarkMode ? "bg-[#0f172a] text-slate-100" : "bg-[#ffffff] text-[#0f172a]"
      )}
    >
      {/* Hidden File Input */}
      <input 
        type="file" 
        ref={fileInputRef}
        onChange={(e) => {
          if (e.target.files) {
            addFiles(Array.from(e.target.files));
            e.target.value = '';
          }
        }}
        multiple 
        accept="image/*,.png,.jpg,.jpeg,.webp,.avif,.bmp,.tiff,.tif,.gif,.svg"
        className="hidden"
      />

      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold shadow-xl border border-slate-700 dark:border-slate-200"
          >
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Drag & Drop Full Window Overlay */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-indigo-600/90 backdrop-blur-md text-white pointer-events-none"
          >
            <motion.div 
              animate={{ scale: [1, 1.08, 1] }} 
              transition={{ repeat: Infinity, duration: 1.5 }}
              className="flex flex-col items-center"
            >
              <Upload className="w-20 h-20 mb-4 animate-bounce" />
              <h2 className="text-3xl font-black tracking-tight">Drop Images Here</h2>
              <p className="text-indigo-100 mt-2 text-sm font-medium">Instantly add to conversion queue</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Header (< lg screens) */}
      <header className={cn(
        "lg:hidden flex flex-col gap-2.5 px-4 pt-3 pb-2.5 border-b shrink-0 transition-colors",
        isDarkMode ? "bg-[#131d31] border-slate-800" : "bg-white border-slate-200"
      )}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-black text-lg tracking-tight">
            <span className="text-xl">◈</span> PixelPerfect
          </div>
          <ThemeSwitcher />
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={() => { setActiveTab('converter'); setMobileSection('queue'); }}
            className={cn(
              "py-2 rounded-xl text-xs font-bold transition-all",
              activeTab === 'converter' && mobileSection === 'queue'
                ? "bg-indigo-600 text-white shadow-sm"
                : (isDarkMode ? "bg-slate-800/70 text-slate-300" : "bg-slate-100 text-slate-600")
            )}
          >
            Queue ({files.length})
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab('converter'); setMobileSection('settings'); }}
            className={cn(
              "py-2 rounded-xl text-xs font-bold transition-all",
              activeTab === 'converter' && mobileSection === 'settings'
                ? "bg-indigo-600 text-white shadow-sm"
                : (isDarkMode ? "bg-slate-800/70 text-slate-300" : "bg-slate-100 text-slate-600")
            )}
          >
            Settings
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('explorer')}
            className={cn(
              "py-2 rounded-xl text-xs font-bold transition-all",
              activeTab === 'explorer'
                ? "bg-indigo-600 text-white shadow-sm"
                : (isDarkMode ? "bg-slate-800/70 text-slate-300" : "bg-slate-100 text-slate-600")
            )}
          >
            Formats
          </button>
        </div>
      </header>

      {/* Desktop Left Sidebar (>= lg) */}
      <aside className={cn(
        "hidden lg:flex w-[270px] border-r flex-col p-6 shrink-0 transition-colors duration-200 z-10",
        isDarkMode ? "bg-[#131d31] border-slate-800" : "bg-slate-50/70 border-[#e2e8f0]"
      )}>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2 text-[#4f46e5] dark:text-indigo-400 font-black text-xl tracking-tight">
            <span className="text-2xl drop-shadow-sm">◈</span> PixelPerfect
          </div>
        </div>

        {/* White / Dark Theme Switcher */}
        <div className="flex items-center justify-between mb-6 px-1">
          <span className={cn("text-[11px] font-bold uppercase tracking-wider", isDarkMode ? "text-slate-400" : "text-slate-500")}>
            Theme
          </span>
          <ThemeSwitcher />
        </div>
        
        <nav className="space-y-1.5">
          <div 
            onClick={() => setActiveTab('converter')}
            className={cn(
              "flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm cursor-pointer transition-all",
              activeTab === 'converter' 
                ? (isDarkMode ? "bg-indigo-600/20 text-indigo-400 font-semibold" : "bg-indigo-50 text-indigo-600 font-semibold")
                : (isDarkMode ? "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200" : "text-slate-600 hover:bg-white")
            )}
          >
            <ArrowRightLeft className="w-4 h-4" />
            Universal Converter
          </div>
          <div 
            onClick={() => setActiveTab('explorer')}
            className={cn(
              "flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm cursor-pointer transition-all",
              activeTab === 'explorer'
                ? (isDarkMode ? "bg-indigo-600/20 text-indigo-400 font-semibold" : "bg-indigo-50 text-indigo-600 font-semibold")
                : (isDarkMode ? "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200" : "text-slate-600 hover:bg-white")
            )}
          >
            <ImageIcon className="w-4 h-4" />
            Format Explorer
          </div>
        </nav>

        {/* Queue Overview */}
        <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800 flex flex-col flex-1 min-h-0">
          <div className="flex items-center justify-between mb-3">
            <h3 className={cn(
              "text-[11px] uppercase tracking-wider font-bold",
              isDarkMode ? "text-slate-400" : "text-slate-500"
            )}>Queue ({files.length})</h3>
            {files.length > 0 && (
              <button 
                onClick={clearFiles}
                className="text-[11px] text-red-500 hover:text-red-400 font-semibold hover:underline"
              >
                Clear all
              </button>
            )}
          </div>

          <ScrollArea className="flex-1 pr-2">
            {files.length === 0 ? (
              <p className={cn("text-xs italic py-4 text-center", isDarkMode ? "text-slate-500" : "text-slate-400")}>
                No images queued
              </p>
            ) : (
              <div className="space-y-1.5">
                {files.map(f => (
                  <div 
                    key={f.id} 
                    onClick={() => f.result && setInspectedItem(f)}
                    className={cn(
                      "text-xs px-2.5 py-2 rounded-lg flex items-center justify-between group cursor-pointer transition-colors",
                      isDarkMode ? "hover:bg-slate-800/70 text-slate-300" : "hover:bg-white text-slate-700"
                    )}
                  >
                    <span className="truncate max-w-[140px] font-medium">{f.file.name}</span>
                    {f.status === 'completed' ? (
                      <span className="text-[10px] text-emerald-500 font-bold shrink-0">Done</span>
                    ) : f.status === 'processing' ? (
                      <Loader2 className="w-3 h-3 text-indigo-500 animate-spin shrink-0" />
                    ) : (
                      <span className="text-[10px] text-slate-400 shrink-0">Ready</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Quick Shortcuts info */}
          <div className={cn(
            "mt-4 p-3 rounded-xl border text-[11px] space-y-1",
            isDarkMode ? "bg-slate-900/60 border-slate-800 text-slate-400" : "bg-white border-slate-200 text-slate-500"
          )}>
            <div className="flex justify-between">
              <span>Add images:</span>
              <kbd className="font-mono bg-slate-100 dark:bg-slate-800 px-1 rounded text-[10px]">Ctrl+O</kbd>
            </div>
            <div className="flex justify-between">
              <span>Convert batch:</span>
              <kbd className="font-mono bg-slate-100 dark:bg-slate-800 px-1 rounded text-[10px]">Ctrl+Enter</kbd>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Workspace */}
      <main className="flex-1 flex flex-col p-4 md:p-6 lg:p-8 gap-4 lg:gap-6 overflow-y-auto lg:overflow-hidden min-h-0">
        {activeTab === 'converter' ? (
          mobileSection === 'settings' ? (
            <div className="lg:hidden pb-8">
              {settingsContent}
            </div>
          ) : (
          <>
            <header className="flex flex-wrap justify-between items-center gap-3 shrink-0">
              <div>
                <h1 className="text-xl lg:text-2xl font-black tracking-tight">Universal Image Converter</h1>
                <p className={cn("text-xs mt-0.5", isDarkMode ? "text-slate-400" : "text-slate-500")}>
                  Fast, offline conversion with high-fidelity encoding & compression
                </p>
              </div>

              <div className="flex items-center gap-2">
                {files.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearFiles}
                    className={cn(
                      "lg:hidden text-xs font-semibold h-9 rounded-xl text-red-500",
                      isDarkMode ? "border-slate-700 hover:bg-slate-800" : "border-slate-200 hover:bg-slate-100"
                    )}
                  >
                    Clear
                  </Button>
                )}
                {completedCount > 0 && (
                  <>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={clearCompleted}
                      className={cn(
                        "hidden sm:inline-flex text-xs font-semibold h-9 rounded-xl",
                        isDarkMode ? "border-slate-700 hover:bg-slate-800" : "border-slate-200 hover:bg-slate-100"
                      )}
                    >
                      Clear Done
                    </Button>
                    <Button 
                      onClick={downloadAllAsZip}
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs h-9 rounded-xl shadow-sm flex items-center gap-1.5"
                    >
                      <Archive className="w-3.5 h-3.5" />
                      Download All (.ZIP)
                    </Button>
                  </>
                )}
              </div>
            </header>

            {/* Upload Drop Zone */}
            <div 
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "relative shrink-0 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center p-6 lg:p-8 text-center cursor-pointer transition-all duration-200",
                files.length === 0 ? "min-h-[170px] lg:min-h-[210px]" : "min-h-[110px] lg:min-h-[130px] py-4 lg:py-6",
                isDarkMode 
                  ? "border-slate-700 bg-slate-800/40 hover:bg-slate-800/80 hover:border-indigo-500/60" 
                  : "border-indigo-200 bg-indigo-50/40 hover:bg-indigo-50/80 hover:border-indigo-500/60"
              )}
            >
              <div className={cn(
                "rounded-2xl flex items-center justify-center mb-2.5 shadow-sm",
                files.length === 0 ? "w-14 h-14" : "w-11 h-11 mb-2",
                isDarkMode ? "bg-indigo-500/20 text-indigo-400" : "bg-indigo-100 text-indigo-600"
              )}>
                <Upload className={files.length === 0 ? "w-7 h-7" : "w-5 h-5"} />
              </div>
              <div className="text-sm lg:text-base font-bold">
                {files.length === 0 ? "Tap or Drop Images to Convert" : "Add More Images"}
              </div>
              <p className={cn("text-[11px] lg:text-xs mt-1 max-w-md", isDarkMode ? "text-slate-400" : "text-slate-500")}>
                Supports JPEG, PNG, WebP, AVIF, BMP, TIFF, GIF.
              </p>
            </div>

            {/* Mobile Quick Convert Bar */}
            {files.length > 0 && (
              <div className="lg:hidden flex items-center gap-2 shrink-0">
                <Button
                  onClick={processAll}
                  disabled={isProcessingAll}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white h-11 rounded-xl font-bold text-xs shadow-sm"
                >
                  {isProcessingAll ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Converting ({processingProgress.current}/{processingProgress.total})
                    </>
                  ) : (
                    <>Convert All to {format.split('/')[1].toUpperCase()}</>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setMobileSection('settings')}
                  className="h-11 px-3 rounded-xl text-xs font-semibold"
                >
                  <Sliders className="w-4 h-4" />
                </Button>
              </div>
            )}

            {/* Batch Progress Bar */}
            {isProcessingAll && (
              <div className={cn(
                "p-3.5 rounded-xl border flex flex-col gap-2 shrink-0",
                isDarkMode ? "bg-slate-800/80 border-indigo-500/40" : "bg-indigo-50/70 border-indigo-200"
              )}>
                <div className="flex justify-between items-center text-xs font-semibold">
                  <span className="flex items-center gap-2 text-indigo-500">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Converting: {processingProgress.current} of {processingProgress.total} completed
                  </span>
                  <span className="font-mono font-bold">
                    {Math.round((processingProgress.current / Math.max(1, processingProgress.total)) * 100)}%
                  </span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                  <div 
                    className="bg-indigo-600 h-full rounded-full transition-all duration-300"
                    style={{ width: `${(processingProgress.current / Math.max(1, processingProgress.total)) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* File List Grid */}
            <div className={cn(
              "flex-1 rounded-2xl shadow-sm border flex flex-col overflow-hidden min-h-[240px] lg:min-h-0 transition-colors duration-200",
              isDarkMode ? "bg-[#131d31] border-slate-800" : "bg-white border-[#e2e8f0]"
            )}>
              <div className={cn(
                "grid grid-cols-[40px_1fr_auto] md:grid-cols-[40px_1fr_110px_120px_100px_120px] items-center px-4 md:px-6 py-3 border-b text-[11px] font-bold uppercase tracking-wider",
                isDarkMode ? "border-slate-800 text-slate-400" : "border-slate-200 text-slate-500"
              )}>
                <span></span>
                <span>Name</span>
                <span className="hidden md:block">Dimensions</span>
                <span className="hidden md:block">Size</span>
                <span className="hidden md:block">Status</span>
                <span className="text-right">Actions</span>
              </div>
              
              <ScrollArea className="flex-1">
                <AnimatePresence mode="popLayout">
                  {files.length === 0 ? (
                    <div className={cn("h-full flex flex-col items-center justify-center py-16 md:py-24", isDarkMode ? "text-slate-600" : "text-slate-400")}>
                      <ImageIcon className="w-12 h-12 mb-3 opacity-30" />
                      <p className="text-sm font-semibold">No images in queue</p>
                      <p className="text-xs mt-1">Select or drop images to begin</p>
                    </div>
                  ) : (
                    <div className={cn("divide-y", isDarkMode ? "divide-slate-800/80" : "divide-slate-100")}>
                      {files.map((item) => {
                        const hasSavings = item.result && item.result.size < item.file.size;
                        const savings = item.result ? Math.round(((item.file.size - item.result.size) / item.file.size) * 100) : 0;

                        return (
                          <motion.div
                            key={item.id}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ duration: 0.15 }}
                            className={cn(
                              "grid grid-cols-[40px_1fr_auto] md:grid-cols-[40px_1fr_110px_120px_100px_120px] items-center px-4 md:px-6 py-3.5 transition-colors gap-2 md:gap-0",
                              isDarkMode ? "hover:bg-slate-800/40" : "hover:bg-slate-50"
                            )}
                          >
                            {/* Thumbnail */}
                            <div 
                              onClick={() => item.result && setInspectedItem(item)}
                              className="w-8 h-8 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 cursor-pointer shrink-0 flex items-center justify-center"
                            >
                              {item.preview ? (
                                <img 
                                  src={item.preview} 
                                  alt={item.file.name} 
                                  className="w-full h-full object-cover" 
                                />
                              ) : (
                                <ImageIcon className="w-4 h-4 text-slate-400" />
                              )}
                            </div>
                            
                            {/* File name & format */}
                            <div className="min-w-0 pr-2 md:pr-4">
                              <div className="text-xs font-semibold truncate" title={item.file.name}>
                                {item.file.name}
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                <span className="text-[10px] text-slate-400 uppercase font-mono">
                                  {item.file.type.split('/')[1] || 'IMAGE'}
                                </span>
                                {item.result && (
                                  <>
                                    <span className="text-[10px] text-slate-400">-&gt;</span>
                                    <span className="text-[10px] text-indigo-500 font-bold uppercase font-mono">
                                      {item.result.format.split('/')[1]}
                                    </span>
                                  </>
                                )}
                                <span className="md:hidden text-[10px] text-slate-400">
                                  · {item.result ? formatBytes(item.result.size) : formatBytes(item.file.size)}
                                  {hasSavings && <span className="text-emerald-500 font-bold ml-1">(-{savings}%)</span>}
                                </span>
                              </div>
                            </div>

                            {/* Dimensions */}
                            <div className="hidden md:block text-xs font-mono text-slate-500 dark:text-slate-400">
                              {item.origWidth && item.origHeight ? (
                                item.result ? (
                                  <span>{item.result.width}x{item.result.height}</span>
                                ) : (
                                  <span>{item.origWidth}x{item.origHeight}</span>
                                )
                              ) : (
                                "—"
                              )}
                            </div>

                            {/* Size & Savings */}
                            <div className="hidden md:block text-xs">
                              {item.result ? (
                                <div>
                                  <div className="font-semibold text-emerald-600 dark:text-emerald-400">
                                    {formatBytes(item.result.size)}
                                  </div>
                                  <div className="text-[10px] text-slate-400">
                                    was {formatBytes(item.file.size)}
                                    {hasSavings && (
                                      <span className="text-emerald-500 ml-1 font-bold">(-{savings}%)</span>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-slate-500">{formatBytes(item.file.size)}</span>
                              )}
                            </div>

                            {/* Status */}
                            <div className="hidden md:block">
                              {item.status === 'completed' ? (
                                <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px] font-bold">
                                  Converted
                                </Badge>
                              ) : item.status === 'processing' ? (
                                <Badge variant="secondary" className="bg-indigo-500/10 text-indigo-500 border-indigo-500/20 text-[10px] font-bold flex items-center gap-1 w-fit">
                                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                  Active
                                </Badge>
                              ) : item.status === 'error' ? (
                                <Badge variant="destructive" className="text-[10px] font-bold">
                                  Failed
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px] text-slate-400 border-slate-300 dark:border-slate-700">
                                  Queued
                                </Badge>
                              )}
                            </div>

                            {/* Actions */}
                            <div className="flex items-center justify-end gap-1">
                              {item.status === 'completed' && item.result ? (
                                <>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    onClick={() => setInspectedItem(item)}
                                    title="Compare Before & After"
                                    className="h-8 w-8 text-slate-500 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
                                  >
                                    <Maximize2 className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    onClick={() => copyToClipboard(item)}
                                    title="Copy to clipboard"
                                    className="hidden sm:inline-flex h-8 w-8 text-slate-500 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
                                  >
                                    {copiedId === item.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    onClick={() => downloadImage(item.result!)}
                                    title="Download image"
                                    className="h-8 w-8 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                  </Button>
                                </>
                              ) : (
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  onClick={() => handleProcess(item.id)}
                                  disabled={item.status === 'processing'}
                                  title="Convert single image"
                                  className="h-8 w-8 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
                                >
                                  {item.status === 'processing' ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" />
                                  ) : (
                                    <ArrowRightLeft className="w-3.5 h-3.5" />
                                  )}
                                </Button>
                              )}
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => removeFile(item.id)}
                                title="Remove"
                                className="h-8 w-8 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  )}
                </AnimatePresence>
              </ScrollArea>
            </div>
          </>
          )
        ) : (
          <FormatExplorer 
            isDarkMode={isDarkMode} 
            onSelectFormat={(mime) => {
              setFormat(mime);
              setActiveTab('converter');
              setMobileSection('queue');
            }}
          />
        )}
      </main>

      {/* Desktop Right Settings Panel (>= lg) */}
      <aside className={cn(
        "hidden lg:flex w-[320px] border-l flex-col p-6 shrink-0 overflow-y-auto transition-colors duration-200 z-10",
        isDarkMode ? "bg-[#131d31] border-slate-800" : "bg-slate-50/70 border-[#e2e8f0]"
      )}>
        {settingsContent}
      </aside>

      {/* Before / After Inspection Modal */}
      <AnimatePresence>
        {inspectedItem && inspectedItem.result && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6 bg-black/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className={cn(
                "relative w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl border flex flex-col overflow-hidden",
                isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 text-slate-900"
              )}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between px-4 md:px-6 py-4 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500 shrink-0">
                    <Maximize2 className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-sm md:text-base truncate">{inspectedItem.file.name}</h3>
                    <p className="text-xs text-slate-400">Before & After Comparison</p>
                  </div>
                </div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setInspectedItem(null)}
                  className="rounded-full h-8 w-8 shrink-0"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              {/* Side by side display (stacked on mobile) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 md:p-6 flex-1 min-h-0 overflow-y-auto">
                {/* Original */}
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center text-xs font-bold text-slate-400 uppercase tracking-wider">
                    <span>Original ({inspectedItem.file.type.split('/')[1] || 'IMAGE'})</span>
                    <span>{formatBytes(inspectedItem.file.size)}</span>
                  </div>
                  <div className="aspect-video rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 flex items-center justify-center p-2">
                    <img 
                      src={inspectedOrigUrl || inspectedItem.preview} 
                      alt="Original" 
                      className="max-h-full max-w-full object-contain" 
                    />
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    Dimensions: {inspectedItem.origWidth} x {inspectedItem.origHeight} px
                  </div>
                </div>

                {/* Converted */}
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center text-xs font-bold text-emerald-500 uppercase tracking-wider">
                    <span>Converted ({inspectedItem.result.format.split('/')[1]})</span>
                    <span>{formatBytes(inspectedItem.result.size)}</span>
                  </div>
                  <div className="aspect-video rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 flex items-center justify-center p-2">
                    <img 
                      src={inspectedItem.result.url} 
                      alt="Converted" 
                      className="max-h-full max-w-full object-contain" 
                    />
                  </div>
                  <div className="flex justify-between items-center text-[11px] font-mono">
                    <span className="text-slate-400">
                      Dimensions: {inspectedItem.result.width} x {inspectedItem.result.height} px
                    </span>
                    <span className="text-emerald-500 font-bold">
                      Saved {Math.round(((inspectedItem.file.size - inspectedItem.result.size) / inspectedItem.file.size) * 100)}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex flex-wrap justify-between items-center gap-2 px-4 md:px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => copyToClipboard(inspectedItem)}
                  className="text-xs"
                >
                  <Copy className="w-3.5 h-3.5 mr-1.5" />
                  {copiedId === inspectedItem.id ? 'Copied!' : 'Copy'}
                </Button>

                <div className="flex gap-2">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setInspectedItem(null)}
                    className="text-xs"
                  >
                    Close
                  </Button>
                  <Button 
                    size="sm" 
                    onClick={() => downloadImage(inspectedItem.result!)}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold"
                  >
                    <Download className="w-3.5 h-3.5 mr-1.5" />
                    Download
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FormatExplorer({ isDarkMode, onSelectFormat }: { isDarkMode: boolean, onSelectFormat: (mime: OutputFormat) => void }) {
  const formats = [
    { 
      name: 'AVIF', 
      mime: 'image/avif' as OutputFormat,
      ext: '.avif', 
      desc: 'Next-generation image format based on AV1 video codec. Exceptional compression efficiency with crystal-clear fidelity.',
      pros: ['Smallest file sizes', 'Supports HDR & transparency', 'Future of web media'],
      cons: ['Slightly higher encode time', 'Requires modern software'],
      icon: <Sparkles className="w-5 h-5 text-indigo-500" />
    },
    { 
      name: 'WebP', 
      mime: 'image/webp' as OutputFormat,
      ext: '.webp', 
      desc: 'Modern Google format designed for the web. Provides 25-35% smaller files than JPEG at equivalent quality.',
      pros: ['Superior web compression', 'Lossy and lossless modes', 'Alpha transparency'],
      cons: ['Legacy editor compatibility', 'Less prevalent in print'],
      icon: <Zap className="w-5 h-5 text-amber-500" />
    },
    { 
      name: 'JPEG', 
      mime: 'image/jpeg' as OutputFormat,
      ext: '.jpg, .jpeg', 
      desc: 'The universal digital photography standard. Supported natively by virtually every device and platform in existence.',
      pros: ['100% universal support', 'Compact size for photos', 'Adjustable quality levels'],
      cons: ['No transparency support', 'Lossy compression artifacts on sharp text'],
      icon: <ImageIcon className="w-5 h-5 text-orange-500" />
    },
    { 
      name: 'PNG', 
      mime: 'image/png' as OutputFormat,
      ext: '.png', 
      desc: 'Lossless raster format ideal for logos, user interface designs, charts, and graphics requiring transparent backgrounds.',
      pros: ['Zero quality loss', 'Full alpha channel transparency', 'Sharp edges & pixel precision'],
      cons: ['Larger file sizes for photographs', 'No native animation in standard PNG'],
      icon: <FileText className="w-5 h-5 text-blue-500" />
    },
    { 
      name: 'BMP', 
      mime: 'image/bmp' as OutputFormat,
      ext: '.bmp', 
      desc: 'Standard Windows Bitmap format. Completely uncompressed scanline data for raw image manipulation.',
      pros: ['Zero compression artifacts', 'Direct hardware bitmap mapping', 'Simple structure'],
      cons: ['Extremely large file size', 'Unsuitable for web delivery'],
      icon: <FileJson className="w-5 h-5 text-slate-500" />
    },
    { 
      name: 'TIFF', 
      mime: 'image/tiff' as OutputFormat,
      ext: '.tiff', 
      desc: 'Tagged Image File Format favored in publishing, archival photography, medical imaging, and high-end printing.',
      pros: ['Lossless studio archival', 'Standard in commercial print', 'High bit-depth'],
      cons: ['Heavy file footprint', 'No native web browser preview'],
      icon: <ShieldCheck className="w-5 h-5 text-purple-500" />
    },
    { 
      name: 'GIF', 
      mime: 'image/gif' as OutputFormat,
      ext: '.gif', 
      desc: 'Classic 8-bit indexed palette format supporting simple animations and indexed transparency.',
      pros: ['Universal legacy support', 'Lightweight for simple diagrams', 'Indexed color'],
      cons: ['Maximum 256 colors', 'Poor photographic gradient reproduction'],
      icon: <CheckCircle2 className="w-5 h-5 text-emerald-500" />
    }
  ];

  return (
    <div className="flex-1 flex flex-col gap-6 min-h-0 overflow-hidden">
      <header className="flex justify-between items-center shrink-0">
        <div>
          <h1 className="text-xl lg:text-2xl font-black tracking-tight">Format Explorer</h1>
          <p className={cn("text-xs mt-0.5", isDarkMode ? "text-slate-400" : "text-slate-500")}>
            Learn format strengths, compression trade-offs, and select the optimal format
          </p>
        </div>
        <Badge variant="outline" className="font-mono text-xs shrink-0">
          v1.2.0 Stable
        </Badge>
      </header>

      <ScrollArea className="flex-1 min-h-0">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-8 pr-2 md:pr-4">
          {formats.map((f) => (
            <Card 
              key={f.name} 
              onClick={() => onSelectFormat(f.mime)}
              className={cn(
                "border shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer group relative overflow-hidden",
                isDarkMode ? "bg-[#131d31] border-slate-800 hover:border-indigo-500/60" : "bg-white border-slate-200 hover:border-indigo-500/60"
              )}
            >
              <div className="absolute top-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <ArrowRightLeft className="w-4 h-4 text-indigo-500" />
              </div>
              
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3 mb-1">
                  <div className={cn(
                    "p-2 rounded-xl transition-colors",
                    isDarkMode ? "bg-slate-800 group-hover:bg-indigo-500/20" : "bg-slate-100 group-hover:bg-indigo-50"
                  )}>
                    {f.icon}
                  </div>
                  <div>
                    <CardTitle className="text-base font-bold">{f.name}</CardTitle>
                    <CardDescription className="text-xs font-mono">{f.ext}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3.5">
                <p className={cn("text-xs leading-relaxed", isDarkMode ? "text-slate-400" : "text-slate-600")}>
                  {f.desc}
                </p>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-500">
                    <CheckCircle2 className="w-3 h-3" /> Pros
                  </div>
                  <ul className="space-y-1">
                    {f.pros.map(p => (
                      <li key={p} className={cn("text-[11px] flex items-center gap-1.5", isDarkMode ? "text-slate-300" : "text-slate-600")}>
                        <div className="w-1 h-1 rounded-full bg-emerald-500 shrink-0" /> {p}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-rose-500">
                    <AlertCircle className="w-3 h-3" /> Cons
                  </div>
                  <ul className="space-y-1">
                    {f.cons.map(c => (
                      <li key={c} className={cn("text-[11px] flex items-center gap-1.5", isDarkMode ? "text-slate-300" : "text-slate-600")}>
                        <div className="w-1 h-1 rounded-full bg-rose-500 shrink-0" /> {c}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="pt-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full text-xs font-semibold h-8 group-hover:bg-indigo-600 group-hover:text-white group-hover:border-indigo-600 transition-colors"
                  >
                    Select {f.name}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
