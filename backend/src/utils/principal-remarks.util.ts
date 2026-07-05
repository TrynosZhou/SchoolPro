/** Append the configured headmaster name as a signature on principal remarks. */
export function appendHeadmasterToPrincipalRemarks(
  remarks: string | null | undefined,
  headmasterName: string | null | undefined,
): string {
  const body = (remarks || '').trim();
  const head = (headmasterName || '').trim();
  if (!head) return body;
  const signature = `\n\n${head}\nHeadmaster`;
  return body ? `${body}${signature}` : head;
}
