import JSZip from "jszip";
import { NextResponse } from "next/server";
import { getJobs } from "@/lib/jobQueue";
import { validateBatchSize } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ZipRequest = {
  jobIds: string[];
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ZipRequest;
    if (!Array.isArray(body.jobIds) || body.jobIds.length === 0) {
      return NextResponse.json({ error: "jobIds array is required." }, { status: 400 });
    }

    validateBatchSize(body.jobIds.length);

    const jobs = getJobs(body.jobIds).filter((job) => job.status === "completed" && job.result);
    if (jobs.length === 0) {
      return NextResponse.json({ error: "No completed jobs to archive." }, { status: 400 });
    }

    const zip = new JSZip();
    for (const job of jobs) {
      zip.file(job.result!.outputFileName, job.result!.outputBuffer);
    }

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });

    return new NextResponse(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="converted-images.zip"',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create zip file.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
