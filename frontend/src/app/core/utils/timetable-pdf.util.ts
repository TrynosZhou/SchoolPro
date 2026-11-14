export interface TimetablePdfColumn {
  /** Primary header text — e.g. period number or "BREAK". */
  header: string;
  /** Optional secondary header — e.g. "8:00 - 8:40". */
  time?: string;
  /** Break columns are shaded and normally left empty. */
  isBreak?: boolean;
}

export interface TimetablePdfCell {
  main?: string;
  topLeft?: string;
  topRight?: string;
  bottomLeft?: string;
  bottomRight?: string;
  bottomCenter?: string;
  isBreak?: boolean;
  breakLabel?: string;
}

export interface TimetablePdfRow {
  /** Row label — the day, e.g. "Mo". */
  label: string;
  /** One entry per column. */
  cells: TimetablePdfCell[];
}

export interface TimetablePdfOptions {
  title: string;
  subtitle?: string;
  /** Centred line below the subtitle — e.g. "Class: Form 1A" or "Teacher: Mr Zhou T". */
  heading?: string;
  classTeacher?: string;
  columns: TimetablePdfColumn[];
  rows: TimetablePdfRow[];
  fileName: string;
  /** Per-position font multipliers (1 = default), e.g. { bottomRight: 1.2 } for teacher names. */
  fontScale?: Partial<Record<'topLeft' | 'topRight' | 'main' | 'bottomRight' | 'bottomCenter', number>>;
}

const MARGIN = 10;
const DAY_COL_W = 20;
const HEADER_H = 15;
const LINE_H = 4;
const CELL_PAD = 1.5;
const ROW_H = 25;
const GRID_LINE = [0, 0, 0] as const;

/** Render a weekly timetable grid and download it as an A4 landscape PDF. */
export async function downloadTimetablePdf(options: TimetablePdfOptions): Promise<void> {
  const doc = await buildTimetableDoc(options);
  doc.save(options.fileName);
}

/** Render a weekly timetable grid to a PDF Blob (used for in-app previews). */
export async function buildTimetablePdfBlob(options: TimetablePdfOptions): Promise<Blob> {
  const doc = await buildTimetableDoc(options);
  return doc.output('blob');
}

/** Render a weekly timetable grid to PDF bytes (used for bulk ZIP downloads). */
export async function buildTimetablePdfBytes(options: TimetablePdfOptions): Promise<Uint8Array> {
  const doc = await buildTimetableDoc(options);
  return new Uint8Array(doc.output('arraybuffer'));
}

type CellPos = 'topLeft' | 'topRight' | 'main' | 'bottomRight' | 'bottomCenter';

