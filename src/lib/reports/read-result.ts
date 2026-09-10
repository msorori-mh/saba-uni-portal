/** A failed read must never be presented as an empty, successful report. */
export function requireReportRead<T>(result: {
  data: T;
  error: { message: string } | null;
}): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
