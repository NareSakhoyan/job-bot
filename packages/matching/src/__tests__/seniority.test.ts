import { describe, expect, test } from "vitest";
import type { MatchJob, MatchProfile } from "@job-bot/shared";
import { scoreSeniority } from "../factors/seniority";

const profile = (years = 6): MatchProfile => ({
  yearsOfExperience: years,
  targetRoles: ["Senior Software Engineer"],
  skills: [],
  experienceTechnologies: [],
  preferredLocations: ["Remote"],
  remotePreference: "REMOTE_ONLY",
  salaryMin: null,
  salaryMax: null,
  salaryCurrency: "USD",
  salaryPeriod: "YEAR",
  employmentTypes: ["FULL_TIME"],
  excludedCompanies: [],
  excludedTechnologies: [],
  requiresSponsorship: false,
  workAuthCountry: "Armenia",
  willRelocate: false,
});

const job = (title: string, companySize: MatchJob["companySize"]): MatchJob => ({
  company: "Acme",
  title,
  location: "Remote",
  isRemote: true,
  employmentType: "FULL_TIME",
  salaryMin: null,
  salaryMax: null,
  salaryCurrency: null,
  salaryPeriod: null,
  requirements: [],
  technologies: [],
  descriptionText: "",
  companySize,
});

describe("scoreSeniority — a large employer's levelling bar", () => {
  test("does not lower a senior title at a small company", () => {
    const result = scoreSeniority(profile(), job("Senior Software Engineer", "SMALL"));

    expect(result.score).toBe(100);
  });

  test("lowers the same senior title at a large company", () => {
    const small = scoreSeniority(profile(), job("Senior Software Engineer", "SMALL"));
    const large = scoreSeniority(profile(), job("Senior Software Engineer", "LARGE"));

    expect(large.score).toBeLessThan(small.score);
    expect(large.detail).toMatch(/large/i);
  });

  test("treats a numbered senior rung as a further reach than plain senior", () => {
    const plain = scoreSeniority(profile(), job("Senior Software Engineer", "LARGE"));
    const second = scoreSeniority(profile(), job("Senior II Fullstack Software Engineer", "LARGE"));

    expect(second.score).toBeLessThan(plain.score);
  });

  test("scores staff, principal and lead titles at a large company as over-reach", () => {
    for (const title of [
      "Staff Software Engineer",
      "Principal Engineer",
      "Engineering Lead",
      "Director of Engineering",
    ]) {
      const result = scoreSeniority(profile(), job(title, "LARGE"));

      expect(result.score, title).toBeLessThanOrEqual(20);
    }
  });

  test("leaves mid-level titles at a large company untouched", () => {
    const result = scoreSeniority(profile(), job("Software Engineer II", "LARGE"));

    expect(result.score).toBe(100);
  });

  test("applies no ceiling when the employer is unknown", () => {
    const unknown = scoreSeniority(profile(), job("Staff Software Engineer", null));
    const large = scoreSeniority(profile(), job("Staff Software Engineer", "LARGE"));

    expect(unknown.score).toBeGreaterThan(large.score);
  });
});
