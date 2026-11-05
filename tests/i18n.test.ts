import { describe, expect, it } from 'vitest';
import { isEnglish, parseTranslations, protectedTokens, readTranslationCache, replaceTranslation, translationPieces, translationRequest, translationSource } from '../lib/i18n';
import { DEFAULT_LANGUAGE, LANGUAGES, isRtl } from '../lib/languages';

describe('translation requests', () => {
  it('keeps the default and all required languages with their existing codes', () => {
    expect(DEFAULT_LANGUAGE).toBe('en-IN');
    const required = ['en-IN', 'ar-AE', 'ne', 'hi', 'zh-CN', 'bn', 'ur', 'fa-IR', 'fa-AF', 'ps'];
    for (const code of required) expect(LANGUAGES.some(l => l.code === code)).toBe(true);
    for (const code of ['ar-AE', 'ur', 'fa-IR', 'fa-AF', 'ps']) expect(isRtl(code)).toBe(true);
    for (const code of ['en-IN', 'ne', 'hi', 'zh-CN', 'bn']) expect(isRtl(code)).toBe(false);
  });
  it('accepts existing language codes and English variants', () => {
    expect(isEnglish('en-IN')).toBe(true);
    expect(isEnglish('en-US')).toBe(true);
    expect(isEnglish('ne')).toBe(false);
    expect(translationRequest.parse({lang:'fa-AF',strings:['Save']})).toEqual({lang:'fa-AF',strings:['Save']});
  });
  it('rejects unsupported languages, wrong types and oversized batches or strings', () => {
    for (const value of [{lang:'xx',strings:[]},{lang:'ne',strings:[5]},{lang:'ne',strings:['a'.repeat(501)]},{lang:'ne',strings:Array(201).fill('Save')}]) {
      expect(translationRequest.safeParse(value).success).toBe(false);
    }
    expect(translationRequest.safeParse({lang:'ne',strings:Array(200).fill('a'.repeat(500))}).success).toBe(true);
  });
});
describe('UI string handling', () => {
  it('leaves whitespace, numbers and punctuation alone', () => {
    expect(translationSource('  Save  ')).toBe('Save');
    expect(translationSource('123 +')).toBeNull();
    expect(replaceTranslation('  Save\n', {Save:'सुरक्षित गर्नुहोस्'})).toBe('  सुरक्षित गर्नुहोस्\n');
    expect(replaceTranslation('Unknown', {})).toBe('Unknown');
  });
  it('splits long replies without losing any characters', () => {
    for (const value of [' x '.repeat(600), 'a'.repeat(1100), 'Hello\n'.repeat(300), '  Save  ']) {
      const pieces = translationPieces(value);
      expect(pieces.join('')).toBe(value);
      expect(pieces.filter(p => p.trim()).every(p => p.length <= 500)).toBe(true);
    }
  });
  it('uses literal replacement and handles special record keys safely', () => {
    expect(replaceTranslation('Save', {Save:'$&'})).toBe('$&');
    expect(replaceTranslation('constructor', {})).toBe('constructor');
    const cache = readTranslationCache('{"__proto__":"ترجمة"}');
    expect(Object.getPrototypeOf(cache)).toBeNull();
    expect(cache.__proto__).toBe('ترجمة');
  });
  it('keeps data and Unicode intact at chunk boundaries', () => {
    for (const token of ['{{customer_name}}', 'WO-123456', 'ali@example.com', '123456789']) {
      const text = 'a'.repeat(494) + ' ' + token + ' remaining text';
      const pieces = translationPieces(text);
      expect(pieces.join('')).toBe(text);
      expect(pieces.some(p => p.includes(token))).toBe(true);
      expect(pieces.every(p => p.length <= 500)).toBe(true);
    }
    const text = 'a'.repeat(499) + '😀' + 'b'.repeat(500);
    const pieces = translationPieces(text);
    expect(pieces.join('')).toBe(text);
    expect(pieces.every(p => !/[\uD800-\uDBFF]$/.test(p))).toBe(true);
    const oversizedPlaceholder = '{{' + 'name'.repeat(150) + '}}';
    expect(replaceTranslation(oversizedPlaceholder, {})).toBe(oversizedPlaceholder);
    expect(translationPieces(oversizedPlaceholder).map(translationSource)).toEqual([null]);
  });
});
describe('AI answers and local cache', () => {
  const source = 'Send WO-12 to ali@example.com at 10:30 for {name} and {{count}}';
  it('preserves identifiers, numbers, emails and placeholders including counts', () => {
    const translated = 'أرسل WO-12 إلى ali@example.com الساعة 10:30 لـ {name} و {{count}}';
    expect(protectedTokens(source)).toContain('WO-12');
    expect(parseTranslations(JSON.stringify({[source]:translated,extra:'ignore'}),[source])).toEqual({[source]:translated});
    for (const changed of [translated.replace('12','13'),translated.replace('{name}','اسم'),translated+' 5',translated.replace('ali@','omar@')]) {
      expect(parseTranslations(JSON.stringify({[source]:changed}),[source])).toBeNull();
    }
  });
  it('accepts valid partial answers and fenced JSON but rejects malformed results and prose dashes', () => {
    expect(parseTranslations('```json\n{"Save":"حفظ"}\n```',['Save','Cancel'])).toEqual({Save:'حفظ'});
    for (const answer of ['invalid','[]','null','{"Save":5}','{"Save":""}','{"Save":"حفظ — الآن"}','{"Save":"حفظ ‐ الآن"}']) expect(parseTranslations(answer,['Save'])).toBeNull();
    expect(readTranslationCache('{"Save":"حفظ","Cancel":5}')).toEqual({Save:'حفظ'});
    expect(readTranslationCache('broken')).toEqual({});
  });
});
