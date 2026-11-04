/** Build a safe PDF download name from the student's name. */
export function reportCardPdfFilename(
  firstName?: string,
  lastName?: string,
  fallback = 'report-card',
): string {
  const raw = `${firstName ?? ''} ${lastName ?? ''}`.trim();
  const base = raw || fallback;
  const safe = base
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/ /g, '-');
  return `${safe || fallback}.pdf`;
}
