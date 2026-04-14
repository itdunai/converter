import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { POST as processRoute } from "@/app/api/images/process/route";
import { GET as statusRoute } from "@/app/api/jobs/[id]/route";
import { GET as downloadRoute } from "@/app/api/jobs/[id]/download/route";

async function waitForCompletion(jobId: string): Promise<{ status: string }> {
  for (let i = 0; i < 20; i += 1) {
    const response = await statusRoute(new Request("http://localhost"), {
      params: Promise.resolve({ id: jobId }),
    });
    const payload = (await response.json()) as { status: string };

    if (payload.status === "completed" || payload.status === "failed") {
      return payload;
    }

    await new Promise((resolve) => setTimeout(resolve, 60));
  }

  throw new Error("Job timeout.");
}

describe("image processing API", () => {
  it("processes png to webp", async () => {
    const input = await sharp({
      create: {
        width: 20,
        height: 20,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const file = new File([input], "sample.png", { type: "image/png" });
    const body = new FormData();
    body.set("file", file);
    body.set(
      "options",
      JSON.stringify({
        outputFormat: "webp",
        quality: 80,
        pngCompressionLevel: 9,
        resize: {},
        backgroundColor: "#ffffff",
      }),
    );

    const processResponse = await processRoute(
      new Request("http://localhost/api/images/process", {
        method: "POST",
        body,
      }),
    );
    expect(processResponse.status).toBe(200);

    const processPayload = (await processResponse.json()) as { jobId: string };
    const finalStatus = await waitForCompletion(processPayload.jobId);
    expect(finalStatus.status).toBe("completed");

    const downloadResponse = await downloadRoute(new Request("http://localhost"), {
      params: Promise.resolve({ id: processPayload.jobId }),
    });
    expect(downloadResponse.status).toBe(200);
    expect(downloadResponse.headers.get("content-type")).toContain("image/webp");
  });
});
