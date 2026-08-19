import { describe, expect, test } from "vitest";
import { isCandidateSignal } from "@job-bot/shared";
import { classifyRejectionFeedback } from "../feedback/rejection-reasons";

describe("classifyRejectionFeedback — objective signal out of subjective wording", () => {
  test("reads seniority out of standard rejection boilerplate", () => {
    const result = classifyRejectionFeedback(
      "We were impressed by your background, but have decided to move forward with candidates whose experience more closely matches the seniority of this role.",
    );

    expect(result.reasons).toContain("SENIORITY_MISMATCH");
    expect(result.unclassified).toBe(false);
  });

  test("reads work authorization", () => {
    expect(classifyRejectionFeedback("Unfortunately we are unable to sponsor a visa for this role.").reasons).toContain(
      "WORK_AUTHORIZATION",
    );
  });

  test("reads a timezone or residency requirement", () => {
    expect(classifyRejectionFeedback("The team needs someone based in Germany for tax reasons.").reasons).toContain(
      "LOCATION_OR_TIMEZONE",
    );
  });

  test("reads a language requirement", () => {
    expect(
      classifyRejectionFeedback("This position requires native-level German for client conversations.").reasons,
    ).toContain("LANGUAGE_REQUIREMENT");
  });

  test("records silence as silence rather than guessing", () => {
    for (const text of [null, "", "   ", "Thank you for your interest in our company."]) {
      const result = classifyRejectionFeedback(text);

      expect(result.reasons, String(text)).toEqual(["NO_REASON_GIVEN"]);
      expect(result.unclassified, String(text)).toBe(true);
    }
  });

  test("can read more than one reason from one message", () => {
    const result = classifyRejectionFeedback(
      "We need someone with more years of experience, and we are unable to sponsor a work permit.",
    );

    expect(result.reasons).toEqual(expect.arrayContaining(["INSUFFICIENT_YEARS", "WORK_AUTHORIZATION"]));
  });

  test("returns reasons in a stable vocabulary order", () => {
    const a = classifyRejectionFeedback("visa sponsorship and seniority of the role");
    const b = classifyRejectionFeedback("seniority of the role and visa sponsorship");

    expect(a.reasons).toEqual(b.reasons);
  });

  test("separates reasons that say nothing about the candidate", () => {
    const closed = classifyRejectionFeedback("The role has been put on hold due to a hiring freeze.");

    expect(closed.reasons).toContain("ROLE_CLOSED");
    expect(closed.reasons.filter(isCandidateSignal)).toEqual([]);
  });

  test("treats losing to a stronger field as a candidate signal, not noise", () => {
    const result = classifyRejectionFeedback("We moved forward with another candidate.");

    expect(result.reasons).toContain("STRONGER_APPLICANTS");
    expect(result.reasons.filter(isCandidateSignal)).toContain("STRONGER_APPLICANTS");
  });
});

describe("classifyRejectionFeedback — wording taken from real rejections", () => {
  test("reads the comparative form used by Altamira", () => {
    const result = classifyRejectionFeedback(
      "While we were impressed with your skills and experience, we have identified other candidates whose qualifications more closely align with the needs of the role.",
    );

    expect(result.reasons).toEqual(["STRONGER_APPLICANTS"]);
  });

  test("reads the volume form used by globaldev, which names no comparison", () => {
    // The first real rejection this classifier met and failed to read: it says
    // nothing about the candidate directly, but a large field is still the
    // reason someone else was chosen.
    const result = classifyRejectionFeedback(
      "We received a large number of applications, and after carefully reviewing all of them, unfortunately, we have to inform you that this time we won't be able to invite you to the next round of our hiring process.",
    );

    expect(result.reasons).toContain("STRONGER_APPLICANTS");
    expect(result.unclassified).toBe(false);
  });

  test("still records pure boilerplate as saying nothing", () => {
    expect(
      classifyRejectionFeedback("We wish you every success with your job search.").reasons,
    ).toEqual(["NO_REASON_GIVEN"]);
  });
});
