/**
 * Canonical phone format used for deduplication, lookups, and indexing.
 *
 * Strips every non-digit character. For 8-digit numbers (Panama local format)
 * the country code `507` is prepended. All other inputs are returned as
 * digits-only without further transformation — callers that need stricter
 * E.164 validation should layer it on top.
 *
 * Examples:
 *   "+507 6680-1776"  -> "50766801776"
 *   "(507) 6680 1776" -> "50766801776"
 *   "6680-1776"       -> "50766801776"
 *   "1-415-555-0100"  -> "14155550100"
 */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 8) return `507${digits}`;
  return digits;
}
