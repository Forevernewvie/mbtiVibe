import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const REPORT_LAYOUT = {
  pageWidth: 595,
  pageHeight: 842,
  startY: 800,
  minY: 80,
  defaultX: 45,
  maxTextWidth: 500,
  baseLineHeight: 14,
  headingSizeThreshold: 14,
  headingSpacing: 24,
  bodySpacing: 16,
} as const;

type ReportPayload = {
  assessmentId: string;
  archetype: string;
  summary: string;
  axisScores: Array<{ label: string; score: number }>;
  strengths: string[];
  blindSpots: string[];
  actionPlans: Array<{ day: number; title: string; details: string }>;
};

/**
 * Generates downloadable PDF report payload for paid users.
 */
export async function buildReportPdf(payload: ReportPayload) {
  const doc = await PDFDocument.create();
  doc.addPage([REPORT_LAYOUT.pageWidth, REPORT_LAYOUT.pageHeight]);

  const titleFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const bodyFont = await doc.embedFont(StandardFonts.Helvetica);

  let y = REPORT_LAYOUT.startY;

  /**
   * Writes a line and performs automatic pagination when needed.
   */
  const writeLine = (text: string, size = 11, indent = 0, color = rgb(0.12, 0.15, 0.22)) => {
    if (y < REPORT_LAYOUT.minY) {
      y = REPORT_LAYOUT.startY;
      doc.addPage([REPORT_LAYOUT.pageWidth, REPORT_LAYOUT.pageHeight]);
    }

    const activePage = doc.getPages()[doc.getPages().length - 1];

    activePage.drawText(text, {
      x: REPORT_LAYOUT.defaultX + indent,
      y,
      size,
      font: size >= REPORT_LAYOUT.headingSizeThreshold ? titleFont : bodyFont,
      color,
      maxWidth: REPORT_LAYOUT.maxTextWidth,
      lineHeight: REPORT_LAYOUT.baseLineHeight,
    });

    y -= size >= REPORT_LAYOUT.headingSizeThreshold ? REPORT_LAYOUT.headingSpacing : REPORT_LAYOUT.bodySpacing;
  };

  writeLine("AI Career Growth Diagnostic", 18);
  writeLine(`Assessment ID: ${payload.assessmentId}`, 10);
  writeLine(`Archetype: ${payload.archetype}`, 12);
  writeLine(`Summary: ${payload.summary}`, 10);
  y -= 8;

  writeLine("Axis Scores", 14);
  for (const axis of payload.axisScores) {
    writeLine(`- ${axis.label}: ${axis.score}/100`, 11);
  }

  y -= 8;
  writeLine("Strengths", 14);
  for (const item of payload.strengths) {
    writeLine(`- ${item}`, 11);
  }

  y -= 8;
  writeLine("Blind Spots", 14);
  for (const item of payload.blindSpots) {
    writeLine(`- ${item}`, 11);
  }

  y -= 8;
  writeLine("7-Day Action Plan", 14);
  for (const item of payload.actionPlans) {
    writeLine(`Day ${item.day}. ${item.title}`, 11);
    writeLine(item.details, 10, 12, rgb(0.24, 0.26, 0.35));
  }

  return doc.save();
}
