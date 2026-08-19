import type { BrowserAgent, FormField, PageSnapshot } from "@job-bot/browser";
import type { SourceProfile, TargetJob } from "@job-bot/resume";
import { createLogger } from "@job-bot/shared";
import {
  mapFieldsToFacts,
  type ApplicantFacts,
  type FieldMapping,
} from "../application/field-mapping";
import type { QuestionAgent } from "./question-agent";

const logger = createLogger("agent.application");

export interface FilledField {
  label: string;
  selector: string;
  value: string;
  source: string;
  confidence: FieldMapping["confidence"];
  requiresHumanInput: boolean;
  note: string | null;
}

export interface UnfilledField {
  label: string;
  selector: string;
  required: boolean;
  reason: string;
}

export interface FillReport {
  url: string;
  title: string;
  fieldsFound: number;
  filled: FilledField[];
  unfilled: UnfilledField[];
  /** Controls that send the application. Detected, listed, never clicked here. */
  submitControls: Array<{ label: string; selector: string }>;
  /** Controls that open the form. Followed automatically to reach the fields. */
  openerControls: Array<{ label: string; selector: string }>;
  screenshotPath: string | null;
  /** Always true: this agent has no code path that submits. */
  stoppedBeforeSubmission: true;
}

/** A field whose label reads like a question rather than a data slot. */
const isFreeTextQuestion = (field: FormField): boolean =>
  field.type === "textarea" && /\?|why|describe|tell us|what |how /i.test(field.label);

/**
 * Fills an application form and stops.
 *
 * The division of labour is deliberate: known facts are placed by the
 * deterministic mapper, open questions go to the QuestionAgent, and anything
 * neither can answer is reported as unfilled rather than invented. The agent
 * never clicks submit — and could not, since BrowserAgent.click refuses.
 */
export class ApplicationAgent {
  constructor(
    private readonly browser: BrowserAgent,
    private readonly questionAgent: QuestionAgent | null = null,
  ) {}

  async fillForm(params: {
    url: string;
    facts: ApplicantFacts;
    profile: SourceProfile;
    job: TargetJob;
    screenshotName?: string;
  }): Promise<FillReport> {
    let snapshot: PageSnapshot = await this.browser.openPage(params.url);

    // A posting page usually shows an "Apply" control rather than the form
    // itself. Following it is safe — it navigates, it does not send — and
    // without it extraction sees a page with no fields.
    if (snapshot.fields.length === 0 && snapshot.openerControls.length > 0) {
      const opener = snapshot.openerControls[0];
      if (opener) {
        logger.info("Following the control that opens the application form", {
          label: opener.label,
        });
        snapshot = await this.browser.openApplicationForm(opener.selector);
      }
    }

    const mappings = mapFieldsToFacts(snapshot.fields, params.facts);

    const filled: FilledField[] = [];
    const unfilled: UnfilledField[] = [];

    for (const mapping of mappings) {
      const { field } = mapping;

      // Open questions are answered from recorded experience, not the fact map.
      if (mapping.value === null && isFreeTextQuestion(field) && this.questionAgent) {
        const answered = await this.questionAgent.answer(params.profile, params.job, field.label);

        if (answered.ok && answered.answer) {
          const outcome = await this.browser.fillField(field.selector, answered.answer.answer);
          if (outcome.ok) {
            filled.push({
              label: field.label,
              selector: field.selector,
              value: answered.answer.answer,
              source: "QuestionAgent",
              confidence: "UNCERTAIN",
              requiresHumanInput: true,
              note: `Strength: ${answered.answer.strength}.${
                answered.answer.missingInformation.length > 0
                  ? ` Missing: ${answered.answer.missingInformation.join("; ")}`
                  : ""
              }`,
            });
            continue;
          }
        }

        unfilled.push({
          label: field.label,
          selector: field.selector,
          required: field.required,
          reason: answered.failure ?? "The question could not be answered from the profile.",
        });
        continue;
      }

      if (mapping.value === null) {
        unfilled.push({
          label: field.label,
          selector: field.selector,
          required: field.required,
          reason: mapping.note ?? "No recorded fact matches this field.",
        });
        continue;
      }

      const outcome = await this.enter(field, mapping.value);

      if (!outcome.ok) {
        unfilled.push({
          label: field.label,
          selector: field.selector,
          required: field.required,
          reason: outcome.reason,
        });
        continue;
      }

      filled.push({
        label: field.label,
        selector: field.selector,
        value: mapping.value,
        source: mapping.source ?? "unknown",
        confidence: mapping.confidence,
        requiresHumanInput: mapping.requiresHumanInput,
        note: mapping.note,
      });
    }

    const screenshotPath = params.screenshotName
      ? await this.browser.takeScreenshot(params.screenshotName)
      : null;

    logger.info("Form filled; stopping before submission", {
      url: snapshot.url,
      fieldsFound: snapshot.fields.length,
      filled: filled.length,
      unfilled: unfilled.length,
      submitControls: snapshot.submitControls.length,
    });

    return {
      url: snapshot.url,
      title: snapshot.title,
      fieldsFound: snapshot.fields.length,
      filled,
      unfilled,
      submitControls: snapshot.submitControls,
      openerControls: snapshot.openerControls,
      screenshotPath,
      stoppedBeforeSubmission: true,
    };
  }

  private async enter(field: FormField, value: string) {
    if (field.type === "file") return this.browser.uploadFile(field.selector, value);
    if (field.type === "select") return this.browser.selectOption(field.selector, value);
    if (field.type === "radio" || field.type === "checkbox") {
      return this.browser.chooseOption(field.selector, value);
    }
    return this.browser.fillField(field.selector, value);
  }
}
