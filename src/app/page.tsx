"use client";

import Image from "next/image";
import JSZip from "jszip";
import { ChangeEvent, useEffect, useMemo, useState } from "react";

type UiStatus = "idle" | "pending" | "processing" | "completed" | "failed";
type OutputFormat = "jpg" | "png" | "webp";
type Mode = "convert" | "compress";

type UploadedFile = {
  localId: string;
  file: File;
  previewUrl: string;
  dimensions?: { width: number; height: number };
  status: UiStatus;
  progress: number;
  error?: string;
  outputSize?: number;
  outputFileName?: string;
  outputBlob?: Blob;
  outputUrl?: string;
};

type ProcessSettings = {
  outputFormat: OutputFormat;
  quality: number;
  pngCompressionLevel: number;
  maxWidth?: number;
  maxHeight?: number;
};

const defaultSettings: ProcessSettings = {
  outputFormat: "webp",
  quality: 80,
  pngCompressionLevel: 9,
};

const parsedClientMaxFiles = Number(process.env.NEXT_PUBLIC_MAX_FILES_PER_BATCH ?? 20);
const MAX_FILES_PER_BATCH = Number.isInteger(parsedClientMaxFiles) && parsedClientMaxFiles > 0 ? parsedClientMaxFiles : 20;

function createLocalId(): string {
  if (typeof globalThis !== "undefined" && globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function bytesToKb(value: number): string {
  return `${(value / 1024).toFixed(1)} кБ`;
}

function statusLabel(status: UiStatus): string {
  if (status === "idle") return "ожидает";
  if (status === "pending") return "в очереди";
  if (status === "processing") return "обрабатывается";
  if (status === "completed") return "готово";
  return "ошибка";
}

function statusTone(status: UiStatus, isDark: boolean): string {
  if (status === "completed") return isDark ? "text-emerald-300 bg-emerald-900/30 border-emerald-700/50" : "text-emerald-700 bg-emerald-50 border-emerald-200";
  if (status === "failed") return isDark ? "text-rose-300 bg-rose-900/30 border-rose-700/50" : "text-rose-700 bg-rose-50 border-rose-200";
  if (status === "processing" || status === "pending") return isDark ? "text-sky-300 bg-sky-900/30 border-sky-700/50" : "text-sky-700 bg-sky-50 border-sky-200";
  return isDark ? "text-slate-300 bg-slate-800 border-slate-700" : "text-slate-600 bg-slate-100 border-slate-200";
}

function getOutputFormat(file: File, mode: Mode, selected: OutputFormat): OutputFormat {
  if (mode === "convert") {
    return selected;
  }
  return file.type === "image/png" ? "png" : "jpg";
}

function getMimeType(format: OutputFormat): string {
  if (format === "jpg") return "image/jpeg";
  if (format === "png") return "image/png";
  return "image/webp";
}

function replaceExtension(fileName: string, extension: string): string {
  const base = fileName.replace(/\.[^/.]+$/, "");
  return `${base}.${extension}`;
}

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new window.Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Не удалось загрузить изображение."));
      img.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function processInBrowser(file: File, mode: Mode, settings: ProcessSettings): Promise<{ blob: Blob; fileName: string }> {
  const outputFormat = getOutputFormat(file, mode, settings.outputFormat);
  const outputMime = getMimeType(outputFormat);

  const image = await loadImage(file);
  let targetWidth = image.naturalWidth;
  let targetHeight = image.naturalHeight;

  if (mode === "compress" && (settings.maxWidth || settings.maxHeight)) {
    const maxW = settings.maxWidth ?? image.naturalWidth;
    const maxH = settings.maxHeight ?? image.naturalHeight;
    const ratio = Math.min(maxW / image.naturalWidth, maxH / image.naturalHeight, 1);
    targetWidth = Math.max(1, Math.round(image.naturalWidth * ratio));
    targetHeight = Math.max(1, Math.round(image.naturalHeight * ratio));
  }

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Не удалось создать canvas-контекст.");
  }

  if (outputFormat === "jpg") {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  context.drawImage(image, 0, 0, targetWidth, targetHeight);
  const quality = outputFormat === "png" ? undefined : settings.quality / 100;

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (createdBlob) => {
        if (!createdBlob) {
          reject(new Error("Не удалось создать выходной файл."));
          return;
        }
        resolve(createdBlob);
      },
      outputMime,
      quality,
    );
  });

  return {
    blob,
    fileName: replaceExtension(file.name, outputFormat),
  };
}