async function buildTimetableDoc(options: TimetablePdfOptions) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - MARGIN * 2;
  const colCount = Math.max(options.columns.length, 1);
  const colW = (contentWidth - DAY_COL_W) / colCount;

  let y = MARGIN;

  /** Sets the font for a cell text, scaled by the options and shrunk so it fits inside the cell. */
  const fitCellText = (text: string, pos: CellPos, baseSize: number) => {
    const scale = options.fontScale?.[pos] ?? 1;
    let size = baseSize * scale;
    const maxW = colW - 2;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(size);
    while (size > 4 && doc.getTextWidth(text) > maxW) {
      size -= 0.5;
      doc.setFontSize(size);
    }
  };

  // Render Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  doc.setTextColor(0, 0, 0);
  doc.text(options.title, pageWidth / 2, y + 8, { align: 'center' });
  y += 16;

  if (options.subtitle) {
    doc.setFontSize(16);
    doc.text(options.subtitle, pageWidth / 2, y + 2, { align: 'center' });
    y += 10;
  }

  const classTeacher = (options.classTeacher || '').trim();
  const hasClassTeacher = !!classTeacher && classTeacher !== '—' && classTeacher !== '-';

  if (options.heading && hasClassTeacher) {
    // Class name (centre) and class teacher (far right) share the line just above the grid header row.
    y += 2;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(options.heading, pageWidth / 2, y + 5, { align: 'center' });
    doc.setFontSize(12);
    doc.text(`Class teacher: ${classTeacher}`, pageWidth - MARGIN, y + 5, { align: 'right' });
    y += 9;
  } else if (options.heading) {
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(options.heading, pageWidth / 2, y + 2, { align: 'center' });
    y += 9;
  }

  const drawHeader = (top: number): number => {
    doc.setDrawColor(GRID_LINE[0], GRID_LINE[1], GRID_LINE[2]);
    doc.setLineWidth(0.4);

    // jsPDF text drawing switches the PDF fill colour to the text colour (black), so the
    // fill must be set again before EVERY filled rect — otherwise header cells render solid black
    // and hide the period numbers and lesson times.
    doc.setFillColor(255, 255, 255);
    doc.rect(MARGIN, top, DAY_COL_W, HEADER_H, 'FD');

    options.columns.forEach((col, i) => {
      const cx = MARGIN + DAY_COL_W + i * colW;
      if (col.isBreak) {
        doc.setFillColor(235, 235, 235);
      } else {
        doc.setFillColor(255, 255, 255);
      }
      doc.rect(cx, top, colW, HEADER_H, 'FD');
      doc.setTextColor(0, 0, 0);

      if (col.isBreak) {
        doc.setFontSize(6);
        doc.setFont('helvetica', 'bold');
        doc.text(col.header, cx + colW / 2, top + HEADER_H / 2, { align: 'center', baseline: 'middle' });
      } else {
        doc.setFontSize(14);
        doc.setFont('helvetica', 'normal');
        doc.text(col.header, cx + colW / 2, top + 6, { align: 'center', baseline: 'middle' });
        
        if (col.time) {
          doc.setFontSize(6);
          doc.setFont('helvetica', 'bold');
          doc.text(col.time, cx + colW / 2, top + 11, { align: 'center', baseline: 'middle' });
        }
      }
    });

    return top + HEADER_H;
  };

  y = drawHeader(y);
  const gridTop = y;
  const totalGridHeight = options.rows.length * ROW_H;

  options.rows.forEach((row, ri) => {
    if (y + ROW_H > pageHeight - MARGIN) {
      doc.addPage();
      y = drawHeader(MARGIN);
    }

    doc.setDrawColor(GRID_LINE[0], GRID_LINE[1], GRID_LINE[2]);
    doc.setLineWidth(0.4);

    doc.rect(MARGIN, y, DAY_COL_W, ROW_H, 'D');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(22);
    doc.text(row.label, MARGIN + DAY_COL_W / 2, y + ROW_H / 2, { align: 'center', baseline: 'middle' });

    options.columns.forEach((col, i) => {
      const cx = MARGIN + DAY_COL_W + i * colW;
      const cell = row.cells[i];
      if (cell.isBreak) {
        // Break / lunch columns are one merged cell spanning every day row: draw it once.
        if (ri === 0) {
          const mergedH = Math.min(totalGridHeight, pageHeight - MARGIN - gridTop);
          doc.setDrawColor(GRID_LINE[0], GRID_LINE[1], GRID_LINE[2]);
          doc.setLineWidth(0.4);
          doc.setFillColor(245, 245, 245);
          doc.rect(cx, gridTop, colW, mergedH, 'FD');
        }
        if (cell.breakLabel && ri === 0) {
          const labelFontSize = 18;
          doc.setFontSize(labelFontSize);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(0, 0, 0);
          // jsPDF applies `align` / `baseline` offsets on the un-rotated axes, which pushed the
          // rotated label into the neighbouring lesson column. Position it manually instead:
          // rotated 90° (reading bottom→top) the text runs upward from its anchor point and its
          // glyphs sit to the LEFT of the baseline, so centre it on the break column explicitly.
          const textWidth = doc.getTextWidth(cell.breakLabel);
          const capHeight = labelFontSize * 0.3528 * 0.72; // pt → mm × cap-height ratio
          doc.text(
            cell.breakLabel,
            cx + colW / 2 + capHeight / 2,
            gridTop + totalGridHeight / 2 + textWidth / 2,
            { angle: 90 },
          );
        }
        return;
      }

      doc.rect(cx, y, colW, ROW_H, 'D');

      if (cell.topLeft) {
        fitCellText(cell.topLeft, 'topLeft', 7);
        doc.text(cell.topLeft, cx + 1, y + 3, { baseline: 'top' });
      }
      if (cell.topRight) {
        fitCellText(cell.topRight, 'topRight', 7);
        doc.text(cell.topRight, cx + colW - 1, y + 3, { align: 'right', baseline: 'top' });
      }
      if (cell.main) {
        fitCellText(cell.main, 'main', 14);
        doc.text(cell.main, cx + 1, y + ROW_H / 2, { baseline: 'middle' });
      }
      if (cell.bottomRight) {
        fitCellText(cell.bottomRight, 'bottomRight', 7);
        doc.text(cell.bottomRight, cx + colW - 1, y + ROW_H - 1, { align: 'right', baseline: 'bottom' });
      }
      if (cell.bottomCenter) {
        fitCellText(cell.bottomCenter, 'bottomCenter', 7);
        doc.text(cell.bottomCenter, cx + colW / 2, y + ROW_H - 1, { align: 'center', baseline: 'bottom' });
      }
    });

    y += ROW_H;
  });

  return doc;
}
