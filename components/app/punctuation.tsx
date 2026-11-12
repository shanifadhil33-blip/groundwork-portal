'use client';
import { useAppWords } from './app-words';
/** Commas written between two pieces of a sentence follow the screen's script: Arabic, Persian, Urdu and Pashto use ، */
const ARABIC_SCRIPT = /^(ar|fa|ur|ps)\b/;
export function useComma() {
  const { language } = useAppWords();
  return ARABIC_SCRIPT.test(language ?? '') ? '، ' : ', ';
}
export function Comma() { return <span data-no-translate>{useComma()}</span>; }
