/** Letters from right to left scripts: Hebrew, Arabic (also Urdu, Pashto, Dari, Farsi), Syriac, Thaana and presentation forms. */
const RTL_LETTER = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
/**
 * Which way one line of reply text reads. A line with any right to left letters reads right to left, so its full stop
 * stays at the end. A line with only Latin words (a job number and an English title) reads left to right, so a
 * full stop after it does not jump to the wrong side.
 */
export const lineDirection = (line: string): 'rtl' | 'ltr' => RTL_LETTER.test(line) ? 'rtl' : 'ltr';
