import { ProcessOptions } from "@/lib/types";

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/jpg", "image/png"]);
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const parsedMaxFilesPerBatch = Number(process.env.MAX_FILES_PER_BATCH ?? 20);
const MAX_FILES_PER_BATCH = Number.isInteger(parsedMaxFilesPerBatch) && parsedMaxFilesPerBatch > 0 ? parsedMaxFilesPerBatch : 20;

const DEFAULT_OPTIONS: ProcessOptions = {
  outputFormat: "jpg",
  quality: 80,
  pngCompressionLevel: 9,
  resize: {},
  backgroundColor: "#ffffff",
};

const HEX_COLOR_REGEX = /^#([0-9A-F]{6}|[0-9A-F]{3})$/i;

export function validateImageFile(file: File): void {
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    throw new Error("Only JPG and PNG files are supported.");
  }

  if (file.size === 0) {
    throw new Error("Uploaded file is empty.");
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error("File exceeds 10MB limit.");
  }
}

export function validateBatchSize(filesCount: number): void {
  if (filesCount > MAX_FILES_PER_BATCH) {
    throw new Error(`Batch limit is ${MAX_FILES_PER_BATCH} files.`);
  }
}

export function parseAndValidateOptions(raw: unknown, inputMimeType: string): ProcessOptions {
  const parsed = raw ? (JSON.parse(String(raw)) as Partial<ProcessOptions>) : {};

  const options: ProcessOptions = {
    ...DEFAULT_OPTIONS,
    ...parsed,
    resize: {
      ...DEFAULT_OPTIONS.resize,
      ...(parsed.resize ?? {}),
    },
  };

  if (!Number.isFinite(options.quality) || options.quality < 1 || options.quality > 100) {
    throw new Error("Quality must be in range 1-100.");
  }

  if (
    !Number.isInteger(options.pngCompressionLevel) ||
    options.pngCompressionLevel < 0 ||
    options.pngCompressionLevel > 9
  ) {
    throw new Error("PNG compression must be in range 0-9.");
  }

  if (options.resize.maxWidth && (options.resize.maxWidth < 1 || options.resize.maxWidth > 12000)) {
    throw new Error("maxWidth must be in range 1-12000.");
  }

  if (options.resize.maxHeight && (options.resize.maxHeight < 1 || options.resize.maxHeight > 12000)) {
    throw new Error("maxHeight must be in range 1-12000.");
  }

  if (!HEX_COLOR_REGEX.test(options.backgroundColor)) {
    throw new Error("Background color must be a valid hex color.");
  }

  validateFormatCombination(inputMimeType, options.outputFormat);
  return options;
}

export function validateFormatCombination(inputMimeType: string, outputFormat: ProcessOptions["outputFormat"]): void {
  const normalizedInput = inputMimeType === "image/png" ? "png" : "jpg";

  if (outputFormat === "webp") {
    return;
  }

  if (normalizedInput === outputFormat) {
    return;
  }

  if (normalizedInput === "png" && outputFormat === "jpg") {
    return;
  }

  throw new Error("Unsupported conversion. Allowed: PNG->JPG, JPG->WEBP, PNG->WEBP, or compression in original format.");
}

export const limits = {
  maxFileSizeBytes: MAX_FILE_SIZE_BYTES,
  maxFilesPerBatch: MAX_FILES_PER_BATCH,
};
