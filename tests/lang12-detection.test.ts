import { expect, it } from 'vitest';
import { hasUntranslatedLatin } from '../e2e/lang12-detection.mjs';
it.each([
 'sample.csv', 'Asia/Dubai', 'accounts@harborpine.example', 'yusuf@harbor.example',
 'Northgate East', 'Northgate West · Dubai Investments Park 1', 'Ravi, Northgate East',
 'Warehouse 14, Northgate East, Al Quoz Industrial Area 3',
 'Pine House, Office 1204, Al Marsa Street, Dubai Marina, Dubai',
 'صباح الخير يا فريق. Northgate طلبوا زيارة مبكرة اليوم، شيّكوا شغلكم.',
])('exempts only complete data tokens in %s', line => expect(hasUntranslatedLatin(line)).toBe(false));
it.each([
 'Real name: Ravi', 'Call Yousef Qureshi', '0 Today for Anil',
 'SAMPLE Civil Defence certificate', 'Sample.csv is ready to import',
 'Northgate East: Open job', 'Your session belongs to Northgate Self Storage.',
 'Change priority for WO 1 Replace lobby light fixture: low to high',
])('keeps interface words around data visible to the scan: %s', line => expect(hasUntranslatedLatin(line)).toBe(true));
