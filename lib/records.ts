// Client and site record types and address lines. Field rules (phone, region) live in lib/countries.
import { country } from './countries/rules';
export { formatPhone, normalizePhone, normalizeRegion, phoneHint, regionField } from './countries/rules';

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ClientRecord = {
  contract_visits?: number | null; contract_ends_on?: string | null; contract_used?: number;
  id: string; name: string; country?: string | null; contact_name?: string | null; phone?: string | null; email?: string | null;
  billing_building?: string | null; billing_street?: string | null; billing_area?: string | null; billing_city?: string | null; billing_region?: string | null;
  notes?: string | null;
};
export type SiteRecord = {
  id: string; client_id: string; name: string; address: string; building?: string | null; area?: string | null; region?: string | null;
  access_notes?: string | null; contact_name?: string | null; contact_phone?: string | null;
};

/** The country a client's records follow: its own override, else the workspace's. */
export function recordCountry(client: Pick<ClientRecord, 'country'> | null | undefined, workspaceCountry?: string | null) {
  return client?.country || workspaceCountry || country().code;
}

/** One line billing address, building first, region last; the country only when it differs from the workspace. */
export function billingAddress(c: Partial<ClientRecord>, workspaceCountry?: string | null) {
  const foreign = c.country && c.country !== workspaceCountry ? country(c.country).name : null;
  return parts([c.billing_building, c.billing_street, c.billing_area, c.billing_city, c.billing_region, foreign]);
}
export function siteAddress(s: Partial<SiteRecord>) { return parts([s.building, s.address, s.area, s.region]); }
/** Address parts in order, without blanks or a repeat (Dubai the city, Dubai the emirate). */
function parts(values: (string | null | undefined)[]) {
  const seen = new Set<string>();
  return values.filter((v): v is string => !!v && !seen.has(v.toLowerCase()) && !!seen.add(v.toLowerCase())).join(', ');
}
