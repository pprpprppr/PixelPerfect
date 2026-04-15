/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useRef } from 'react';
import { 
  Upload, 
  Image as ImageIcon, 
  Download, 
  Trash2, 
  Settings2, 
  Maximize2, 
  FileJson, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  ChevronRight,
  ArrowRightLeft,
  Info,
  Moon,
  Sun,
  FileText,
  Zap,
  ShieldCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
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
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { processImage, formatBytes, type OutputFormat, type ProcessedImage } from './lib/image-utils';

interface FileItem {
  id: string;
  file: File;
  preview: string;
  status: 'idle' | 'processing' | 'completed' | 'error';
  result?: ProcessedImage;
  error?: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'converter' | 'explorer'>('converter');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [format, setFormat] = useState<OutputFormat>('image/jpeg');
  const [quality, setQuality] = useState(80);
  const [targetSizeKB, setTargetSizeKB] = useState<string>('');
  const [maxWidth, setMaxWidth] = useState<string>('');
  const [maxHeight, setMaxHeight] = useState<string>('');
  const [isProcessingAll, setIsProcessingAll] = useState(false);
  const [stripMetadata, setStripMetadata] = useState(true);
  const [progressive, setProgressive] = useState(true);
  const [lossless, setLossless] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files).filter((f: File) => f.type.startsWith('image/')) as File[];
    addFiles(droppedFiles);
  }, []);

  const addFiles = (newFiles: File[]) => {
    const items: FileItem[] = newFiles.map(file => ({
      id: Math.random().toString(36).substring(7),
      file,
      preview: URL.createObjectURL(file),
      status: 'idle'
    }));
    setFiles(prev => [...prev, ...items]);
  };

  const removeFile = (id: string) => {
    setFiles(prev => {
      const filtered = prev.filter(f => f.id !== id);
      const removed = prev.find(f => f.id === id);
      if (removed) URL.revokeObjectURL(removed.preview);
      return filtered;
    });
  };

  const clearFiles = () => {
    files.forEach(f => URL.revokeObjectURL(f.preview));
    setFiles([]);
  };

  const handleProcess = async (id: string) => {
    const item = files.find(f => f.id === id);
    if (!item || item.status === 'processing') return;

    // Cleanup previous result URL if it exists
    if (item.result?.url) {
      URL.revokeObjectURL(item.result.url);
    }

    setFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'processing', result: undefined } : f));

    try {
      const result = await processImage(item.file, {
        format,
        quality: lossless ? 1.0 : quality / 100,
        targetSizeKB: targetSizeKB ? parseInt(targetSizeKB) : undefined,
        maxWidth: maxWidth ? parseInt(maxWidth) : undefined,
        maxHeight: maxHeight ? parseInt(maxHeight) : undefined,
        stripMetadata,
        progressive,
      });

      setFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'completed', result } : f));
    } catch (err) {
      setFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'error', error: 'Failed to process' } : f));
    }
  };

  const processAll = async () => {
    setIsProcessingAll(true);
    // Process all files in the queue, even if completed, to apply new settings
    for (const file of files) {
      await handleProcess(file.id);
    }
    setIsProcessingAll(false);
  };

  const downloadImage = (result: ProcessedImage) => {
    const link = document.createElement('a');
    link.href = result.url;
    link.download = result.name;
    link.click();
  };

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
    document.documentElement.classList.toggle('dark');
  };

  return (
    <div className={cn(
      "flex h-screen w-full font-sans overflow-hidden transition-colors duration-300",
      isDarkMode ? "bg-[#0f172a] text-slate-200" : "bg-[#f0f2f5] text-[#1e293b]"
    )}>
      {/* Sidebar */}
      <aside className={cn(
        "w-[260px] border-r flex flex-col p-6 shrink-0 transition-colors duration-300",
        isDarkMode ? "bg-[#1e293b] border-slate-800" : "bg-white border-[#e2e8f0]"
      )}>
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2 text-[#4f46e5] font-extrabold text-xl">
            <span className="text-2xl">◈</span> PixelPerfect
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={toggleDarkMode}
            className={cn(
              "h-8 w-8 rounded-full",
              isDarkMode ? "text-yellow-400 hover:bg-slate-800" : "text-slate-500 hover:bg-slate-100"
            )}
          >
            {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
        </div>
        
        <nav className="space-y-1">
          <div 
            onClick={() => setActiveTab('converter')}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-lg font-semibold text-sm cursor-pointer transition-all",
              activeTab === 'converter' 
                ? (isDarkMode ? "bg-[#4f46e5]/20 text-[#818cf8]" : "bg-[#f5f3ff] text-[#4f46e5]")
                : (isDarkMode ? "text-slate-400 hover:bg-slate-800" : "text-[#64748b] hover:bg-[#f8fafc]")
            )}
          >
            <ArrowRightLeft className="w-4 h-4" />
            Universal Converter
          </div>
          <div 
            onClick={() => setActiveTab('explorer')}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-lg font-semibold text-sm cursor-pointer transition-all",
              activeTab === 'explorer'
                ? (isDarkMode ? "bg-[#4f46e5]/20 text-[#818cf8]" : "bg-[#f5f3ff] text-[#4f46e5]")
                : (isDarkMode ? "text-slate-400 hover:bg-slate-800" : "text-[#64748b] hover:bg-[#f8fafc]")
            )}
          >
            <ImageIcon className="w-4 h-4" />
            Format Explorer
          </div>
        </nav>

        <div className="mt-8 flex-1">
          <h3 className={cn(
            "text-[11px] uppercase tracking-wider font-bold mb-4",
            isDarkMode ? "text-slate-500" : "text-[#64748b]"
          )}>Recent Activity</h3>
          <ScrollArea className="h-[200px]">
            <div className="space-y-3">
              {files.filter(f => f.status === 'completed').length === 0 ? (
                <p className={cn("text-xs italic", isDarkMode ? "text-slate-600" : "text-[#94a3b8]")}>No recent activity</p>
              ) : (
                files.filter(f => f.status === 'completed').map(f => (
                  <div key={f.id} className={cn(
                    "text-xs py-2 border-b truncate",
                    isDarkMode ? "text-slate-400 border-slate-800" : "text-[#64748b] border-[#e2e8f0]"
                  )}>
                    {f.file.name} → {format.split('/')[1].toUpperCase()}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </aside>

      {/* Main Workspace */}
      <main className="flex-1 flex flex-col p-8 gap-6 overflow-hidden">
        {activeTab === 'converter' ? (
          <>
            <header className="flex justify-between items-center">
              <h1 className={cn("text-2xl font-bold", isDarkMode ? "text-white" : "text-[#1e293b]")}>Universal Converter</h1>
              <div className={cn("text-sm font-medium", isDarkMode ? "text-slate-400" : "text-[#64748b]")}>
                {files.length === 0 ? "Ready to convert" : `${files.length} File(s) Ready`}
              </div>
            </header>

            {/* Simple Upload Section */}
            <div 
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "relative shrink-0 min-h-[240px] border-2 border-dashed rounded-2xl flex flex-col items-center justify-center p-10 text-center cursor-pointer transition-all duration-300",
                isDragging 
                  ? (isDarkMode ? "border-[#4f46e5] bg-[#4f46e5]/10" : "border-[#4f46e5] bg-[#4f46e5]/5")
                  : (isDarkMode 
                      ? "border-slate-700 bg-slate-800/50 hover:bg-slate-800" 
                      : "border-[#4f46e5]/30 bg-[#4f46e5]/[0.03] hover:bg-[#4f46e5]/[0.05]")
              )}
            >
              <input 
                type="file" 
                ref={fileInputRef}
                onChange={(e) => e.target.files && addFiles(Array.from(e.target.files))}
                multiple 
                accept="image/*"
                className="hidden"
              />
              <div className={cn(
                "w-20 h-20 rounded-full flex items-center justify-center mb-6 shadow-lg",
                isDarkMode ? "bg-slate-700 text-[#818cf8]" : "bg-[#f5f3ff] text-[#4f46e5]"
              )}>
                <Upload className="w-10 h-10" />
              </div>
              <div className={cn("text-xl font-bold mb-2", isDarkMode ? "text-white" : "text-[#1e293b]")}>
                {files.length === 0 ? "Upload Image to Convert" : "Add More Images"}
              </div>
              <p className={cn("text-sm max-w-md mx-auto", isDarkMode ? "text-slate-500" : "text-[#64748b]")}>
                Drag and drop your images here or click to browse. 
                <br />
                Supports JPEG, PNG, WebP, BMP, TIFF, GIF.
              </p>
            </div>

            {/* File List / Detected Formats */}
            <div className={cn(
              "flex-1 rounded-xl shadow-sleek border flex flex-col overflow-hidden min-h-0 transition-colors duration-300",
              isDarkMode ? "bg-[#1e293b] border-slate-800" : "bg-white border-[#e2e8f0]"
            )}>
              <div className={cn(
                "grid grid-cols-[48px_1fr_120px_120px_100px_80px] items-center px-6 py-3 border-b text-[11px] font-bold uppercase tracking-wider",
                isDarkMode ? "border-slate-800 text-slate-500" : "border-[#e2e8f0] text-[#94a3b8]"
              )}>
                <span></span>
                <span>Name</span>
                <span>Detected Format</span>
                <span>Size</span>
                <span>Status</span>
                <span className="text-right">Action</span>
              </div>
              
              <ScrollArea className="flex-1">
                <AnimatePresence mode="popLayout">
                  {files.length === 0 ? (
                    <div className={cn("h-full flex flex-col items-center justify-center py-20", isDarkMode ? "text-slate-600" : "text-[#94a3b8]")}>
                      <ImageIcon className="w-12 h-12 mb-2 opacity-20" />
                      <p className="text-sm font-medium">No images uploaded yet</p>
                    </div>
                  ) : (
                    <div className={cn("divide-y", isDarkMode ? "divide-slate-800" : "divide-[#e2e8f0]")}>
                      {files.map((item) => (
                        <motion.div
                          key={item.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ duration: 0.2 }}
                          className={cn(
                            "grid grid-cols-[48px_1fr_120px_120px_100px_80px] items-center px-6 py-4 transition-colors",
                            isDarkMode ? "hover:bg-slate-800/50" : "hover:bg-[#f8fafc]"
                          )}
                        >
                          <div className={cn(
                            "w-8 h-8 rounded flex items-center justify-center text-lg",
                            isDarkMode ? "bg-slate-700" : "bg-[#f1f5f9]"
                          )}>
                            {item.file.type.includes('png') ? '🎨' : item.file.type.includes('webp') ? '🖼' : '📷'}
                          </div>
                          
                          <div className={cn("text-sm font-medium truncate pr-4", isDarkMode ? "text-slate-200" : "text-[#1e293b]")}>
                            {item.file.name}
                          </div>

                          <div className="flex items-center">
                            <Badge variant="secondary" className={cn(
                              "text-[10px] font-bold uppercase",
                              isDarkMode ? "bg-slate-800 text-slate-400" : "bg-slate-100 text-slate-600"
                            )}>
                              {item.file.type.split('/')[1].toUpperCase()}
                            </Badge>
                          </div>

                          <div className={cn("text-sm", isDarkMode ? "text-slate-500" : "text-[#64748b]")}>
                            {formatBytes(item.file.size)}
                          </div>

                          <div className="text-sm font-bold">
                            {item.status === 'completed' ? (
                              <span className="text-[#10b981]">Ready</span>
                            ) : item.status === 'processing' ? (
                              <span className="text-[#4f46e5] flex items-center gap-2">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Active
                              </span>
                            ) : item.status === 'error' ? (
                              <span className="text-red-500">Error</span>
                            ) : (
                              <span className={isDarkMode ? "text-slate-600" : "text-[#94a3b8]"}>Idle</span>
                            )}
                          </div>

                          <div className="flex items-center justify-end gap-1">
                            {item.status === 'completed' && item.result ? (
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => downloadImage(item.result!)}
                                className={cn(
                                  "h-8 w-8",
                                  isDarkMode ? "text-[#818cf8] hover:bg-[#4f46e5]/20" : "text-[#4f46e5] hover:bg-[#f5f3ff]"
                                )}
                              >
                                <Download className="w-4 h-4" />
                              </Button>
                            ) : (
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => handleProcess(item.id)}
                                disabled={item.status === 'processing'}
                                className={cn(
                                  "h-8 w-8",
                                  isDarkMode ? "text-slate-400 hover:text-[#818cf8]" : "text-[#64748b] hover:text-[#4f46e5]"
                                )}
                              >
                                <ArrowRightLeft className="w-4 h-4" />
                              </Button>
                            )}
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => removeFile(item.id)}
                              className={cn(
                                "h-8 w-8",
                                isDarkMode ? "text-slate-600 hover:text-red-400" : "text-[#94a3b8] hover:text-red-500"
                              )}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </AnimatePresence>
              </ScrollArea>
            </div>
          </>
        ) : (
          <FormatExplorer 
            isDarkMode={isDarkMode} 
            onSelectFormat={(mime) => {
              setFormat(mime);
              setActiveTab('converter');
            }}
          />
        )}
      </main>

      {/* Right Settings Panel */}
      <aside className={cn(
        "w-[320px] border-l flex flex-col p-6 shrink-0 overflow-y-auto transition-colors duration-300",
        isDarkMode ? "bg-[#1e293b] border-slate-800" : "bg-white border-[#e2e8f0]"
      )}>
        <div className="space-y-8">
          <section>
            <h2 className={cn("text-sm font-bold mb-4", isDarkMode ? "text-white" : "text-[#1e293b]")}>Output Settings</h2>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className={cn("text-[11px] font-semibold uppercase", isDarkMode ? "text-slate-500" : "text-[#64748b]")}>Convert To Format</Label>
                <Select value={format} onValueChange={(v) => setFormat(v as OutputFormat)}>
                  <SelectTrigger className={cn(
                    "w-full rounded-lg h-10 focus:ring-[#4f46e5]",
                    isDarkMode ? "bg-slate-800 border-slate-700 text-slate-200" : "bg-white border-[#e2e8f0]"
                  )}>
                    <SelectValue placeholder="Select format" />
                  </SelectTrigger>
                  <SelectContent className={isDarkMode ? "bg-slate-800 border-slate-700 text-slate-200" : "bg-white"}>
                    <SelectItem value="image/jpeg">JPEG (.jpg)</SelectItem>
                    <SelectItem value="image/png">PNG (.png)</SelectItem>
                    <SelectItem value="image/webp">WebP (.webp)</SelectItem>
                    <SelectItem value="image/bmp">BMP (.bmp)</SelectItem>
                    <SelectItem value="image/tiff">TIFF (.tiff)</SelectItem>
                    <SelectItem value="image/gif">GIF (.gif)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <section>
            <h2 className={cn("text-sm font-bold mb-4", isDarkMode ? "text-white" : "text-[#1e293b]")}>Compression & Size</h2>
            <div className="space-y-6">
              <div className={cn(
                "flex items-center justify-between p-3 rounded-lg border",
                isDarkMode ? "bg-slate-800 border-slate-700" : "bg-[#f8fafc] border-[#e2e8f0]"
              )}>
                <div className="flex flex-col">
                  <span className={cn("text-xs font-bold", isDarkMode ? "text-slate-200" : "text-[#1e293b]")}>Lossless Mode</span>
                  <span className={cn("text-[10px]", isDarkMode ? "text-slate-500" : "text-[#64748b]")}>Maximize quality</span>
                </div>
                <input 
                  type="checkbox" 
                  checked={lossless} 
                  onChange={(e) => setLossless(e.target.checked)}
                  className="w-4 h-4 accent-[#4f46e5] cursor-pointer"
                />
              </div>

              <div className="space-y-2">
                <Label className={cn("text-[11px] font-semibold uppercase", isDarkMode ? "text-slate-500" : "text-[#64748b]")}>Target File Size (KB)</Label>
                <Input 
                  type="number" 
                  value={targetSizeKB}
                  onChange={(e) => setTargetSizeKB(e.target.value)}
                  placeholder="e.g. 500"
                  disabled={lossless}
                  className={cn(
                    "rounded-lg h-10 focus:ring-[#4f46e5] disabled:opacity-50",
                    isDarkMode ? "bg-slate-800 border-slate-700 text-slate-200" : "bg-white border-[#e2e8f0]"
                  )}
                />
              </div>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <Label className={cn("text-[11px] font-semibold uppercase", isDarkMode ? "text-slate-500" : "text-[#64748b]")}>Optimization Strength</Label>
                  <span className="text-xs font-bold text-[#4f46e5]">{lossless ? '100' : quality}%</span>
                </div>
                <Slider 
                  value={[quality]} 
                  onValueChange={(vals) => setQuality(vals[0])} 
                  min={1}
                  max={100} 
                  step={1}
                  disabled={lossless}
                  className={cn("w-full cursor-pointer", lossless && "opacity-50 pointer-events-none")}
                />
              </div>
            </div>
          </section>

          <section>
            <h2 className={cn("text-sm font-bold mb-4", isDarkMode ? "text-white" : "text-[#1e293b]")}>Advanced (jpegoptim)</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className={cn("text-xs font-medium", isDarkMode ? "text-slate-400" : "text-[#64748b]")}>Strip All Metadata</Label>
                <input 
                  type="checkbox" 
                  checked={stripMetadata} 
                  onChange={(e) => setStripMetadata(e.target.checked)}
                  className="w-4 h-4 accent-[#4f46e5] cursor-pointer"
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className={cn("text-xs font-medium", isDarkMode ? "text-slate-400" : "text-[#64748b]")}>Progressive Encoding</Label>
                <input 
                  type="checkbox" 
                  checked={progressive} 
                  onChange={(e) => setProgressive(e.target.checked)}
                  className="w-4 h-4 accent-[#4f46e5] cursor-pointer"
                />
              </div>
            </div>
          </section>

          <section>
            <h2 className={cn("text-sm font-bold mb-4", isDarkMode ? "text-white" : "text-[#1e293b]")}>Resize (Dimensions)</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className={cn("text-[11px] font-semibold uppercase", isDarkMode ? "text-slate-500" : "text-[#64748b]")}>Width (px)</Label>
                <Input 
                  type="number" 
                  value={maxWidth}
                  onChange={(e) => setMaxWidth(e.target.value)}
                  placeholder="Auto"
                  className={cn(
                    "rounded-lg h-10 focus:ring-[#4f46e5]",
                    isDarkMode ? "bg-slate-800 border-slate-700 text-slate-200" : "bg-white border-[#e2e8f0]"
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label className={cn("text-[11px] font-semibold uppercase", isDarkMode ? "text-slate-500" : "text-[#64748b]")}>Height (px)</Label>
                <Input 
                  type="number" 
                  value={maxHeight}
                  onChange={(e) => setMaxHeight(e.target.value)}
                  placeholder="Auto"
                  className={cn(
                    "rounded-lg h-10 focus:ring-[#4f46e5]",
                    isDarkMode ? "bg-slate-800 border-slate-700 text-slate-200" : "bg-white border-[#e2e8f0]"
                  )}
                />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <input type="checkbox" id="ratio" checked readOnly className="w-3.5 h-3.5 accent-[#4f46e5]" />
              <label htmlFor="ratio" className={cn("text-[11px] font-medium", isDarkMode ? "text-slate-500" : "text-[#64748b]")}>Lock Aspect Ratio</label>
            </div>
          </section>

          <div className="grid grid-cols-2 gap-3">
            <div className={cn("p-3 rounded-lg border", isDarkMode ? "bg-slate-800 border-slate-700" : "bg-[#f8fafc] border-[#e2e8f0]")}>
              <span className={cn("text-[10px] font-medium block mb-1", isDarkMode ? "text-slate-500" : "text-[#64748b]")}>Queue Total</span>
              <span className={cn("text-sm font-bold", isDarkMode ? "text-white" : "text-[#1e293b]")}>
                {formatBytes(files.reduce((acc, f) => acc + f.file.size, 0))}
              </span>
            </div>
            <div className={cn("p-3 rounded-lg border", isDarkMode ? "bg-slate-800 border-slate-700" : "bg-[#f8fafc] border-[#e2e8f0]")}>
              <span className={cn("text-[10px] font-medium block mb-1", isDarkMode ? "text-slate-500" : "text-[#64748b]")}>Processed</span>
              <span className="text-sm font-bold text-[#10b981]">
                {formatBytes(files.reduce((acc, f) => acc + (f.result?.size || 0), 0))}
              </span>
            </div>
          </div>

          <Button 
            onClick={processAll}
            disabled={files.length === 0 || isProcessingAll}
            className="w-full bg-[#4f46e5] hover:bg-[#4338ca] text-white h-12 rounded-xl font-bold text-sm mt-auto shadow-sleek transition-all active:scale-[0.98]"
          >
            {isProcessingAll ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                Convert & Export ⚡
              </>
            )}
          </Button>
        </div>
      </aside>
    </div>
  );
}

function FormatExplorer({ isDarkMode, onSelectFormat }: { isDarkMode: boolean, onSelectFormat: (mime: OutputFormat) => void }) {
  const formats = [
    { 
      name: 'JPEG', 
      mime: 'image/jpeg' as OutputFormat,
      ext: '.jpg, .jpeg', 
      desc: 'Best for photographs and complex images. Uses lossy compression.',
      pros: ['Small file size', 'Universal support', 'Adjustable quality'],
      cons: ['No transparency', 'Lossy compression artifacts'],
      icon: <ImageIcon className="w-5 h-5 text-orange-500" />
    },
    { 
      name: 'PNG', 
      mime: 'image/png' as OutputFormat,
      ext: '.png', 
      desc: 'Best for logos, icons, and graphics with transparency.',
      pros: ['Lossless quality', 'Transparency support', 'Sharp edges'],
      cons: ['Large file size', 'Not ideal for photos'],
      icon: <FileText className="w-5 h-5 text-blue-500" />
    },
    { 
      name: 'WebP', 
      mime: 'image/webp' as OutputFormat,
      ext: '.webp', 
      desc: 'Modern format for the web. Supports both lossy and lossless.',
      pros: ['Superior compression', 'Supports transparency', 'Faster loading'],
      cons: ['Older browser issues', 'Slightly complex encoding'],
      icon: <Zap className="w-5 h-5 text-yellow-500" />
    },
    { 
      name: 'BMP', 
      mime: 'image/bmp' as OutputFormat,
      ext: '.bmp', 
      desc: 'Uncompressed raster format. High quality but massive size.',
      pros: ['No compression loss', 'Simple structure'],
      cons: ['Huge file size', 'Not web-friendly'],
      icon: <FileJson className="w-5 h-5 text-slate-500" />
    },
    { 
      name: 'TIFF', 
      mime: 'image/tiff' as OutputFormat,
      ext: '.tiff', 
      desc: 'Professional format for printing and high-end photography.',
      pros: ['Extremely high quality', 'Supports layers', 'Lossless'],
      cons: ['Very large files', 'Limited web support'],
      icon: <ShieldCheck className="w-5 h-5 text-purple-500" />
    },
    { 
      name: 'GIF', 
      mime: 'image/gif' as OutputFormat,
      ext: '.gif', 
      desc: 'Limited color format supporting basic animation and transparency.',
      pros: ['Animation support', 'Small for simple icons'],
      cons: ['Only 256 colors', 'Poor for photos'],
      icon: <CheckCircle2 className="w-5 h-5 text-green-500" />
    }
  ];

  return (
    <div className="flex-1 flex flex-col gap-6 min-h-0 overflow-hidden">
      <header className="flex justify-between items-center shrink-0">
        <div>
          <h1 className={cn("text-2xl font-bold", isDarkMode ? "text-white" : "text-[#1e293b]")}>Format Explorer</h1>
          <p className={cn("text-sm", isDarkMode ? "text-slate-500" : "text-[#64748b]")}>Learn about formats and select one to start converting</p>
        </div>
        <Badge variant="outline" className={cn(isDarkMode ? "border-slate-700 text-slate-400" : "border-[#e2e8f0] text-[#64748b]")}>
          v2.0 Stable
        </Badge>
      </header>

      <ScrollArea className="flex-1 min-h-0">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-8 pr-4">
          {formats.map((f) => (
            <Card 
              key={f.name} 
              onClick={() => onSelectFormat(f.mime)}
              className={cn(
                "border shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer group relative overflow-hidden",
                isDarkMode ? "bg-[#1e293b] border-slate-800 hover:border-[#4f46e5]/50" : "bg-white border-[#e2e8f0] hover:border-[#4f46e5]/50"
              )}
            >
              <div className="absolute top-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <ArrowRightLeft className="w-4 h-4 text-[#4f46e5]" />
              </div>
              
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3 mb-2">
                  <div className={cn(
                    "p-2 rounded-lg transition-colors",
                    isDarkMode ? "bg-slate-800 group-hover:bg-[#4f46e5]/20" : "bg-slate-50 group-hover:bg-[#f5f3ff]"
                  )}>
                    {f.icon}
                  </div>
                  <div>
                    <CardTitle className={cn("text-lg", isDarkMode ? "text-white" : "text-[#1e293b]")}>{f.name}</CardTitle>
                    <CardDescription className={isDarkMode ? "text-slate-500" : "text-[#64748b]"}>{f.ext}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className={cn("text-sm leading-relaxed", isDarkMode ? "text-slate-400" : "text-[#64748b]")}>
                  {f.desc}
                </p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-green-500">
                    <CheckCircle2 className="w-3 h-3" /> Pros
                  </div>
                  <ul className="space-y-1">
                    {f.pros.map(p => (
                      <li key={p} className={cn("text-xs flex items-center gap-2", isDarkMode ? "text-slate-300" : "text-slate-600")}>
                        <div className="w-1 h-1 rounded-full bg-green-500" /> {p}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-red-500">
                    <AlertCircle className="w-3 h-3" /> Cons
                  </div>
                  <ul className="space-y-1">
                    {f.cons.map(c => (
                      <li key={c} className={cn("text-xs flex items-center gap-2", isDarkMode ? "text-slate-300" : "text-slate-600")}>
                        <div className="w-1 h-1 rounded-full bg-red-500" /> {c}
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
