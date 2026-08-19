import { chromium, type Browser, type Page } from "playwright";
import { createLogger } from "@job-bot/shared";
import { EXTRACT_FORM_FIELDS } from "./extract";
import { SubmitBlockedError, looksLikeSubmit } from "./submit-guard";
import {
  assertMaySubmit,
  findConfirmation,
  logSubmissionIntent,
  SubmissionRefusedError,
  type SubmissionAuthorization,
  type SubmissionEvidence,
  type SubmittableForm,
} from "./submission";
import type { FillOutcome, FormField, PageSnapshot } from "./types";

const logger = createLogger("browser");

export interface BrowserAgentOptions {
  headless?: boolean;
  /** Where screenshots are written. */
  artifactDir?: string;
  timeoutMs?: number;
}

/**
 * A thin, application-agnostic wrapper over Playwright.
 *
 * It knows about pages, fields and files. It knows nothing about profiles,
 * jobs or applications — that mapping lives above it. The one policy it does
 * enforce is that `click` refuses submit controls, because that guarantee is
 * worthless anywhere a caller could route around it.
 *
 * No stealth or anti-bot evasion is implemented, and none will be.
 */
export class BrowserAgent {
  private browser: Browser | null = null;
  private page: Page | null = null;

  constructor(private readonly options: BrowserAgentOptions = {}) {}

  async openPage(url: string): Promise<PageSnapshot> {
    if (!this.browser) {
      this.browser = await chromium.launch({ headless: this.options.headless ?? true });
    }

    const context = await this.browser.newContext();
    this.page = await context.newPage();
    this.page.setDefaultTimeout(this.options.timeoutMs ?? 15_000);

    // networkidle rather than domcontentloaded: a client-rendered application
    // form (Ashby, Workday) has not mounted at DOM-ready, and extracting then
    // reports a page with no fields at all.
    await this.page.goto(url, { waitUntil: "networkidle" }).catch(async () => {
      // Some pages never go idle (polling, analytics beacons). Fall back
      // rather than failing the run.
      await this.page?.goto(url, { waitUntil: "domcontentloaded" });
    });

    logger.info("Page opened", { url });
    return this.inspectPage();
  }

  /**
   * The bundler rewrites named functions with a `__name` helper that does not
   * exist inside the page, so the extractor throws on arrival. Defining a
   * no-op shim first fixes it; passing a raw string keeps this line itself
   * from being rewritten the same way.
   */
  private static readonly NAME_SHIM =
    "globalThis.__name = globalThis.__name || function (value) { return value; }";

  /** Describes the current page's form controls. */
  async inspectPage(): Promise<PageSnapshot> {
    const page = this.requirePage();
    await page.evaluate(BrowserAgent.NAME_SHIM);
    const extracted = await page.evaluate(EXTRACT_FORM_FIELDS);

    logger.info("Page inspected", {
      url: page.url(),
      fields: extracted.fields.length,
      submitControls: extracted.submitControls.length,
      openerControls: extracted.openerControls.length,
    });

    return {
      url: page.url(),
      title: await page.title(),
      fields: extracted.fields as FormField[],
      submitControls: extracted.submitControls,
      openerControls: extracted.openerControls,
    };
  }

  async getFormFields(): Promise<FormField[]> {
    return (await this.inspectPage()).fields;
  }

  /**
   * Waits for the page to actually render form controls.
   *
   * Returns whether any appeared. A caller must treat `false` as "this is not
   * an application form" rather than retrying blindly.
   */
  async waitForFormControls(timeoutMs = 10_000): Promise<boolean> {
    const page = this.requirePage();
    try {
      await page.waitForSelector("input, textarea, select", { timeout: timeoutMs, state: "attached" });
      return true;
    } catch {
      logger.warn("No form controls appeared", { url: page.url(), timeoutMs });
      return false;
    }
  }

  /**
   * Follows a control that opens the application form.
   *
   * Separate from `click` because these are the one class of control we
   * deliberately actuate on a posting page — and separate from `submitForm`
   * because following a link is not sending anything.
   */
  async openApplicationForm(selector: string): Promise<PageSnapshot> {
    const page = this.requirePage();
    await page.locator(selector).first().click();
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await this.waitForFormControls();

    logger.info("Opened the application form", { url: page.url() });
    return this.inspectPage();
  }

  async fillField(selector: string, value: string): Promise<FillOutcome> {
    const page = this.requirePage();
    try {
      await page.fill(selector, value);
      logger.info("Field filled", { selector, length: value.length });
      return { ok: true, selector };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      logger.warn("Field could not be filled", { selector, reason });
      return { ok: false, selector, reason };
    }
  }

  async selectOption(selector: string, value: string): Promise<FillOutcome> {
    const page = this.requirePage();
    try {
      await page.selectOption(selector, { label: value });
      logger.info("Option selected", { selector, value });
      return { ok: true, selector };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      logger.warn("Option could not be selected", { selector, value, reason });
      return { ok: false, selector, reason };
    }
  }

  /** Checks the radio or checkbox whose visible label matches `value`. */
  async chooseOption(selector: string, value: string): Promise<FillOutcome> {
    const page = this.requirePage();
    try {
      const candidates = page.locator(selector);
      const count = await candidates.count();

      for (let index = 0; index < count; index += 1) {
        const option = candidates.nth(index);
        const id = await option.getAttribute("id");
        const label = id
          ? ((await page.locator(`label[for="${id}"]`).textContent()) ?? "")
          : ((await option.getAttribute("value")) ?? "");

        if (label.trim().toLowerCase() === value.trim().toLowerCase()) {
          await option.check();
          logger.info("Option chosen", { selector, value });
          return { ok: true, selector };
        }
      }

      return { ok: false, selector, reason: `No option labelled "${value}".` };
    } catch (error) {
      return { ok: false, selector, reason: error instanceof Error ? error.message : String(error) };
    }
  }