export default function Home() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [settings, setSettings] = useState<ProcessSettings>(defaultSettings);
  const [mode, setMode] = useState<Mode>("convert");
  const [globalError, setGlobalError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === "undefined") return false;
    const saved = window.localStorage.getItem("theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    return saved ? saved === "dark" : prefersDark;
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    window.localStorage.setItem("theme", isDark ? "dark" : "light");
  }, [isDark]);

  useEffect(() => {
    return () => {
      for (const item of files) {
        URL.revokeObjectURL(item.previewUrl);
        if (item.outputUrl) URL.revokeObjectURL(item.outputUrl);
      }
    };
  }, [files]);

  const completedEntries = useMemo(() => files.filter((file) => file.status === "completed" && file.outputBlob && file.outputFileName), [files]);
  const hasFiles = files.length > 0;
  const hasActiveProcessing = files.some((file) => file.status === "pending" || file.status === "processing");
  const hasRunFinished = hasFiles && !hasActiveProcessing && files.some((file) => file.status !== "idle");
  const canDownloadZip = hasRunFinished && completedEntries.length > 0;
  const skeletonCount = isSubmitting ? Math.min(Math.max(files.length, 2), 6) : 0;

  async function attachDimensions(entry: UploadedFile): Promise<UploadedFile> {
    const img = new window.Image();
    img.src = entry.previewUrl;
    await new Promise<void>((resolve) => {
      img.onload = () => resolve();
      img.onerror = () => resolve();
    });
    return { ...entry, dimensions: img.naturalWidth ? { width: img.naturalWidth, height: img.naturalHeight } : undefined };
  }

  async function handleFiles(selected: FileList | null): Promise<void> {
    if (!selected) return;
    setGlobalError("");

    const incoming = Array.from(selected);
    const filtered = incoming.filter((file) => ["image/jpeg", "image/jpg", "image/png"].includes(file.type));
    if (filtered.length !== incoming.length) {
      setGlobalError("Часть файлов пропущена. Поддерживаются только JPG и PNG.");
    }

    const prepared = await Promise.all(
      filtered.map((file) =>
        attachDimensions({
          localId: createLocalId(),
          file,
          previewUrl: URL.createObjectURL(file),
          status: "idle",
          progress: 0,
        }),
      ),
    );

    setFiles((prev) => [...prev, ...prepared].slice(0, MAX_FILES_PER_BATCH));
  }

  async function handleInputChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    await handleFiles(event.target.files);
    event.target.value = "";
  }

  function updateSetting<K extends keyof ProcessSettings>(key: K, value: ProcessSettings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  async function processAll(): Promise<void> {
    if (files.length === 0 || isSubmitting) return;
    setIsSubmitting(true);
    setGlobalError("");

    for (const fileEntry of files) {
      if (fileEntry.status === "completed") continue;

      setFiles((prev) =>
        prev.map((entry) =>
          entry.localId === fileEntry.localId
            ? { ...entry, status: "pending", progress: 5, error: undefined }
            : entry,
        ),
      );

      try {
        setFiles((prev) =>
          prev.map((entry) =>
            entry.localId === fileEntry.localId ? { ...entry, status: "processing", progress: 35 } : entry,
          ),
        );

        const result = await processInBrowser(fileEntry.file, mode, settings);
        const outputUrl = URL.createObjectURL(result.blob);

        setFiles((prev) =>
          prev.map((entry) => {
            if (entry.localId !== fileEntry.localId) return entry;
            if (entry.outputUrl) URL.revokeObjectURL(entry.outputUrl);
            return {
              ...entry,
              status: "completed",
              progress: 100,
              outputBlob: result.blob,
              outputUrl,
              outputSize: result.blob.size,
              outputFileName: result.fileName,
            };
          }),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Неизвестная ошибка";
        setFiles((prev) =>
          prev.map((entry) =>
            entry.localId === fileEntry.localId
              ? { ...entry, status: "failed", progress: 100, error: message }
              : entry,
          ),
        );
      }
    }

    setIsSubmitting(false);
  }

  function downloadEntry(entry: UploadedFile): void {
    if (!entry.outputBlob || !entry.outputFileName) return;
    const blobUrl = URL.createObjectURL(entry.outputBlob);
    const anchor = document.createElement("a");
    anchor.href = blobUrl;
    anchor.download = entry.outputFileName;
    anchor.click();
    URL.revokeObjectURL(blobUrl);
  }

  async function downloadAllZip(): Promise<void> {
    if (completedEntries.length === 0) return;
    const zip = new JSZip();

    for (const entry of completedEntries) {
      if (!entry.outputBlob || !entry.outputFileName) continue;
      zip.file(entry.outputFileName, entry.outputBlob);
    }

    const zipBlob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
    const url = URL.createObjectURL(zipBlob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "obrabotannye-izobrazheniya.zip";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function removeFile(localId: string): void {
    setFiles((prev) => {
      const found = prev.find((item) => item.localId === localId);
      if (found) {
        URL.revokeObjectURL(found.previewUrl);
        if (found.outputUrl) URL.revokeObjectURL(found.outputUrl);
      }
      return prev.filter((item) => item.localId !== localId);
    });
  }

  function clearFiles(): void {
    for (const item of files) {
      URL.revokeObjectURL(item.previewUrl);
      if (item.outputUrl) URL.revokeObjectURL(item.outputUrl);
    }
    setFiles([]);
    setGlobalError("");
  }

  const cardClass = isDark
    ? "anim-fade-up rounded-3xl border border-slate-800 bg-slate-900/95 p-6 shadow-[0_12px_40px_-24px_rgba(0,0,0,0.8)] backdrop-blur"
    : "anim-fade-up rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-[0_12px_40px_-24px_rgba(15,23,42,0.25)] backdrop-blur";
  const textMuted = isDark ? "text-slate-400" : "text-slate-500";

  return (
    <main className={isDark ? "min-h-screen bg-[radial-gradient(circle_at_top,#1e293b_0%,#020617_42%,#020617_100%)] text-slate-100 transition-colors duration-500" : "min-h-screen bg-[radial-gradient(circle_at_top,#e2e8f0_0%,#f8fafc_45%,#f8fafc_100%)] transition-colors duration-500"}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
        <section className={cardClass}>
          <div className="mb-3 flex items-start justify-between gap-3">
            <h1 className={isDark ? "text-3xl font-bold tracking-tight text-slate-100" : "text-3xl font-bold tracking-tight text-slate-900"}>Сжатие и конвертация изображений</h1>
            <button
              type="button"
              className={isDark ? "cursor-pointer rounded-xl border border-slate-700 p-2 text-slate-200 transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-500 hover:bg-slate-800" : "cursor-pointer rounded-xl border border-slate-300 p-2 text-slate-700 transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-500 hover:bg-slate-50"}
              onClick={() => setIsDark((prev) => !prev)}
              aria-label={isDark ? "Включить светлую тему" : "Включить тёмную тему"}
              title={isDark ? "Светлая тема" : "Тёмная тема"}
            >
              {isDark ? (
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2.5M12 19.5V22M4.93 4.93l1.77 1.77M17.3 17.3l1.77 1.77M2 12h2.5M19.5 12H22M4.93 19.07l1.77-1.77M17.3 6.7l1.77-1.77" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 1 0 9.8 9.8z" />
                </svg>
              )}
            </button>
          </div>
          <p className={isDark ? "mt-2 text-sm text-slate-300" : "mt-2 text-sm text-slate-600"}>
            Приложение работает полностью в браузере: без SSR и без серверной обработки файлов.
          </p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => setMode("convert")}
              className={
                mode === "convert"
                  ? "cursor-pointer rounded-xl bg-slate-900 px-3 py-2 text-xs text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 dark:bg-slate-100 dark:text-slate-900"
                  : isDark
                    ? "cursor-pointer rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-300 transition-all duration-200 hover:border-slate-500 hover:bg-slate-800"
                    : "cursor-pointer rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-700 transition-all duration-200 hover:border-slate-500 hover:bg-slate-50"
              }
            >
              Конвертация
            </button>
            <button
              type="button"
              onClick={() => setMode("compress")}
              className={
                mode === "compress"
                  ? "cursor-pointer rounded-xl bg-slate-900 px-3 py-2 text-xs text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 dark:bg-slate-100 dark:text-slate-900"
                  : isDark
                    ? "cursor-pointer rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-300 transition-all duration-200 hover:border-slate-500 hover:bg-slate-800"
                    : "cursor-pointer rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-700 transition-all duration-200 hover:border-slate-500 hover:bg-slate-50"
              }
            >
              Сжатие
            </button>
          </div>
        </section>

        <section className={`${cardClass} md:grid md:grid-cols-2 md:gap-6`}>
          <div className="space-y-4">
            <h2 className={isDark ? "text-lg font-semibold text-slate-100" : "text-lg font-semibold text-slate-900"}>Загрузка</h2>
            <label className={isDark ? "flex min-h-40 cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed border-slate-700 bg-slate-950 p-8 text-center text-sm text-slate-300 transition-all duration-200 hover:-translate-y-0.5 hover:border-sky-500/70 hover:bg-slate-900" : "flex min-h-40 cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/60 p-8 text-center text-sm text-slate-600 transition-all duration-200 hover:-translate-y-0.5 hover:border-sky-400 hover:bg-white"}>
              <span>
                Перетащите файлы сюда
                <br />
                или нажмите для выбора
              </span>
              <input type="file" accept=".jpg,.jpeg,.png" className="hidden" multiple onChange={handleInputChange} />
            </label>
            <p className={`text-xs ${textMuted}`}>Ограничение: максимум {MAX_FILES_PER_BATCH} файлов, до 10 МБ каждый</p>
          </div>

          <div className="mt-6 space-y-4 md:mt-0">
            <h2 className={isDark ? "text-lg font-semibold text-slate-100" : "text-lg font-semibold text-slate-900"}>Параметры обработки</h2>
            <div className="grid gap-3 text-sm">
              {mode === "convert" ? (
                <label className={isDark ? "grid gap-1 text-slate-300" : "grid gap-1 text-slate-700"}>
                  Формат конвертации
                  <select
                    className={isDark ? "rounded-xl border border-slate-700 bg-slate-950 px-3 py-2" : "rounded-xl border border-slate-300 px-3 py-2"}
                    value={settings.outputFormat}
                    onChange={(event) => updateSetting("outputFormat", event.target.value as OutputFormat)}
                  >
                    <option value="jpg">JPG</option>
                    <option value="webp">WebP</option>
                  </select>
                </label>
              ) : (
                <p className={`rounded-xl border px-3 py-2 text-xs ${isDark ? "border-slate-700 text-slate-300" : "border-slate-300 text-slate-700"}`}>
                  Режим сжатия: формат сохраняется как у исходного файла.
                </p>
              )}
              {mode === "compress" ? (
                <>
                  <label className={isDark ? "grid gap-1 text-slate-300" : "grid gap-1 text-slate-700"}>
                    Качество: {settings.quality}
                    <input type="range" min={1} max={100} value={settings.quality} onChange={(event) => updateSetting("quality", Number(event.target.value))} />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className={isDark ? "grid gap-1 text-slate-300" : "grid gap-1 text-slate-700"}>
                      Макс. ширина
                      <input
                        type="number"
                        className={isDark ? "rounded-xl border border-slate-700 bg-slate-950 px-3 py-2" : "rounded-xl border border-slate-300 px-3 py-2"}
                        min={1}
                        max={12000}
                        value={settings.maxWidth ?? ""}
                        onChange={(event) => updateSetting("maxWidth", event.target.value ? Number(event.target.value) : undefined)}
                      />
                    </label>
                    <label className={isDark ? "grid gap-1 text-slate-300" : "grid gap-1 text-slate-700"}>
                      Макс. высота
                      <input
                        type="number"
                        className={isDark ? "rounded-xl border border-slate-700 bg-slate-950 px-3 py-2" : "rounded-xl border border-slate-300 px-3 py-2"}
                        min={1}
                        max={12000}
                        value={settings.maxHeight ?? ""}
                        onChange={(event) => updateSetting("maxHeight", event.target.value ? Number(event.target.value) : undefined)}
                      />
                    </label>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </section>

        <section className={cardClass}>
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              className={isDark ? "cursor-pointer rounded-xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 disabled:opacity-50" : "cursor-pointer rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"}
              disabled={!hasFiles || isSubmitting}
              onClick={() => {
                if (hasRunFinished) {
                  clearFiles();
                  return;
                }
                void processAll();
              }}
            >
              {isSubmitting ? "Обработка..." : hasRunFinished ? "Очистить список" : "Запуск"}
            </button>
            {canDownloadZip ? (
              <button
                type="button"
                className={isDark ? "anim-shine cursor-pointer rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-500 hover:bg-slate-800" : "anim-shine cursor-pointer rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-500 hover:bg-slate-50"}
                onClick={() => void downloadAllZip()}
              >
                Скачать ZIP
              </button>
            ) : null}
          </div>

          {globalError ? <p className="mb-3 text-sm text-rose-600">{globalError}</p> : null}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {files.length === 0 ? (
              <div className={`anim-fade-up col-span-full rounded-2xl border p-8 text-center ${isDark ? "border-slate-800 bg-slate-900/70 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-dashed border-sky-400/60">
                  <svg viewBox="0 0 24 24" className="anim-soft-pulse h-7 w-7 text-sky-500" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <path d="M12 16V4M7 9l5-5 5 5" />
                    <rect x="3" y="16" width="18" height="4" rx="2" />
                  </svg>
                </div>
                <p className="text-sm font-medium">Пока нет загруженных файлов</p>
                <p className={`mt-1 text-xs ${textMuted}`}>Добавьте изображения через блок загрузки выше, затем нажмите «Запуск».</p>
              </div>
            ) : null}
            {files.map((entry, index) => (
              <article
                key={entry.localId}
                className={isDark ? "anim-fade-up rounded-2xl border border-slate-800 p-3 transition-all duration-300 hover:-translate-y-0.5 hover:border-slate-600 hover:bg-slate-900" : "anim-fade-up rounded-2xl border border-slate-200 p-3 transition-all duration-300 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white"}
                style={{ animationDelay: `${Math.min(index * 40, 300)}ms` }}
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <p className={isDark ? "line-clamp-2 text-sm font-medium text-slate-100" : "line-clamp-2 text-sm font-medium text-slate-900"}>{entry.file.name}</p>
                  <button
                    type="button"
                    aria-label="Удалить файл"
                    className="cursor-pointer rounded-md px-2 text-lg leading-none text-rose-600 transition-all duration-200 hover:scale-110 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/40"
                    onClick={() => removeFile(entry.localId)}
                  >
                    ×
                  </button>
                </div>
                <Image src={entry.previewUrl} alt={entry.file.name} width={240} height={140} unoptimized className="mb-2 h-28 w-full rounded-lg object-cover" />
                <div>
                  <p className={`text-xs ${textMuted}`}>
                    {bytesToKb(entry.file.size)}
                    {entry.dimensions ? ` • ${entry.dimensions.width}x${entry.dimensions.height}` : ""}
                  </p>
                  <p className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-xs ${statusTone(entry.status, isDark)} ${entry.status === "processing" ? "anim-soft-pulse" : ""}`}>
                    {statusLabel(entry.status)}
                  </p>
                  {entry.error ? <p className="text-xs text-rose-600">{entry.error}</p> : null}
                </div>
                <div className="mt-2 flex gap-2">
                  {entry.status === "completed" && entry.outputBlob ? (
                    <button
                      type="button"
                      className={isDark ? "cursor-pointer rounded-lg border border-slate-700 px-3 py-1 text-xs text-slate-200 transition-all duration-200 hover:border-slate-500 hover:bg-slate-800" : "cursor-pointer rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-700 transition-all duration-200 hover:border-slate-500 hover:bg-slate-50"}
                      onClick={() => downloadEntry(entry)}
                    >
                      Скачать
                    </button>
                  ) : null}
                </div>
                <div className={isDark ? "mt-3 h-2 w-full overflow-hidden rounded bg-slate-800" : "mt-3 h-2 w-full overflow-hidden rounded bg-slate-100"}>
                  <div
                    className={isDark ? "h-full bg-gradient-to-r from-slate-300 to-slate-100 transition-all duration-500" : "h-full bg-gradient-to-r from-slate-700 to-slate-900 transition-all duration-500"}
                    style={{ width: `${entry.progress}%` }}
                  />
                </div>
                {entry.status === "completed" && entry.outputSize ? (
                  <p className="mt-2 text-xs text-emerald-700">
                    Готово: {entry.outputFileName} ({bytesToKb(entry.outputSize)})
                  </p>
                ) : null}
              </article>
            ))}
            {Array.from({ length: skeletonCount }).map((_, idx) => (
              <div
                key={`skeleton-${idx}`}
                className={isDark ? "anim-fade-up rounded-2xl border border-slate-800 p-3" : "anim-fade-up rounded-2xl border border-slate-200 p-3"}
                style={{ animationDelay: `${Math.min(idx * 60, 360)}ms` }}
              >
                <div className={isDark ? "mb-2 h-4 w-3/4 rounded bg-slate-800 anim-soft-pulse" : "mb-2 h-4 w-3/4 rounded bg-slate-200 anim-soft-pulse"} />
                <div className={isDark ? "mb-2 h-28 w-full rounded-lg bg-slate-800 anim-soft-pulse" : "mb-2 h-28 w-full rounded-lg bg-slate-200 anim-soft-pulse"} />
                <div className={isDark ? "h-3 w-2/3 rounded bg-slate-800 anim-soft-pulse" : "h-3 w-2/3 rounded bg-slate-200 anim-soft-pulse"} />
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
