import type { ResumeDraft } from "@job-bot/shared";
import type { SourceProfile } from "./types";

const formatMonth = (date: Date): string =>
  new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }).format(date);

/**
 * Renders a verified draft to Markdown. Rendering happens after verification
 * and only from verified fields, so nothing unverified can reach the document.
 */
export const renderResumeMarkdown = (profile: SourceProfile, draft: ResumeDraft): string => {
  const bySlug = new Map(profile.experiences.map((experience) => [experience.slug, experience]));

  const sections = draft.sections.flatMap((section) => {
    const experience = bySlug.get(section.experienceSlug);
    if (!experience) return [];

    const period = `${formatMonth(experience.startDate)} – ${
      experience.isCurrent || experience.endDate === null
        ? "present"
        : formatMonth(experience.endDate)
    }`;

    return [
      `### ${experience.role} — ${experience.company}`,
      `${period} · ${experience.location}${experience.isRemote ? " (remote)" : ""}`,
      "",
      ...section.bullets.map((bullet) => `- ${bullet.text}`),
      "",
    ];
  });

  // `missingInformation` is deliberately absent from the rendered document.
  //
  // It is a note to whoever reviews the application — "the posting asked for
  // Playwright and the record shows Jest" — and it was being printed into the
  // resume itself under a "Not recorded in the profile" heading. That put a
  // list of the candidate's gaps in front of the employer, on the candidate's
  // own CV. It stays on the TailoredResume record, where the review screen can
  // show it; it never reaches the page.

  return [
    `# ${profile.fullName}`,
    "",
    profile.headline,
    "",
    "## Summary",
    "",
    draft.summary,
    "",
    "## Experience",
    "",
    ...sections,
    "## Skills",
    "",
    draft.highlightedSkills.join(" · "),
    "",
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

/**
 * A deliberately small Markdown subset: headings, bullets, bold and
 * paragraphs. That is the whole grammar `renderResumeMarkdown` emits, so a
 * general Markdown dependency would be carrying weight it never uses.
 */
const inlineToHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");

const markdownToHtml = (markdown: string): string => {
  const out: string[] = [];
  let inList = false;

  const closeList = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  };

  for (const raw of markdown.split("\n")) {
    const line = raw.trimEnd();

    if (line.trim().length === 0) {
      closeList();
      continue;
    }

    if (line.startsWith("- ")) {
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${inlineToHtml(line.slice(2))}</li>`);
      continue;
    }

    closeList();

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1]!.length;
      out.push(`<h${level}>${inlineToHtml(heading[2] ?? "")}</h${level}>`);
      continue;
    }

    out.push(`<p>${inlineToHtml(line)}</p>`);
  }

  closeList();
  return out.join("\n");
};

/** Print styling. A4, conservative type, no colour that costs ink or clarity. */
const PRINT_CSS = `
  @page { size: A4; margin: 16mm 15mm; }
  body { font-family: Georgia, "Times New Roman", serif; font-size: 10.5pt; line-height: 1.45; color: #16181d; }
  h1 { font-size: 20pt; margin: 0 0 2pt; letter-spacing: -0.01em; }
  h1 + p { margin: 0 0 14pt; font-size: 10pt; color: #55606e; }
  h2 { font-size: 11pt; text-transform: uppercase; letter-spacing: 0.08em; color: #55606e;
       margin: 16pt 0 6pt; padding-bottom: 3pt; border-bottom: 0.6pt solid #c9ced6; }
  h3 { font-size: 11.5pt; margin: 11pt 0 1pt; }
  h3 + p { margin: 0 0 5pt; font-size: 9pt; color: #55606e; }
  p { margin: 0 0 6pt; }
  ul { margin: 0 0 8pt; padding-left: 15pt; }
  li { margin-bottom: 3pt; }
  li, p { orphans: 2; widows: 2; }
  h2, h3 { break-after: avoid; }
`;

/**
 * Wraps an already-rendered resume in print-ready HTML.
 *
 * It takes the stored Markdown rather than the draft on purpose: that Markdown
 * is what grounding verified and what the review screen displayed, so printing
 * from anything else risks a PDF that differs from what was approved.
 *
 * Kept in this package rather than the browser one: this is presentation of a
 * resume, and the browser layer must stay free of application concerns — it
 * only knows how to turn HTML into a PDF.
 */
export const renderResumeHtml = (markdown: string, title: string): string => `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>${title}</title>
<style>${PRINT_CSS}</style></head>
<body>
${markdownToHtml(markdown)}
</body></html>`;
