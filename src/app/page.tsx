"use client";

import Image from "next/image";
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
  jobId?: string;
  error?: string;
  outputSize?: number;
  outputFileName?: string;
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

export default function Home() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [settings, setSettings] = useState<ProcessSettings>(defaultSettings);
  const [mode, setMode] = useState<Mode>("convert");
  const [globalError, setGlobalError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setIsDark(saved ? saved === "dark" : prefersDark);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    window.localStorage.setItem("theme", isDark ? "dark" : "light");
  }, [isDark]);

  useEffect(() => {
    return () => {
      for (const file of files) URL.revokeObjectURL(file.previewUrl);
    };
  }, [files]);

  useEffect(() => {
    const activeJobs = files.filter((f) => f.jobId && (f.status === "pending" || f.status === "processing"));
    if (activeJobs.length === 0) return;

    const timer = setInterval(async () => {
      for (const file of activeJobs) {
        if (!file.jobId) continue;
        try {
          const response = await fetch(`/api/jobs/${file.jobId}`);
          const data = (await response.json()) as {
            status?: UiStatus;
            progress?: number;
            error?: string;
            outputSize?: number;
            outputFileName?: string;
          };

          if (!response.ok || !data.status) continue;
          const nextStatus: UiStatus = data.status;
          setFiles((prev) =>
            prev.map((entry) =>
              entry.localId === file.localId
                ? {
                    ...entry,
                    status: nextStatus,
                    progress: data.progress ?? entry.progress,
                    error: data.error,
                    outputSize: data.outputSize,
                    outputFileName: data.outputFileName,
                  }
                : entry,
            ),
          );
        } catch {
          setFiles((prev) =>
            prev.map((entry) =>
              entry.localId === file.localId
                ? { ...entry, status: "failed", progress: 100, error: "Не удалось получить статус обработки." }
                : entry,
            ),
          );
        }
      }
    }, 1500);

    return () => clearInterval(timer);
  }, [files]);

  const completedJobIds = useMemo(
    () => files.filter((file) => file.status === "completed" && file.jobId).map((file) => file.jobId as string),
    [files],
  );
  const hasFiles = files.length > 0;
  const hasActiveProcessing = files.some((file) => file.status === "pending" || file.status === "processing");
  const hasRunFinished = hasFiles && !hasActiveProcessing && files.some((file) => file.status !== "idle");
  const canDownloadZip = hasRunFinished && completedJobIds.length > 0;
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
        prev.map((entry) => (entry.localId === fileEntry.localId ? { ...entry, status: "pending", progress: 5, error: undefined } : entry)),
      );

      const payload = new FormData();
      payload.set("file", fileEntry.file);
      payload.set(
        "options",
        JSON.stringify({
          outputFormat: mode === "compress" ? (fileEntry.file.type === "image/png" ? "png" : "jpg") : settings.outputFormat,
          quality: settings.quality,
          pngCompressionLevel: settings.pngCompressionLevel,
          resize: { maxWidth: settings.maxWidth, maxHeight: settings.maxHeight },
          backgroundColor: "#ffffff",
        }),
      );

      try {
        const response = await fetch("/api/images/process", { method: "POST", body: payload });
        const data = (await response.json()) as { error?: string; jobId?: string; progress?: number; status?: UiStatus };
        if (!response.ok || !data.jobId || !data.status) {
          throw new Error(data.error || "Не удалось добавить файл в очередь.");
        }
        const queuedStatus: UiStatus = data.status;
        setFiles((prev) =>
          prev.map((entry) =>
            entry.localId === fileEntry.localId
              ? { ...entry, jobId: data.jobId, status: queuedStatus, progress: data.progress ?? 10 }
              : entry,
          ),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Неизвестная ошибка";
        setFiles((prev) =>
          prev.map((entry) =>
            entry.localId === fileEntry.localId ? { ...entry, status: "failed", progress: 100, error: message } : entry,
          ),
        );
      }
    }
    setIsSubmitting(false);
  }

  async function downloadJob(jobId: string): Promise<void> {
    const response = await fetch(`/api/jobs/${jobId}/download`);
    if (!response.ok) {
      setGlobalError("Не удалось скачать файл.");
      return;
    }
    const blob = await response.blob();
    const contentDisposition = response.headers.get("content-disposition") ?? "";
    const fileNameMatch = contentDisposition.match(/filename="(.+)"/);
    const fileName = fileNameMatch?.[1] || "converted-image";
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function downloadAllZip(): Promise<void> {
    if (completedJobIds.length === 0) return;
    const response = await fetch("/api/jobs/download-zip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobIds: completedJobIds }),
    });
    if (!response.ok) {
      setGlobalError("Не удалось скачать ZIP-архив.");
      return;
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "obrabotannye-izobrazheniya.zip";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function removeFile(localId: string): void {
    setFiles((prev) => {
      const found = prev.find((item) => item.localId === localId);
      if (found) URL.revokeObjectURL(found.previewUrl);
      return prev.filter((item) => item.localId !== localId);
    });
  }

  function clearFiles(): void {
    for (const file of files) {
      URL.revokeObjectURL(file.previewUrl);
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
            Выберите режим: отдельная вкладка для конвертации и отдельная для сжатия с сохранением формата.
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
                  <label className={isDark ? "grid gap-1 text-slate-300" : "grid gap-1 text-slate-700"}>
                    Уровень PNG-сжатия: {settings.pngCompressionLevel}
                    <input
                      type="range"
                      min={0}
                      max={9}
                      value={settings.pngCompressionLevel}
                      onChange={(event) => updateSetting("pngCompressionLevel", Number(event.target.value))}
                    />
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
              {isSubmitting ? "Добавление в очередь..." : hasRunFinished ? "Очистить список" : "Запуск"}
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
              <div
                className={`anim-fade-up col-span-full rounded-2xl border p-8 text-center ${
                  isDark ? "border-slate-800 bg-slate-900/70 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-600"
                }`}
              >
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
                    {entry.jobId && entry.status === "completed" ? (
                    <button
                      type="button"
                      className={isDark ? "cursor-pointer rounded-lg border border-slate-700 px-3 py-1 text-xs text-slate-200 transition-all duration-200 hover:border-slate-500 hover:bg-slate-800" : "cursor-pointer rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-700 transition-all duration-200 hover:border-slate-500 hover:bg-slate-50"}
                      onClick={() => void downloadJob(entry.jobId!)}
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
