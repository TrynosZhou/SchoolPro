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
  classTeacher?: string;
  columns: TimetablePdfColumn[];
  rows: TimetablePdfRow[];
  fileName: string;
}

const MARGIN = 10;
const DAY_COL_W = 20;
const HEADER_H = 15;
const LINE_H = 4;
const CELL_PAD = 1.5;
const ROW_H = 25;
const GRID_LINE = [0, 0, 0] as const;

/** Render a weekly timetable grid (days × periods) to a downloadable A4 landscape PDF. */
export async function downloadTimetablePdf(options: TimetablePdfOptions): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - MARGIN * 2;
  const colCount = Math.max(options.columns.length, 1);
  const colW = (contentWidth - DAY_COL_W) / colCount;

  let y = MARGIN;

  // Render Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  doc.setTextColor(0, 0, 0);
  doc.text(options.title, pageWidth / 2, y + 8, { align: 'center' });
  y += 12;

  if (options.subtitle) {
    doc.setFontSize(16);
    doc.text(options.subtitle, pageWidth / 2, y, { align: 'center' });
    y += 8;
  }

  if (options.classTeacher) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Class teacher: ${options.classTeacher}`, pageWidth - MARGIN, MARGIN + 5, { align: 'right' });
  }

  const drawHeader = (top: number): number => {
    doc.setDrawColor(GRID_LINE[0], GRID_LINE[1], GRID_LINE[2]);
    doc.setLineWidth(0.4);

    doc.setFillColor(255, 255, 255);
    doc.rect(MARGIN, top, DAY_COL_W, HEADER_H, 'FD');

    options.columns.forEach((col, i) => {
      const cx = MARGIN + DAY_COL_W + i * colW;
      doc.rect(cx, top, colW, HEADER_H, 'FD');

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
      doc.rect(cx, y, colW, ROW_H, 'D');

      if (cell.isBreak) {
        if (cell.breakLabel && ri === 0) {
          doc.setFontSize(18);
          doc.setFont('helvetica', 'normal');
          doc.text(cell.breakLabel, cx + colW / 2, gridTop + totalGridHeight / 2, {
            align: 'center',
            baseline: 'middle',
            angle: 90
          });
        }
        return;
      }

      if (cell.topLeft) {
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.text(cell.topLeft, cx + 1, y + 3, { baseline: 'top' });
      }
      if (cell.topRight) {
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.text(cell.topRight, cx + colW - 1, y + 3, { align: 'right', baseline: 'top' });
      }
      if (cell.main) {
        doc.setFontSize(14);
        doc.setFont('helvetica', 'normal');
        doc.text(cell.main, cx + 1, y + ROW_H / 2, { baseline: 'middle' });
      }
      if (cell.bottomRight) {
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.text(cell.bottomRight, cx + colW - 1, y + ROW_H - 1, { align: 'right', baseline: 'bottom' });
      }
      if (cell.bottomCenter) {
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.text(cell.bottomCenter, cx + colW / 2, y + ROW_H - 1, { align: 'center', baseline: 'bottom' });
      }
    });

    y += ROW_H;
  });

  doc.save(options.fileName);
}
