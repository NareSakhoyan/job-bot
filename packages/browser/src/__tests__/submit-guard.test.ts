import { describe, expect, test } from "vitest";
import { looksLikeSubmit } from "../submit-guard";
import {
  assertMaySubmit,
  classifyControl,
  findConfirmation,
  type SubmissionAuthorization,
} from "../submission";

describe("looksLikeSubmit — the hard stop", () => {
  test.each([
    ["Submit application"],
    ["Apply now"],
    ["Send application"],
    ["Finish"],
    ["Complete application"],
    ["Confirm and send"],
  ])("recognises %s", (label) => {
    expect(looksLikeSubmit({ label, type: "button" })).toBe(true);
  });

  test("recognises a submit button with no telling text", () => {
    expect(looksLikeSubmit({ label: "→", type: "submit" })).toBe(true);
  });

  test("recognises submit intent from the id or name when the label is empty", () => {
    expect(looksLikeSubmit({ label: "", type: "button", id: "submit-application" })).toBe(true);
    expect(looksLikeSubmit({ label: "", type: "button", name: "apply_button" })).toBe(true);
  });

  test("is case-insensitive", () => {
    expect(looksLikeSubmit({ label: "SUBMIT APPLICATION", type: "button" })).toBe(true);
  });

  test("allows genuinely harmless controls", () => {
    expect(looksLikeSubmit({ label: "Save draft", type: "button" })).toBe(false);
    expect(looksLikeSubmit({ label: "Add another role", type: "button" })).toBe(false);
    expect(looksLikeSubmit({ label: "Next", type: "button" })).toBe(false);
    expect(looksLikeSubmit({ label: "Upload", type: "button" })).toBe(false);
  });

  test("tolerates missing attributes without throwing", () => {
    expect(looksLikeSubmit({})).toBe(false);
    expect(looksLikeSubmit({ label: null, type: null, name: null, id: null })).toBe(false);
  });
});

describe("assertMaySubmit — the preconditions for an irreversible action", () => {
  const approval = (overrides: Partial<SubmissionAuthorization> = {}): SubmissionAuthorization => ({
    applicationId: "app_123",
    approvedBy: "human:dashboard",
    approvedAt: new Date("2026-08-18T10:00:00Z"),
    alreadySubmittedAt: null,
    ...overrides,
  });

  const readyForm = { fieldsFound: 12, filledCount: 10, unfilledRequired: [] };

  test("accepts a human-approved, unsent, fully-filled application", () => {
    expect(() => assertMaySubmit(approval(), readyForm)).not.toThrow();
  });

  test("refuses an approval that is not attributed to a human", () => {
    expect(() => assertMaySubmit(approval({ approvedBy: "matching-agent" }), readyForm)).toThrow(
      /not a human actor/i,
    );
    expect(() => assertMaySubmit(approval({ approvedBy: "worker" }), readyForm)).toThrow();
  });

  test("refuses an approval with no timestamp", () => {
    expect(() =>
      assertMaySubmit(approval({ approvedAt: new Date(Number.NaN) }), readyForm),
    ).toThrow(/no timestamp/i);
  });

  test("refuses to send the same application twice", () => {
    expect(() =>
      assertMaySubmit(
        approval({ alreadySubmittedAt: new Date("2026-08-17T09:00:00Z") }),
        readyForm,
      ),
    ).toThrow(/already submitted/i);
  });

  test("refuses a form with required fields still empty", () => {
    expect(() =>
      assertMaySubmit(approval(), {
        ...readyForm,
        unfilledRequired: ["Work authorization", "Notice period"],
      }),
    ).toThrow(/required field/i);
  });

  test("refuses a page that exposed no form controls at all", () => {
    // The vacuous pass: no fields means no unfilled required fields, so
    // without this check a posting page whose form never rendered would be
    // "submitted" by clicking whatever looked like a submit button.
    expect(() =>
      assertMaySubmit(approval(), { fieldsFound: 0, filledCount: 0, unfilledRequired: [] }),
    ).toThrow(/no form controls/i);
  });

  test("refuses a form where nothing was filled", () => {
    expect(() =>
      assertMaySubmit(approval(), { fieldsFound: 12, filledCount: 0, unfilledRequired: [] }),
    ).toThrow(/nothing to send/i);
  });

  test("refuses when no application is identified", () => {
    expect(() => assertMaySubmit(approval({ applicationId: "  " }), readyForm)).toThrow();
  });
});

describe("findConfirmation — a silent failure must not read as success", () => {
  test.each([
    "Thank you for applying! We will be in touch.",
    "Your application has been received.",
    "We have received your application.",
    "Application submitted successfully",
  ])("recognises %s", (text) => {
    expect(findConfirmation(text)).not.toBeNull();
  });

  test("returns null when the page says nothing about receipt", () => {
    expect(findConfirmation("Senior Backend Engineer — apply now")).toBeNull();
    expect(findConfirmation("")).toBeNull();
  });
});


describe("classifyControl — opening a form is not sending one", () => {
  test.each([
    ["Apply", "button"],
    ["Apply now", "button"],
    ["Apply for this job", "a"],
    ["Start your application", "button"],
  ])("treats %s as an opener", (label, tag) => {
    expect(classifyControl({ label, tag })).toBe("opener");
  });

  test.each([
    ["Submit application", "button"],
    ["Submit", "button"],
    ["Send application", "button"],
    ["Complete application", "button"],
  ])("treats %s as a sender", (label, tag) => {
    expect(classifyControl({ label, tag })).toBe("sender");
  });

  test("a bare submit input is a sender even with no label", () => {
    expect(classifyControl({ label: "", type: "submit", tag: "input" })).toBe("sender");
  });

  test("an anchor is never a sender, however it is labelled", () => {
    // Links navigate. Classifying one as a sender is how a run ends up
    // clicking through to a form and reporting it as submitted.
    expect(classifyControl({ label: "Submit your details", tag: "a" })).toBe("other");
  });

  test("ordinary controls are neither", () => {
    expect(classifyControl({ label: "Save draft", tag: "button" })).toBe("other");
    expect(classifyControl({ label: "Add another role", tag: "button" })).toBe("other");
  });
});
