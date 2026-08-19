/**
 * Recognises controls that would submit an application.
 *
 * The guard lives in the browser layer on purpose. Putting it above here would
 * mean the rule could be bypassed by whatever calls the browser; putting it
 * here means no caller can click submit even by accident, because the click
 * method itself refuses.
 */
const SUBMIT_PATTERNS = [
  /\bsubmit\b/i,
  /\bapply\b/i,
  /\bsend\s+application\b/i,
  /\bfinish\b/i,
  /\bcomplete\s+application\b/i,
  /\bconfirm\s+and\s+send\b/i,
];

export const looksLikeSubmit = (input: {
  label?: string | null;
  type?: string | null;
  name?: string | null;
  id?: string | null;
}): boolean => {
  // Separators are flattened to spaces before matching. Regex word boundaries
  // do not fire around an underscore, so a control named `apply_button` would
  // otherwise slip past a \bapply\b pattern — and forms name buttons that way.
  const haystack = [input.label, input.name, input.id]
    .filter(Boolean)
    .join(" ")
    .replace(/[^a-zA-Z0-9]+/g, " ");

  if (SUBMIT_PATTERNS.some((pattern) => pattern.test(haystack))) return true;

  // A bare <button type="submit"> with no telling text still submits.
  return (input.type ?? "").toLowerCase() === "submit";
};

export class SubmitBlockedError extends Error {
  constructor(selector: string, label: string) {
    super(
      `Refusing to click "${label}" (${selector}): it looks like it submits the application. ` +
        "Submission requires an explicit human action outside this system.",
    );
    this.name = "SubmitBlockedError";
  }
}
