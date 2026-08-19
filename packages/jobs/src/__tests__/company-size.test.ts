import { describe, expect, test } from "vitest";
import { bandForHeadcount, extractCompanySize } from "../company-size";

describe("extractCompanySize — reading headcount out of a posting", () => {
  test("reads the sentence that put a 3,000-person company on a small-company shortlist", () => {
    const result = extractCompanySize(
      "Over 3,000 people are working towards this every day, at more than 80 locations worldwide, from Finland to Australia.",
    );

    expect(result?.headcount).toBe(3000);
    expect(result?.size).toBe("LARGE");
    expect(result?.evidence).toMatch(/3,000 people/);
  });

  test("reads common English phrasings", () => {
    expect(extractCompanySize("We are a team of 40 building payments infrastructure.")?.size).toBe("STARTUP");
    expect(extractCompanySize("Join more than 500 employees across Europe.")?.size).toBe("MID");
    expect(extractCompanySize("Our 120+ colleagues work fully remotely.")?.size).toBe("SMALL");
    expect(extractCompanySize("With over 12,000 employees worldwide.")?.size).toBe("ENTERPRISE");
  });

  test("reads German phrasings", () => {
    expect(extractCompanySize("Wir sind über 250 Mitarbeitende an fünf Standorten.")?.size).toBe("MID");
    expect(extractCompanySize("Mehr als 1.500 Mitarbeiter arbeiten bei uns.")?.headcount).toBe(1500);
  });

  test("refuses to count things that are not staff", () => {
    // The same posting says both; only one of them is a headcount.
    expect(extractCompanySize("By 2030 our goal is to transition 1.5 million households to renewable energies.")).toBeNull();
    expect(extractCompanySize("Trusted by over 40,000 customers worldwide.")).toBeNull();
    expect(extractCompanySize("Present in more than 80 locations.")).toBeNull();
    expect(extractCompanySize("We have delivered 20+ successful projects.")).toBeNull();
  });

  test("returns nothing rather than guessing when the posting never says", () => {
    expect(extractCompanySize("We build energy software and care deeply about our craft.")).toBeNull();
    expect(extractCompanySize("")).toBeNull();
  });

  test("ignores counts too small or too large to be a headcount", () => {
    expect(extractCompanySize("Founded by 3 people in a garage.")).toBeNull();
    expect(extractCompanySize("Serving 5 million people every month.")).toBeNull();
  });

  test("maps headcounts onto bands at the documented boundaries", () => {
    expect(bandForHeadcount(49)).toBe("STARTUP");
    expect(bandForHeadcount(50)).toBe("SMALL");
    expect(bandForHeadcount(199)).toBe("SMALL");
    expect(bandForHeadcount(200)).toBe("MID");
    expect(bandForHeadcount(999)).toBe("MID");
    expect(bandForHeadcount(1000)).toBe("LARGE");
    expect(bandForHeadcount(5000)).toBe("ENTERPRISE");
  });
});
