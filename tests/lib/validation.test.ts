import { describe, expect, it } from "vitest";
import { parseAndValidateOptions, validateFormatCombination } from "@/lib/validation";

describe("validation", () => {
  it("accepts supported conversion png to jpg", () => {
    const options = parseAndValidateOptions(
      JSON.stringify({
        outputFormat: "jpg",
        quality: 75,
        pngCompressionLevel: 8,
        resize: { maxWidth: 1200 },
        backgroundColor: "#ffffff",
      }),
      "image/png",
    );

    expect(options.outputFormat).toBe("jpg");
    expect(options.quality).toBe(75);
  });

  it("rejects unsupported conversion jpg to png", () => {
    expect(() => validateFormatCombination("image/jpeg", "png")).toThrow(/Unsupported conversion/);
  });

  it("rejects invalid quality", () => {
    expect(() => parseAndValidateOptions(JSON.stringify({ quality: 1000 }), "image/png")).toThrow(/Quality/);
  });
});
