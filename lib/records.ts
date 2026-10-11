// Client and site record fields, shared by the API validation and the forms so both agree exactly.
export const EMIRATES = ['Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah'] as const;
export type Emirate = typeof EMIRATES[number];
export const PHONE_HINT = '+971 50 123 4567';

/**
 * UAE numbers in any common form (+971 50 123 4567, 00971 50…, 050 123 4567, 04 123 4567) become E.164
 * (+971501234567). Other GCC or international numbers are accepted when written with their + country code.
 * Returns null when the input is not a valid number.
 */
export function normalizePhone(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  if (!/^[+(\d][\d\s().-]*$/.test(raw)) return null;
  let digits = raw.replace(/[\s().-]/g, '');
  if (digits.startsWith('00')) digits = '+' + digits.slice(2);
  const uae = /^(?:\+971|971|0)(5[024568]\d{7}|[234679]\d{7}|800\d{2,7}|600\d{6})$/.exec(digits);
  if (uae) return '+971' + uae[1];
  if (digits.startsWith('+971')) return null; // a UAE code with a malformed national number
  if (/^\+[1-9]\d{7,14}$/.test(digits)) return digits;
  return null;
}

/** +971501234567 → +971 50 123 4567; landlines +97141234567 → +971 4 123 4567. Others unchanged. */
export function formatPhone(value?: string | null) {
  if (!value) return '';
  const m = /^\+971(5\d)(\d{3})(\d{4})$/.exec(value) ?? /^\+971([234679])(\d{3})(\d{4})$/.exec(value);
  return m ? `+971 ${m[1]} ${m[2]} ${m[3]}` : value;
}

/** UAE Tax Registration Number: 15 digits starting with 100. Spaces and dashes are ignored. */
export function normalizeTrn(input: string): string | null {
  const digits = input.replace(/[\s-]/g, '');
  return /^100\d{12}$/.test(digits) ? digits : null;
}
export function formatTrn(value?: string | null) { return value ? value.replace(/^(\d{3})(\d{4})(\d{4})(\d{4})$/, '$1 $2 $3 $4') : ''; }

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ClientRecord = {
  id: string; name: string; contact_name?: string | null; phone?: string | null; email?: string | null;
  billing_building?: string | null; billing_street?: string | null; billing_area?: string | null; billing_city?: string | null; billing_emirate?: Emirate | null;
  trn?: string | null; notes?: string | null;
};
export type SiteRecord = {
  id: string; client_id: string; name: string; address: string; building?: string | null; area?: string | null;
  access_notes?: string | null; contact_name?: string | null; contact_phone?: string | null;
};

/** One line billing address, in the order a UAE envelope reads. */
export function billingAddress(c: Partial<ClientRecord>) {
  return [c.billing_building, c.billing_street, c.billing_area, c.billing_city, c.billing_emirate].filter(Boolean).join(', ');
}
export function siteAddress(s: Partial<SiteRecord>) { return [s.building, s.address, s.area].filter(Boolean).join(', '); }