  async uploadFile(selector: string, filePath: string): Promise<FillOutcome> {
    const page = this.requirePage();
    try {
      await page.setInputFiles(selector, filePath);
      logger.info("File uploaded", { selector, filePath });
      return { ok: true, selector };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      logger.warn("File could not be uploaded", { selector, reason });
      return { ok: false, selector, reason };
    }
  }

  /**
   * Clicks a control — unless it submits the form.
   *
   * This is the hard stop. It throws rather than returning a failure so a
   * caller cannot treat it as a recoverable condition and retry.
   */
  async click(selector: string): Promise<FillOutcome> {
    const page = this.requirePage();
    const locator = page.locator(selector).first();

    const [label, type, name, id] = await Promise.all([
      locator.textContent().catch(() => null),
      locator.getAttribute("type").catch(() => null),
      locator.getAttribute("name").catch(() => null),
      locator.getAttribute("id").catch(() => null),
    ]);

    if (looksLikeSubmit({ label, type, name, id })) {
      logger.warn("Blocked a click on a submit control", { selector, label });
      throw new SubmitBlockedError(selector, (label ?? selector).trim());
    }

    await locator.click();
    return { ok: true, selector };
  }

  /**
   * Clicks a submit control. The only method that will.
   *
   * `click` still refuses submit controls and always will — that keeps every
   * other code path incapable of submitting, by construction. Reaching this
   * one requires naming it explicitly *and* passing an authorization derived
   * from a recorded human approval, so no generic action or mistaken selector
   * can send an application.
   *
   * Returns evidence rather than a boolean: what the page said afterwards is
   * the only thing separating a real submission from a silent failure.
   */
  async submitForm(params: {
    selector: string;
    authorization: SubmissionAuthorization;
    form: SubmittableForm;
    screenshotName?: string;
  }): Promise<SubmissionEvidence> {
    assertMaySubmit(params.authorization, params.form);

    const page = this.requirePage();
    const locator = page.locator(params.selector).first();

    if ((await locator.count()) === 0) {
      throw new SubmissionRefusedError(`no control matches "${params.selector}".`);
    }

    const label = ((await locator.textContent().catch(() => null)) ?? params.selector).trim();
    logSubmissionIntent(params.authorization, label);

    const screenshotBefore = params.screenshotName
      ? await this.takeScreenshot(`${params.screenshotName}-before`)
      : null;

    await locator.click();

    // Let the page navigate or render its acknowledgement. A form that does
    // neither is reported as unconfirmed rather than assumed successful.
    await page.waitForLoadState("networkidle").catch(() => undefined);

    const screenshotAfter = params.screenshotName
      ? await this.takeScreenshot(`${params.screenshotName}-after`)
      : null;

    const body = await page.locator("body").innerText().catch(() => "");
    const confirmationText = findConfirmation(body);

    logger.info("Submission completed", {
      applicationId: params.authorization.applicationId,
      url: page.url(),
      confirmed: confirmationText !== null,
    });

    return {
      url: page.url(),
      confirmationText,
      screenshotBefore,
      screenshotAfter,
      submittedAt: new Date(),
    };
  }

  /**
   * Leaves the filled form open in a visible window for a person to finish.
   *
   * The alternative to auto-submit: everything is typed and attached, the page
   * is scrolled to the submit control, and the browser simply stays open. No
   * click is made. Resolves when the person closes the window.
   */
  async handOffToHuman(submitSelector: string | null): Promise<void> {
    const page = this.requirePage();

    if (submitSelector) {
      await page
        .locator(submitSelector)
        .first()
        .scrollIntoViewIfNeeded()
        .catch(() => undefined);
    }

    logger.info("Handed off to a human; the browser stays open", { url: page.url() });

    await page.waitForEvent("close", { timeout: 0 });
  }

  async takeScreenshot(name: string): Promise<string> {
    const page = this.requirePage();
    const path = `${this.options.artifactDir ?? "."}/${name}.png`;
    await page.screenshot({ path, fullPage: true });
    logger.info("Screenshot captured", { path });
    return path;
  }

  async close(): Promise<void> {
    await this.page?.context().close();
    await this.browser?.close();
    this.browser = null;
    this.page = null;
  }

  private requirePage(): Page {
    if (!this.page) throw new Error("No page is open. Call openPage() first.");
    return this.page;
  }
}

/**
 * Renders HTML to a PDF file.
 *
 * Application forms want a PDF, not Markdown. Chromium is already a
 * dependency for form filling, so printing through it adds no new library and
 * produces exactly what the review screen previews.
 */
export const printHtmlToPdf = async (
  html: string,
  outputPath: string,
  options: { headless?: boolean } = {},
): Promise<string> => {
  const browser = await chromium.launch({ headless: options.headless ?? true });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await page.pdf({
      path: outputPath,
      format: "A4",
      printBackground: true,
      // Margins live in the document's own @page rule.
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    logger.info("PDF written", { path: outputPath });
    return outputPath;
  } finally {
    await browser.close();
  }
};
