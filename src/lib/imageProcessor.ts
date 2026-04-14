import sharp from "sharp";
import { ProcessOptions, ProcessResult } from "@/lib/types";

function getOutputMime(format: ProcessOptions["outputFormat"]): string {
  if (format === "webp") {
    return "image/webp";
  }

  return format === "png" ? "image/png" : "image/jpeg";
}

function replaceExtension(fileName: string, extension: string): string {
  const withoutExt = fileName.replace(/\.[^/.]+$/, "");
  return `${withoutExt}.${extension}`;
}

export async function processImage(
  buffer: Buffer,
  fileName: string,
  inputMimeType: string,
  options: ProcessOptions,
): Promise<ProcessResult> {
  const pipeline = sharp(buffer, { failOn: "none" });
  const metadata = await pipeline.metadata();

  if (options.resize.maxWidth || options.resize.maxHeight) {
    pipeline.resize({
      width: options.resize.maxWidth,
      height: options.resize.maxHeight,
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  if (inputMimeType === "image/png" && options.outputFormat === "jpg") {
    pipeline.flatten({ background: options.backgroundColor });
  }

  if (options.outputFormat === "webp") {
    pipeline.webp({ quality: options.quality, effort: 4 });
  } else if (options.outputFormat === "png") {
    pipeline.png({
      compressionLevel: options.pngCompressionLevel,
      quality: options.quality,
      adaptiveFiltering: true,
    });
  } else {
    pipeline.jpeg({ quality: options.quality, mozjpeg: true });
  }

  const outputBuffer = await pipeline.toBuffer();
  const outputExtension = options.outputFormat === "jpg" ? "jpg" : options.outputFormat;

  return {
    outputBuffer,
    outputFileName: replaceExtension(fileName, outputExtension),
    outputMimeType: getOutputMime(options.outputFormat),
    originalSize: buffer.byteLength,
    outputSize: outputBuffer.byteLength,
    // metadata is read to make sure file can be decoded and to keep room for future UI additions.
    ...(metadata.width ? {} : {}),
  };
}
