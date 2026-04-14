import { NextResponse } from "next/server";
import { getJob } from "@/lib/jobQueue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_: Request, { params }: Params) {
  const { id } = await params;
  const job = getJob(id);

  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  return NextResponse.json({
    id: job.id,
    fileName: job.fileName,
    status: job.status,
    progress: job.progress,
    error: job.error,
    originalSize: job.result?.originalSize,
    outputSize: job.result?.outputSize,
    outputFileName: job.result?.outputFileName,
  });
}
