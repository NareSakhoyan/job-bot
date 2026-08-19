import { describe, expect, test } from "vitest";
import { resumeFileName } from "../file-name";

describe("resumeFileName — the name a recruiter reads", () => {
  test("names the file after the person and the role", () => {
    expect(resumeFileName("Ada Lovelace", "Frontend Engineer")).toBe(
      "Ada Lovelace - Frontend Engineer.pdf",
    );
  });

  test("honours the requested extension", () => {
    expect(resumeFileName("Ada Lovelace", "Frontend Engineer", "md")).toBe(
      "Ada Lovelace - Frontend Engineer.md",
    );
  });

  test("removes characters a path cannot carry", () => {
    const name = resumeFileName("Ada Lovelace", "Frontend / Backend Engineer (m/f/d)");

    expect(name).not.toMatch(/[/\\:*?"<>|]/);
    expect(name).toBe("Ada Lovelace - Frontend Backend Engineer (m f d).pdf");
  });

  test("keeps non-ASCII names intact", () => {
    expect(resumeFileName("Անի Հակոբյան", "Data Scientist")).toBe(
      "Անի Հակոբյան - Data Scientist.pdf",
    );
  });

  test("caps a very long title rather than risking a path limit", () => {
    const name = resumeFileName("Ada Lovelace", `${"Senior ".repeat(40)}Engineer`);

    expect(name.length).toBeLessThanOrEqual(95);
    expect(name.endsWith(".pdf")).toBe(true);
  });

  test("never produces a name ending in a dot or space", () => {
    expect(resumeFileName("Ada Lovelace ", "Engineer .")).toBe("Ada Lovelace - Engineer.pdf");
  });

  test("degrades rather than throwing when a part is unusable", () => {
    expect(resumeFileName("Ada Lovelace", "   ")).toBe("Ada Lovelace.pdf");
    expect(resumeFileName("", "")).toBe("Resume.pdf");
    expect(resumeFileName("///", "???")).toBe("Resume.pdf");
  });
});
