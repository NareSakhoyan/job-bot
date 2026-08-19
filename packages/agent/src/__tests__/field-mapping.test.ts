import { describe, expect, test } from "vitest";
import type { FormField } from "@job-bot/browser";
import { mapFieldsToFacts, type ApplicantFacts } from "../application/field-mapping";

const facts: ApplicantFacts = {
  fullName: "Ada Lovelace",
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@example.com",
  phone: "+374 00 00 00 00",
  location: "Yerevan, Armenia",
  linkedinUrl: "https://linkedin.com/in/ada",
  githubUrl: null,
  websiteUrl: null,
  yearsOfExperience: 6,
  currentCompany: "Analytical Engines",
  currentTitle: "Senior Engineer",
  requiresSponsorship: true,
  workAuthCountry: "Armenia",
  salaryMin: null,
  salaryCurrency: "USD",
  salaryPeriod: "YEAR",
  resumePath: "/tmp/resume.md",
  coverLetter: "Dear team,",
};

const field = (overrides: Partial<FormField> = {}): FormField => ({
  label: "Email address",
  name: "email",
  type: "email",
  required: true,
  selector: "#email",
  ...overrides,
});

const mapOne = (overrides: Partial<FormField> = {}) => mapFieldsToFacts([field(overrides)], facts)[0]!;

describe("mapFieldsToFacts — the obvious fields", () => {
  test.each([
    ["Email address", "email", "ada@example.com"],
    ["Phone number", "phone", "+374 00 00 00 00"],
    ["LinkedIn profile URL", "linkedin", "https://linkedin.com/in/ada"],
    ["Current location (city, country)", "location", "Yerevan, Armenia"],
    ["Years of professional experience", "years_experience", "6"],
    ["Current company", "current_company", "Analytical Engines"],
    ["Current job title", "current_title", "Senior Engineer"],
  ])("maps %s", (label, name, expected) => {
    expect(mapOne({ label, name, type: "text" }).value).toBe(expected);
  });

  test("distinguishes first name from last name", () => {
    expect(mapOne({ label: "First name", name: "first_name", type: "text" }).value).toBe("Ada");
    expect(mapOne({ label: "Last name", name: "last_name", type: "text" }).value).toBe("Lovelace");
  });

  test("maps a surname field without the word 'name'", () => {
    expect(mapOne({ label: "Surname", name: "surname", type: "text" }).value).toBe("Lovelace");
  });

  test("never confuses current location with a preferred location", () => {
    const preferred = mapOne({ label: "Preferred work location", name: "preferred_location", type: "text" });
    expect(preferred.value).toBeNull();
    expect(preferred.requiresHumanInput).toBe(true);
  });
});

describe("mapFieldsToFacts — nothing is invented", () => {
  test("a fact the profile does not record is left empty and flagged", () => {
    const github = mapOne({ label: "GitHub profile URL", name: "github", type: "url" });

    expect(github.value).toBeNull();
    expect(github.requiresHumanInput).toBe(true);
    expect(github.note).toMatch(/records no githubUrl/i);
  });

  test("an unrecognised field is reported, never guessed at", () => {
    const referral = mapOne({ label: "How did you hear about us?", name: "referral_source", type: "text" });

    expect(referral.value).toBeNull();
    expect(referral.source).toBeNull();
    expect(referral.requiresHumanInput).toBe(true);
  });

  test("a salary always states its period, since a bare figure reads as annual", () => {
    const monthly = mapFieldsToFacts(
      [field({ label: "Expected salary", name: "salary", type: "text" })],
      { ...facts, salaryMin: 2_000, salaryPeriod: "MONTH" },
    )[0]!;

    expect(monthly.value).toBe("USD 2,000 per month");
  });

  test("salary is offered only when an expectation is recorded", () => {
    const withoutExpectation = mapOne({ label: "Expected salary", name: "salary", type: "text" });
    expect(withoutExpectation.value).toBeNull();

    const withExpectation = mapFieldsToFacts(
      [field({ label: "Expected salary", name: "salary", type: "text" })],
      { ...facts, salaryMin: 90_000 },
    )[0]!;
    expect(withExpectation.value).toBe("USD 90,000 per year");
    expect(withExpectation.requiresHumanInput).toBe(true);
  });
});

describe("mapFieldsToFacts — sponsorship polarity", () => {
  const select = (label: string) =>
    field({ label, name: "q", type: "select", options: ["Yes", "No"], selector: "#q" });

  test("'do you require sponsorship' answers Yes when sponsorship is required", () => {
    const result = mapFieldsToFacts([select("Do you require visa sponsorship?")], facts)[0]!;
    expect(result.value).toBe("Yes");
  });

  test("'are you authorized to work' answers the opposite, not the same", () => {
    const result = mapFieldsToFacts(
      [select("Are you authorized to work in the country of this role?")],
      facts,
    )[0]!;
    expect(result.value).toBe("No");
  });

  test("polarity flips with the profile", () => {
    const noSponsorship = { ...facts, requiresSponsorship: false };

    expect(
      mapFieldsToFacts([select("Do you require visa sponsorship?")], noSponsorship)[0]!.value,
    ).toBe("No");
    expect(
      mapFieldsToFacts([select("Are you authorized to work here?")], noSponsorship)[0]!.value,
    ).toBe("Yes");
  });

  test("a sponsorship answer always asks for human confirmation", () => {
    const result = mapFieldsToFacts([select("Do you require visa sponsorship?")], facts)[0]!;
    expect(result.requiresHumanInput).toBe(true);
    expect(result.note).toMatch(/workAuthorization/);
  });

  test("matches the option text the form actually offers", () => {
    const result = mapFieldsToFacts(
      [
        field({
          label: "Do you require visa sponsorship?",
          type: "select",
          options: ["Select…", "Yes, I do", "No, I do not"],
        }),
      ],
      facts,
    )[0]!;

    expect(result.value).toBe("Yes, I do");
  });
});

describe("mapFieldsToFacts — documents", () => {
  test("routes a file input to the resume path", () => {
    const upload = mapOne({ label: "Upload your resume (PDF or Markdown)", name: "resume", type: "file" });
    expect(upload.value).toBe("/tmp/resume.md");
  });

  test("routes a cover letter textarea to the generated letter", () => {
    const letter = mapOne({ label: "Cover letter", name: "cover_letter", type: "textarea" });
    expect(letter.value).toBe("Dear team,");
  });
});

describe("mapFieldsToFacts — a bare 'Name' label", () => {
  test("fills a field labelled only 'Name' with the full name", () => {
    // Ashby's required name field is labelled exactly this, and it was left
    // blank on a real Supabase application.
    expect(mapOne({ label: "Name" })).toMatchObject({ value: "Ada Lovelace", confidence: "EXACT" });
  });

  test("still gives first and last name precedence", () => {
    expect(mapOne({ label: "First name" })).toMatchObject({ value: "Ada" });
    expect(mapOne({ label: "Last name" })).toMatchObject({ value: "Lovelace" });
  });

  test("fills a legal-name field", () => {
    expect(mapOne({ label: "Legal name" })).toMatchObject({ value: "Ada Lovelace" });
  });

  test("does not claim every other thing a form calls a name", () => {
    for (const label of [
      "Company name",
      "Referrer name",
      "School name",
      "File name",
      "Preferred name",
      "Username",
      "Project name",
    ]) {
      expect(mapOne({ label })?.value, label).not.toBe("Ada Lovelace");
    }
  });
});
