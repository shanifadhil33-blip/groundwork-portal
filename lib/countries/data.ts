// Country data only. To support a new country, add an entry here; lib/countries/rules.ts reads it.
// phone.national: regex for the national number (after the country code, without the trunk 0).
// phone.groups: digit groups for display, by national number length.
// tax.pattern: regex for the stored value (spaces and dashes removed, upper case).
export type CountryData = {
  name: string;
  dial?: string;
  currency?: string;
  aliases?: string[];
  region?: { label: string; options?: readonly string[] };
  phone?: { national: string; trunk?: string; example: string; groups?: Record<number, number[]> };
  tax?: { label: string; pattern: string; hint: string; example: string; groups?: number[] };
};

/** Shown first in country menus, in this order. */
export const GCC_FIRST = ['AE', 'SA', 'OM', 'QA', 'BH', 'KW'] as const;

export const COUNTRIES: Record<string, CountryData> = {
  AE: {
    name: 'United Arab Emirates', dial: '971', currency: 'AED', aliases: ['UAE', 'Emirates', 'Dubai', 'Abu Dhabi'],
    region: { label: 'Emirate', options: ['Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah'] },
    phone: { national: '5[024568]\\d{7}|[234679]\\d{7}|800\\d{2,7}|600\\d{6}', trunk: '0', example: '+971 50 123 4567', groups: { 9: [2, 3, 4], 8: [1, 3, 4] } },
    tax: { label: 'TRN', pattern: '100\\d{12}', hint: 'Tax Registration Number, 15 digits starting with 100.', example: '100 1234 5678 9003', groups: [3, 4, 4, 4] },
  },
  SA: {
    name: 'Saudi Arabia', dial: '966', currency: 'SAR', aliases: ['KSA', 'Saudi', 'Riyadh', 'Jeddah'],
    region: { label: 'Region', options: ['Riyadh', 'Makkah', 'Madinah', 'Eastern Province', 'Asir', 'Tabuk', 'Qassim', 'Hail', 'Northern Borders', 'Jazan', 'Najran', 'Al Bahah', 'Al Jawf'] },
    phone: { national: '5\\d{8}|1[1-7]\\d{7}|800\\d{7}|92\\d{7}', trunk: '0', example: '+966 50 123 4567', groups: { 9: [2, 3, 4], 10: [3, 3, 4] } },
    tax: { label: 'VAT number', pattern: '3\\d{13}3', hint: '15 digits, starting and ending with 3.', example: '300 1234 5678 0003', groups: [3, 4, 4, 4] },
  },
  OM: {
    name: 'Oman', dial: '968', currency: 'OMR', aliases: ['Muscat'],
    region: { label: 'Governorate', options: ['Muscat', 'Dhofar', 'Musandam', 'Al Buraimi', 'Ad Dakhiliyah', 'North Al Batinah', 'South Al Batinah', 'North Ash Sharqiyah', 'South Ash Sharqiyah', 'Ad Dhahirah', 'Al Wusta'] },
    phone: { national: '[279]\\d{7}|800\\d{5}', example: '+968 9123 4567', groups: { 8: [4, 4] } },
    tax: { label: 'VATIN', pattern: 'OM\\d{10}', hint: 'OM followed by 10 digits.', example: 'OM1100012345' },
  },
  QA: {
    name: 'Qatar', dial: '974', currency: 'QAR', aliases: ['Doha'],
    region: { label: 'Municipality', options: ['Doha', 'Al Rayyan', 'Al Wakrah', 'Al Khor', 'Al Shamal', 'Umm Salal', 'Al Daayen', 'Al Shahaniya'] },
    phone: { national: '[34567]\\d{7}|800\\d{4}', example: '+974 3312 3456', groups: { 8: [4, 4] } },
  },
  BH: {
    name: 'Bahrain', dial: '973', currency: 'BHD', aliases: ['Manama'],
    region: { label: 'Governorate', options: ['Capital', 'Muharraq', 'Northern', 'Southern'] },
    phone: { national: '[136]\\d{7}|80\\d{6}', example: '+973 3600 1234', groups: { 8: [4, 4] } },
    tax: { label: 'VAT account number', pattern: '\\d{15}', hint: '15 digits.', example: '200 0123 4567 8901', groups: [3, 4, 4, 4] },
  },
  KW: {
    name: 'Kuwait', dial: '965', currency: 'KWD', aliases: ['Kuwait City'],
    region: { label: 'Governorate', options: ['Capital', 'Hawalli', 'Farwaniya', 'Mubarak Al Kabeer', 'Ahmadi', 'Jahra'] },
    phone: { national: '[2569]\\d{7}|1\\d{6}', example: '+965 5000 1234', groups: { 8: [4, 4] } },
  },
  IN: {
    name: 'India', dial: '91', currency: 'INR', aliases: ['Bharat'],
    region: { label: 'State', options: ['Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry'] },
    phone: { national: '[6-9]\\d{9}|[1-5]\\d{9}', trunk: '0', example: '+91 98765 43210', groups: { 10: [5, 5] } },
    tax: { label: 'GSTIN', pattern: '\\d{2}[A-Z]{5}\\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]', hint: '15 characters, like 27AAPFU0939F1ZV.', example: '27AAPFU0939F1ZV' },
  },
  GB: {
    name: 'United Kingdom', dial: '44', currency: 'GBP', aliases: ['UK', 'Britain', 'England', 'Scotland', 'Wales'],
    region: { label: 'County' },
    phone: { national: '[1-9]\\d{8,9}', trunk: '0', example: '+44 20 7946 0000' },
    tax: { label: 'VAT number', pattern: '(GB)?\\d{9}(\\d{3})?', hint: '9 digits, optionally starting with GB.', example: 'GB123456789' },
  },
  US: {
    name: 'United States', dial: '1', currency: 'USD', aliases: ['USA', 'America'],
    region: { label: 'State', options: ['Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware', 'District of Columbia', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming'] },
    phone: { national: '[2-9]\\d{2}[2-9]\\d{6}', trunk: '1', example: '+1 415 555 0132', groups: { 10: [3, 3, 4] } },
  },
  EG: { name: 'Egypt', dial: '20', currency: 'EGP' },
  JO: { name: 'Jordan', dial: '962', currency: 'JOD' },
  LB: { name: 'Lebanon', dial: '961', currency: 'LBP' },
  PK: { name: 'Pakistan', dial: '92', currency: 'PKR' },
  PH: { name: 'Philippines', dial: '63', currency: 'PHP' },
};

/** Every ISO 3166 country code; names come from Intl.DisplayNames when there is no entry above. */
export const ALL_COUNTRY_CODES = 'AD AE AF AG AI AL AM AO AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' ');
