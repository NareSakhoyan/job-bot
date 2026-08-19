import { describe, expect, test } from "vitest";
import type { ResumeDraft } from "@job-bot/shared";
import { renderResumeMarkdown } from "../render";
import type { SourceProfile } from "../types";

const profile: SourceProfile = {
  slug: "nare",
  fullName: "Ada Lovelace",
  headline: "Software Engineer proficient in Full Stack Web Development",
  summary: "Six years of full-stack work.",
  yearsOfExperience: 6,
  skills: [{ name: "React", level: "EXPERT" }],
  experiences: [
    {
      slug: "prostrive-software-engineer",
      company: "Prostrive",
      role: "Software Engineer",
      employmentType: "FULL_TIME",
      location: "Remote",
      isRemote: true,
      startDate: new Date("2025-11-01T00:00:00Z"),
      endDate: new Date("2026-03-01T00:00:00Z"),
      isCurrent: false,
      description: "Full-stack product engineering.",
      technologies: ["React", "Next.js"],
      responsibilities: ["Implemented complex frontend features"],
      achievements: [],
      projects: [],
    },
  ],
};

const draft: ResumeDraft = {
  summary: "Full-stack engineer building web products end to end.",
  highlightedSkills: ["React", "TypeScript"],
  sections: [
    {
      experienceSlug: "prostrive-software-engineer",
      bullets: [
        {
          experienceSlug: "prostrive-software-engineer",
          sourceText: "Implemented complex frontend features",
          text: "Built complex React and Next.js frontend features.",
        },
      ],
    },
  ],
  missingInformation: [
    "The posting lists Playwright and Vitest; the record shows Jest as the only testing framework.",
    "No open-source or public-codebase work is recorded.",
  ],
};

describe("renderResumeMarkdown — what the employer receives", () => {
  test("never prints the candidate's gaps onto their own resume", () => {
    // missingInformation is a note to the reviewer. It was being rendered under
    // a "Not recorded in the profile" heading, putting a list of the
    // candidate's shortfalls in front of the employer.
    const markdown = renderResumeMarkdown(profile, draft);

    expect(markdown).not.toMatch(/not recorded/i);
    expect(markdown).not.toMatch(/Playwright/);
    expect(markdown).not.toMatch(/open-source/i);
    for (const gap of draft.missingInformation) {
      expect(markdown).not.toContain(gap);
    }
  });

  test("still renders the parts an employer should read", () => {
    const markdown = renderResumeMarkdown(profile, draft);

    expect(markdown).toContain("# Ada Lovelace");
    expect(markdown).toContain("Full-stack engineer building web products end to end.");
    expect(markdown).toContain("Built complex React and Next.js frontend features.");
    expect(markdown).toContain("Prostrive");
    expect(markdown).toContain("React · TypeScript");
  });
});
