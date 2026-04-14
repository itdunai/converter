export type InputFormat = "jpg" | "jpeg" | "png";
export type OutputFormat = "jpg" | "png" | "webp";
export type JobStatus = "pending" | "processing" | "completed" | "failed";

export type ResizeOptions = {
  maxWidth?: number;
  maxHeight?: number;
};

export type ProcessOptions = {
  outputFormat: OutputFormat;
  quality: number;
  pngCompressionLevel: number;
  resize: ResizeOptions;
  backgroundColor: string;
};

export type ProcessingRequest = {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  options: ProcessOptions;
};

export type ProcessResult = {
  outputBuffer: Buffer;
  outputFileName: string;
  outputMimeType: string;
  originalSize: number;
  outputSize: number;
};

export type JobInfo = {
  id: string;
  fileName: string;
  status: JobStatus;
  progress: number;
  error?: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  result?: ProcessResult;
};
