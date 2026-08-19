/**
 * A form control, described without reference to any particular site.
 *
 * This is the whole contract between the browser layer and the rest of the
 * system: nothing above this layer knows about pages, selectors or Playwright,
 * and nothing in this layer knows about profiles or job applications.
 */
export interface FormField {
  label: string;
  name?: string;
  /** text, email, tel, url, number, textarea, select, checkbox, radio, file, … */
  type: string;
  required: boolean;
  /** Present for select and radio groups. */
  options?: string[];
  /** How to address the control. Opaque above this layer. */
  selector: string;
  placeholder?: string;
  maxLength?: number;
}

export interface PageSnapshot {
  url: string;
  title: string;
  fields: FormField[];
  /**
   * Controls that send the application. Only these may be passed to
   * `submitForm`, and only with an authorization.
   */
  submitControls: Array<{ label: string; selector: string }>;
  /**
   * Controls that navigate to the application form rather than sending it —
   * the "Apply" button on a posting page. Safe to click.
   */
  openerControls: Array<{ label: string; selector: string }>;
}

export type FillOutcome =
  | { ok: true; selector: string }
  | { ok: false; selector: string; reason: string };
