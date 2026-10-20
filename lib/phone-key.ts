/** Digits only, with a leading 00 read as a country code. Shared by WhatsApp matching and the phone check. */
export const phoneKey = (value: string) => value.replace(/\D/g, '').replace(/^00/, '');
