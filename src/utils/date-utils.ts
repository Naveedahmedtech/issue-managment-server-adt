// date-utils.ts
/**
 * Returns the ISO week number for the given date.
 * Algorithm: 
 *   1. Move date to nearest Thursday (ISO week starts Monday, and Jan 4 is always in week 1)
 *   2. Calculate days since first day of year
 *   3. Divide by 7, round up
 */
export function getISOWeek(date: Date): number {
  // Copy date so we don't modify the original
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // ISO week day (Monday = 1, Sunday = 7)
  const dayNum = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  // Shift to Thursday of this week
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  // Year start Thursday
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  // Calculate full weeks to nearest Thursday
  const weekNo = Math.ceil(
    (((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7
  );
  return weekNo;
}
