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

  if (job.status !== "completed" || !job.result) {
    return NextResponse.json({ error: "Job is not completed yet." }, { status: 409 });
  }

  return new NextResponse(new Uint8Array(job.result.outputBuffer), {
    status: 200,
    headers: {
      "Content-Type": job.result.outputMimeType,
      "Content-Disposition": `attachment; filename="${job.result.outputFileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
