import { NextResponse } from "next/server";
import { enqueueProcessingJob } from "@/lib/jobQueue";
import { parseAndValidateOptions, validateImageFile } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const optionsRaw = formData.get("options");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File is required." }, { status: 400 });
    }

    validateImageFile(file);
    const options = parseAndValidateOptions(optionsRaw, file.type);
    const buffer = Buffer.from(await file.arrayBuffer());

    const job = enqueueProcessingJob({
      fileName: file.name,
      mimeType: file.type,
      buffer,
      options,
    });

    return NextResponse.json({ jobId: job.id, status: job.status, progress: job.progress });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Processing request failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
