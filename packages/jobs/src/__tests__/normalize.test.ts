import { describe, expect, test } from "vitest";
import {
  normalizeCompany,
  normalizeDescription,
  normalizeLocationBucket,
  normalizeText,
  normalizeTitle,
} from "../normalize";

describe("normalizeText", () => {
  test("lowercases, strips punctuation and collapses whitespace", () => {
    expect(normalizeText("  Senior   Engineer, Platform!  ")).toBe("senior engineer platform");
  });

  test("removes diacritics so accented spellings compare equal", () => {
    expect(normalizeText("Zürich Söftware")).toBe(normalizeText("Zurich Software"));
  });
});

describe("normalizeCompany", () => {
  test("strips a trailing legal-entity suffix", () => {
    expect(normalizeCompany("Northwind Systems Inc.")).toBe("northwind systems");
  });

  test("strips stacked suffixes", () => {
    expect(normalizeCompany("Acme Holdings Group Ltd")).toBe("acme");
  });

  test("treats punctuation variants of the same company as equal", () => {
    expect(normalizeCompany("Ferrous AI, Inc.")).toBe(normalizeCompany("Ferrous AI"));
  });

  test("does not strip a suffix that is the entire name", () => {
    expect(normalizeCompany("Group")).toBe("group");
  });
});

describe("normalizeTitle", () => {
  test("removes work-arrangement noise", () => {
    expect(normalizeTitle("Senior Backend Engineer (Remote)")).toBe("senior backend engineer");
  });

  test("treats separator variants as equal", () => {
    expect(normalizeTitle("Senior Engineer, Developer Experience")).toBe(
      normalizeTitle("Senior Engineer — Developer Experience"),
    );
  });

  test("keeps distinct roles distinct", () => {
    expect(normalizeTitle("Backend Engineer")).not.toBe(normalizeTitle("Frontend Engineer"));
  });
});

describe("normalizeLocationBucket", () => {
  test("collapses every remote phrasing to one bucket", () => {
    expect(normalizeLocationBucket("Remote — Europe", true)).toBe("remote");
    expect(normalizeLocationBucket("Remote (US/EU)", true)).toBe("remote");
    expect(normalizeLocationBucket("Anywhere", true)).toBe("remote");
  });

  test("detects a remote posting that was not flagged as remote", () => {
    expect(normalizeLocationBucket("Remote", false)).toBe("remote");
  });

  test("collapses administrative detail after the city", () => {
    expect(normalizeLocationBucket("Berlin, Germany", false)).toBe("berlin");
    expect(normalizeLocationBucket("Berlin (Hybrid)", false)).toBe("berlin");
    expect(normalizeLocationBucket("Berlin", false)).toBe("berlin");
  });

  test("keeps different cities apart", () => {
    expect(normalizeLocationBucket("London, United Kingdom", false)).not.toBe(
      normalizeLocationBucket("Amsterdam, Netherlands", false),
    );
  });

  test("falls back to a stable bucket for an empty location", () => {
    expect(normalizeLocationBucket("   ", false)).toBe("unspecified");
  });
});

describe("normalizeDescription", () => {
  test("strips markup and collapses runs of blank lines", () => {
    const result = normalizeDescription("<p>Build&nbsp;things</p>\n\n\n\n<b>Fast</b>");
    expect(result).toBe("Build things \n\n Fast");
  });
});
