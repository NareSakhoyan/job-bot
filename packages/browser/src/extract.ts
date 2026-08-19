/// <reference lib="dom" />

/**
 * Runs inside the page to describe every form control.
 *
 * Kept as a single self-contained function because Playwright serialises it
 * into the browser: it cannot close over anything from this module.
 */
export const EXTRACT_FORM_FIELDS = () => {
  const labelFor = (element: Element): string => {
    const id = element.getAttribute("id");
    if (id) {
      const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (label?.textContent) return label.textContent.trim();
    }

    const wrapping = element.closest("label");
    if (wrapping?.textContent) return wrapping.textContent.trim();

    const aria = element.getAttribute("aria-label");
    if (aria) return aria.trim();

    const describedBy = element.getAttribute("aria-labelledby");
    if (describedBy) {
      const target = document.getElementById(describedBy);
      if (target?.textContent) return target.textContent.trim();
    }

    return (
      element.getAttribute("placeholder")?.trim() ??
      element.getAttribute("name")?.trim() ??
      ""
    );
  };

  /**
   * A selector that is verified to resolve to this element and nothing else.
   *
   * The previous fallback built `tag:nth-of-type(n)` from the element's index
   * in a *filtered candidate array*, while nth-of-type counts DOM siblings —
   * two different coordinate systems, so the selector pointed at an arbitrary
   * element or at nothing. On Ashby it produced `a:nth-of-type(5)` for a link
   * plainly labelled "Apply for this Job", and the click timed out.
   *
   * Every candidate is now tested against the live document before being
   * returned, so a selector that does not resolve is never emitted.
   */
  const selectorFor = (element: Element): string => {
    const resolvesUniquely = (selector: string): boolean => {
      try {
        const found = document.querySelectorAll(selector);
        return found.length === 1 && found[0] === element;
      } catch {
        return false;
      }
    };

    const tag = element.tagName.toLowerCase();
    const candidates: string[] = [];

    const id = element.getAttribute("id");
    if (id) candidates.push(`#${CSS.escape(id)}`);

    // Test hooks and accessible names are stable across renders in a way that
    // position is not, and ATS front-ends set them far more often than ids.
    for (const attribute of ["data-testid", "data-test-id", "data-test", "data-qa", "name", "aria-label"]) {
      const value = element.getAttribute(attribute);
      if (value) candidates.push(`${tag}[${attribute}="${CSS.escape(value)}"]`);
    }

    for (const candidate of candidates) {
      if (resolvesUniquely(candidate)) return candidate;
    }

    // Last resort: a structural path counted against real siblings, walking up
    // until it is unique or it reaches the root.
    let path = "";
    let node: Element | null = element;
    while (node && node !== document.documentElement) {
      const parent: Element | null = node.parentElement;
      if (!parent) break;
      const sameTag = Array.from(parent.children).filter(
        (child) => child.tagName === (node as Element).tagName,
      );
      const position = sameTag.indexOf(node) + 1;
      const step = `${node.tagName.toLowerCase()}:nth-of-type(${position})`;
      path = path ? `${step} > ${path}` : step;
      if (resolvesUniquely(path)) return path;

      const parentId = parent.getAttribute("id");
      if (parentId) {
        const scoped = `#${CSS.escape(parentId)} > ${path}`;
        if (resolvesUniquely(scoped)) return scoped;
      }
      node = parent;
    }

    return path || tag;
  };

  const controls = Array.from(
    document.querySelectorAll("input, textarea, select"),
  ) as Array<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>;

  const fields = [];
  const seenRadioGroups = new Set<string>();

  for (const [index, control] of controls.entries()) {
    const tag = control.tagName.toLowerCase();
    const inputType = tag === "input" ? (control as HTMLInputElement).type : tag;

    if (inputType === "hidden" || inputType === "submit" || inputType === "button") continue;

    // A radio group is one logical field with several options.
    if (inputType === "radio") {
      const name = control.getAttribute("name") ?? "";
      if (seenRadioGroups.has(name)) continue;
      seenRadioGroups.add(name);

      const members = Array.from(
        document.querySelectorAll(`input[type="radio"][name="${CSS.escape(name)}"]`),
      );

      fields.push({
        label: labelFor(members[0] ?? control).replace(/\s+/g, " "),
        name,
        type: "radio",
        required: members.some((member) => member.hasAttribute("required")),
        options: members.map((member) => labelFor(member).replace(/\s+/g, " ")),
        selector: `input[type="radio"][name="${name}"]`,
      });
      continue;
    }

    const options =
      tag === "select"
        ? Array.from((control as HTMLSelectElement).options)
            .map((option) => option.textContent?.trim() ?? "")
            .filter((text) => text.length > 0)
        : undefined;

    const maxLengthAttribute = control.getAttribute("maxlength");

    fields.push({
      label: labelFor(control).replace(/\s+/g, " "),
      name: control.getAttribute("name") ?? undefined,
      type: inputType,
      required: control.hasAttribute("required"),
      options,
      selector: selectorFor(control),
      placeholder: control.getAttribute("placeholder") ?? undefined,
      maxLength: maxLengthAttribute === null ? undefined : Number.parseInt(maxLengthAttribute, 10),
    });
  }

  // Classification mirrors classifyControl in submission.ts. It cannot import
  // it — this function is serialised into the page — so the two are kept
  // deliberately simple and covered by the same test fixtures.
  const openerPatterns = [
    /^apply\s*(now|here|for this (job|role|position))?$/i,
    /^view (and )?apply$/i,
    /^start (your )?application$/i,
  ];
  const senderPatterns = [
    /\bsubmit\b/i,
    /\bsend application\b/i,
    /\bsubmit application\b/i,
    /\bcomplete application\b/i,
    /\bconfirm and send\b/i,
    /\bfinish\b/i,
  ];

  const candidates = Array.from(
    document.querySelectorAll('button, input[type="submit"], [role="button"], a'),
  ).map((element) => ({
    label: (element.textContent?.trim() || element.getAttribute("value") || "").replace(/\s+/g, " "),
    type: element.getAttribute("type"),
    name: element.getAttribute("name"),
    id: element.getAttribute("id"),
    tag: element.tagName.toLowerCase(),
    // The same verified strategy as form fields; a control the run must click
    // is the last place a guessed selector belongs.
    selector: selectorFor(element),
  }));

  const submitControls = [];
  const openerControls = [];

  for (const control of candidates) {
    const haystack = [control.label, control.name, control.id]
      .filter(Boolean)
      .join(" ")
      .replace(/[^a-zA-Z0-9]+/g, " ")
      .trim();

    if (openerPatterns.some((pattern) => pattern.test(haystack))) {
      openerControls.push({ label: control.label, selector: control.selector });
      continue;
    }

    // An anchor navigates; it never sends a form.
    if (control.tag === "a") continue;

    if (
      senderPatterns.some((pattern) => pattern.test(haystack)) ||
      (control.type ?? "").toLowerCase() === "submit"
    ) {
      submitControls.push({ label: control.label, selector: control.selector });
    }
  }

  return { fields, submitControls, openerControls };
};
