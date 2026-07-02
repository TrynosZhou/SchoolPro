import { HelpTopic } from '../config/system-help-manual';

const MARGIN = 18;
const PAGE_WIDTH = 210;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const LINE_HEIGHT = 5.5;

type JsPdfDoc = import('jspdf').jsPDF;

function addPageIfNeeded(doc: JsPdfDoc, y: number, blockHeight = 12): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + blockHeight > pageHeight - MARGIN) {
    doc.addPage();
    return MARGIN;
  }
  return y;
}

function wrapText(doc: JsPdfDoc, text: string, x: number, y: number, maxWidth: number, fontSize = 10): number {
  doc.setFontSize(fontSize);
  const lines = doc.splitTextToSize(text, maxWidth) as string[];
  for (const line of lines) {
    y = addPageIfNeeded(doc, y, LINE_HEIGHT + 2);
    doc.text(line, x, y);
    y += LINE_HEIGHT;
  }
  return y;
}

export async function downloadHelpManualPdf(topics: HelpTopic[], portalLabel = 'School Pro'): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = MARGIN;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(10, 37, 64);
  doc.text('Procedure Manual', MARGIN, y);
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  y = wrapText(
    doc,
    `${portalLabel} — step-by-step guide for using the system. Search in the Help panel to jump to any page.`,
    MARGIN,
    y,
    CONTENT_WIDTH,
    10,
  );
  y += 4;

  const sections = new Map<string, HelpTopic[]>();
  for (const topic of topics) {
    if (!sections.has(topic.section)) sections.set(topic.section, []);
    sections.get(topic.section)!.push(topic);
  }

  for (const [section, items] of sections) {
    y = addPageIfNeeded(doc, y, 16);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(30, 64, 175);
    doc.text(section.toUpperCase(), MARGIN, y);
    y += 7;

    for (const topic of items) {
      y = addPageIfNeeded(doc, y, 20);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(15, 23, 42);
      y = wrapText(doc, topic.title, MARGIN, y, CONTENT_WIDTH, 12);
      y += 1;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(71, 85, 105);
      y = wrapText(doc, topic.summary, MARGIN, y, CONTENT_WIDTH, 10);
      y += 1;

      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      y = wrapText(doc, `Page: ${topic.path}`, MARGIN, y, CONTENT_WIDTH, 9);
      y += 2;

      doc.setFontSize(10);
      doc.setTextColor(51, 65, 85);
      topic.steps.forEach((step, index) => {
        y = addPageIfNeeded(doc, y, LINE_HEIGHT + 2);
        y = wrapText(doc, `${index + 1}. ${step}`, MARGIN + 2, y, CONTENT_WIDTH - 2, 10);
      });

      y += 4;
    }
  }

  const date = new Date().toISOString().slice(0, 10);
  doc.save(`procedure-manual-${date}.pdf`);
}
