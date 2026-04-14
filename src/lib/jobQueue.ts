import { randomUUID } from "node:crypto";
import { processImage } from "@/lib/imageProcessor";
import { JobInfo, ProcessingRequest } from "@/lib/types";

const MAX_PARALLEL_JOBS = Number(process.env.MAX_PARALLEL_JOBS ?? 3);
const RETENTION_MS = 30 * 60 * 1000;
const MAX_JOBS_IN_MEMORY = 500;

const jobs = new Map<string, JobInfo>();
const queue: string[] = [];
const payloads = new Map<string, ProcessingRequest>();
let activeJobs = 0;

function cleanupOldJobs(): void {
  const now = Date.now();
  const entries = Array.from(jobs.entries());

  for (const [id, job] of entries) {
    if ((job.status === "completed" || job.status === "failed") && job.completedAt && now - job.completedAt > RETENTION_MS) {
      jobs.delete(id);
      payloads.delete(id);
    }
  }

  if (jobs.size <= MAX_JOBS_IN_MEMORY) {
    return;
  }

  const sorted = Array.from(jobs.values()).sort((a, b) => a.createdAt - b.createdAt);
  for (const item of sorted) {
    if (jobs.size <= MAX_JOBS_IN_MEMORY) {
      break;
    }
    jobs.delete(item.id);
    payloads.delete(item.id);
  }
}

async function processNext(): Promise<void> {
  if (activeJobs >= MAX_PARALLEL_JOBS) {
    return;
  }

  const nextId = queue.shift();
  if (!nextId) {
    return;
  }

  const job = jobs.get(nextId);
  const payload = payloads.get(nextId);
  if (!job || !payload) {
    processNext().catch(() => undefined);
    return;
  }

  activeJobs += 1;
  job.status = "processing";
  job.progress = 20;
  job.startedAt = Date.now();

  try {
    const result = await processImage(payload.buffer, payload.fileName, payload.mimeType, payload.options);
    job.result = result;
    job.status = "completed";
    job.progress = 100;
  } catch (error) {
    job.status = "failed";
    job.error = error instanceof Error ? error.message : "Unknown processing error.";
    job.progress = 100;
  } finally {
    job.completedAt = Date.now();
    payloads.delete(nextId);
    activeJobs -= 1;
    cleanupOldJobs();
    processNext().catch(() => undefined);
  }
}

setInterval(cleanupOldJobs, 5 * 60 * 1000).unref();

export function enqueueProcessingJob(payload: ProcessingRequest): JobInfo {
  const id = randomUUID();
  const job: JobInfo = {
    id,
    fileName: payload.fileName,
    status: "pending",
    progress: 0,
    createdAt: Date.now(),
  };

  jobs.set(id, job);
  payloads.set(id, payload);
  queue.push(id);

  processNext().catch(() => undefined);
  return job;
}

export function getJob(jobId: string): JobInfo | undefined {
  return jobs.get(jobId);
}

export function getJobs(jobIds: string[]): JobInfo[] {
  return jobIds.map((id) => jobs.get(id)).filter((job): job is JobInfo => Boolean(job));
}
