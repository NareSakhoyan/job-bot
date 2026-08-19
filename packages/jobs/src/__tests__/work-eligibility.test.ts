import { describe, expect, test } from "vitest";
import { extractLocationRequirement } from "../work-eligibility";

const req = (location: string, isRemote = false, description = "") =>
  extractLocationRequirement({ location, isRemote, descriptionText: description });

describe("extractLocationRequirement — what the posting actually permits", () => {
  test("reads a bare city as on-site in that country", () => {
    const result = req("San Francisco, CA");

    expect(result.arrangement).toBe("ONSITE");
    expect(result.restrictedTo).toEqual(["US"]);
  });

  test("reads a multi-city posting as on-site across every listed country", () => {
    const result = req("San Francisco, CA | London, UK");

    expect(result.arrangement).toBe("ONSITE");
    expect(result.restrictedTo).toEqual(expect.arrayContaining(["US", "UK"]));
  });

  test("treats US-restricted remote as remote but closed to other countries", () => {
    for (const location of ["Remote U.S.", "Remote, United States", "Remote, US", "Remote (USA)"]) {
      const result = req(location, true);

      expect(result.arrangement, location).toBe("REMOTE");
      expect(result.restrictedTo, location).toEqual(["US"]);
    }
  });

  test("treats an unqualified remote posting as remote with no stated limit", () => {
    const result = req("Remote", true);

    expect(result.arrangement).toBe("REMOTE");
    expect(result.restrictedTo).toEqual([]);
  });

  test("recognises worldwide wording as an explicit open remote role", () => {
    const result = req("Remote (Anywhere in the world)", true);

    expect(result.arrangement).toBe("REMOTE");
    expect(result.restrictedTo).toEqual(["WORLDWIDE"]);
  });

  test("recognises hybrid arrangements", () => {
    const result = req("Hybrid — Berlin, Germany");

    expect(result.arrangement).toBe("HYBRID");
    expect(result.restrictedTo).toEqual(["DE"]);
  });

  test("lifts an explicit authorization requirement out of the description", () => {
    const result = req("Remote", true, "You must be authorized to work in the United States.");

    expect(result.arrangement).toBe("REMOTE");
    expect(result.restrictedTo).toEqual(["US"]);
    expect(result.inferred).toBe(false);
  });

  test("marks a restriction read from the location string as inferred", () => {
    expect(req("Remote, US", true).inferred).toBe(true);
    expect(req("Remote", true, "Must be authorized to work in the US.").inferred).toBe(false);
  });

  test("treats an unrecognised remote qualifier as a restriction, not as freedom", () => {
    // The place vocabulary cannot list every country. A qualifier it fails to
    // recognise must read as "restricted to somewhere" — never as "open".
    for (const location of ["Remote - Japan", "Remote (Tokyo)", "Remote, Brazil"]) {
      const result = req(location, true);

      expect(result.arrangement, location).toBe("REMOTE");
      expect(result.restrictedTo, location).not.toEqual([]);
      expect(result.detail, location).toMatch(/unrecognised/i);
    }
  });

  test("reports UNKNOWN rather than guessing when the posting says nothing", () => {
    const result = req("");

    expect(result.arrangement).toBe("UNKNOWN");
    expect(result.restrictedTo).toEqual([]);
  });

  test("recognises regional remote scopes", () => {
    expect(req("Remote - EMEA", true).restrictedTo).toEqual(["EMEA"]);
    expect(req("Remote (EU)", true).restrictedTo).toEqual(["EU"]);
    expect(req("Remote — North America", true).restrictedTo).toEqual(["NA"]);
  });
});
