import { REJECTION_REASONS, type RejectionReason } from "@job-bot/shared";

/**
 * Turns a company's rejection wording into objective reason codes.
 *
 * Rejection feedback is mostly boilerplate wrapped around one or two checkable
 * facts. "We were impressed by your background but have decided to move
 * forward with candidates whose experience more closely matches the seniority
 * of this role" is subjective in tone and objective in content: it says the
 * level was wrong. This lifts that out and discards the rest.
 *
 * Deterministic by design, and for the same reason the scorer is: a rule that
 * fires can be pointed at, argued with and corrected. A model may later
 * propose codes for wording these rules miss, but it may only ever choose from
 * the same closed vocabulary — never invent a reason, never set a weight.
 */
const RULES: Array<{ reason: RejectionReason; patterns: RegExp[] }> = [
  {
    reason: "INSUFFICIENT_YEARS",
    patterns: [
      /\b(more|additional|further)\s+years?\b/,
      /\byears? of (relevant |professional |commercial )?experience\b.*\b(require|expect|look|need)/,
      /\bnot enough experience\b/,
    ],
  },
  {
    reason: "SENIORITY_MISMATCH",
    patterns: [
      /\bseniority\b/,
      /\b(more|too) (senior|junior)\b/,
      /\b(level|grade) of (the )?(role|position)\b/,
      /\bover[- ]qualified\b/,
      /\bunder[- ]qualified\b/,
    ],
  },
  {
    reason: "MISSING_TECHNOLOGY",
    patterns: [
      /\b(hands[- ]on|production|commercial) experience with\b/,
      /\b(lack|without|no) (of )?(experience|exposure) (in|with)\b/,
      /\bnot? (have|having) (the )?(required|necessary) (technical )?skills?\b/,
      /\btech(nical)? stack\b/,
    ],
  },
  {
    reason: "DOMAIN_EXPERIENCE",
    patterns: [
      /\b(industry|domain|sector) experience\b/,
      /\bbackground in (the )?(fintech|healthcare|gaming|e-?commerce|security)\b/,
    ],
  },
  {
    reason: "WORK_AUTHORIZATION",
    patterns: [
      /\b(work )?authoriz(ation|ed)\b/,
      /\b(visa|sponsorship|work permit|right to work)\b/,
      /\bunable to sponsor\b/,
      /\blegally (able|entitled) to work\b/,
    ],
  },
  {
    reason: "LOCATION_OR_TIMEZONE",
    patterns: [
      /\btime\s?zone\b/,
      /\b(based|located|reside|residing) in\b/,
      /\b(relocat|on-?site|in[- ]office|hybrid)\w*\b.*\brequire/,
      /\boverlap\b.*\bhours\b/,
    ],
  },
  {
    reason: "LANGUAGE_REQUIREMENT",
    patterns: [
      /\b(german|french|dutch|spanish|italian|polish)\b.*\b(language|fluen|proficien|required|speaking)/,
      /\bnative[- ]level\b/,
      /\bfluency in\b/,
    ],
  },
  {
    reason: "SALARY_EXPECTATION",
    patterns: [
      /\b(salary|compensation|rate|budget)\b.*\b(expectation|range|outside|exceed|align)/,
      /\boutside (our|the) (budget|range)\b/,
    ],
  },
  {
    reason: "ROLE_CLOSED",
    patterns: [
      /\b(role|position|req(uisition)?)\b.*\b(closed|cancelled|canceled|on hold|no longer)\b/,
      /\bhiring freeze\b/,
      /\bwe have paused\b/,
    ],
  },
  { reason: "INTERNAL_CANDIDATE", patterns: [/\binternal (candidate|applicant|transfer)\b/] },
  {
    reason: "STRONGER_APPLICANTS",
    patterns: [
      /\b(other|more) (candidates?|applicants?)\b.*\b(closely|better|stronger)\b/,
      /\bmoved? forward with (another|other|a different)\b/,
      /\bstronger (candidates?|applicants?)\b/,
      // Volume rejections say the same thing without comparing anyone: a large
      // field means someone else was preferred. Seen verbatim in a real
      // rejection that the comparative patterns above missed entirely.
      /\b(large|high) (number|volume) of (applications?|applicants?|candidates?)\b/,
      /\b(many|numerous) (applications?|applicants?|candidates?)\b/,
    ],
  },
];

export interface ClassifiedFeedback {
  /** Objective codes the wording supports, in vocabulary order. */
  reasons: RejectionReason[];
  /** True when nothing checkable could be read out of the text. */
  unclassified: boolean;
}

/**
 * Reads objective reason codes out of rejection wording.
 *
 * Silence is recorded as silence: text that supports nothing checkable yields
 * NO_REASON_GIVEN rather than a guess.
 */
export const classifyRejectionFeedback = (verbatim: string | null): ClassifiedFeedback => {
  const text = (verbatim ?? "").toLowerCase();
  if (text.trim().length === 0) {
    return { reasons: ["NO_REASON_GIVEN"], unclassified: true };
  }

  const matched = RULES.filter((rule) => rule.patterns.some((pattern) => pattern.test(text))).map(
    (rule) => rule.reason,
  );

  if (matched.length === 0) {
    return { reasons: ["NO_REASON_GIVEN"], unclassified: true };
  }

  // Vocabulary order keeps the output stable regardless of rule evaluation order.
  const ordered = REJECTION_REASONS.filter((reason) => matched.includes(reason));
  return { reasons: [...ordered], unclassified: false };
};
