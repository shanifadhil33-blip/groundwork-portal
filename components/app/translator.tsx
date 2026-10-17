'use client';
import { useEffect, useState } from 'react';
import { DEFAULT_LANGUAGE, LANGUAGES, isRtl } from '../../lib/languages';
import { isEnglish, readTranslationCache, replaceTranslation, translationPieces, translationSource, TRANSLATION_ATTRIBUTES, TRANSLATION_SKIP } from '../../lib/i18n';
import { useResource } from './resource';
import { LANG_HINT_KEY } from '../../lib/head-scripts';

const LANGUAGE_EVENT = 'groundwork-language-changed';
export function changeAppLanguage(lang: string) {
  window.dispatchEvent(new CustomEvent(LANGUAGE_EVENT, { detail: lang }));
}
type Slot = { node: Text | Element; attribute?: string; source: string; applied: string };
const read = (slot: Slot) => slot.attribute ? (slot.node as Element).getAttribute(slot.attribute) ?? '' : slot.node.nodeValue ?? '';
const write = (slot: Slot, value: string) => {
  if (slot.attribute) (slot.node as Element).setAttribute(slot.attribute, value);
  else slot.node.nodeValue = value;
  slot.applied = value;
};

export function Translator() {
  const preferences = useResource<{language?: string | null}>('/api/me/preferences');
  const [chosen, setChosen] = useState<string | null>(null);
  const language = chosen ?? preferences.data?.language ?? DEFAULT_LANGUAGE;
  useEffect(() => {
    const listener = (event: Event) => {
      const lang: unknown = (event as CustomEvent).detail;
      if (typeof lang === 'string' && LANGUAGES.some(l => l.code === lang)) setChosen(lang);
    };
    window.addEventListener(LANGUAGE_EVENT, listener);
    return () => window.removeEventListener(LANGUAGE_EVENT, listener);
  }, []);
  useEffect(() => {
    const root = document.documentElement;
    const previousLang = root.lang, previousDir = root.dir;
    root.lang = language;
    root.dir = isRtl(language) ? 'rtl' : 'ltr';
    const quiet = (on: boolean) => { if (on) root.dataset.translating = ''; else delete root.dataset.translating; };
    let quietTimer: ReturnType<typeof setTimeout> | undefined;
    if (isEnglish(language)) { quiet(false); return () => { root.lang = previousLang; root.dir = previousDir; }; }

    const key = `groundwork-ui-translations:v1:${language}`;
    let cache: Record<string, string> = Object.create(null);
    try { cache = readTranslationCache(localStorage.getItem(key)); } catch { /* Storage may be disabled. */ }
    const textSlots = new Map<Text, Slot>(), attributeSlots = new Map<Element, Map<string, Slot>>();
    const attempted = new Set<string>();
    const pending = new Set<string>();
    const abort = new AbortController();
    let stopped = false, running = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const options: MutationObserverInit = { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: [...TRANSLATION_ATTRIBUTES, 'data-no-translate', 'contenteditable'] };
    const observer = new MutationObserver(() => schedule());
    const skipped = (node: Text | Element, attribute = false) => !!(node instanceof Element ? node : node.parentElement)?.closest(attribute ? TRANSLATION_SKIP.replace('textarea,', '') : TRANSLATION_SKIP);
    function update(slot: Slot) {
      const current = read(slot);
      // React may reuse a node for a new source. Never restore its old content.
      if (current !== slot.applied) slot.source = current;
      if (skipped(slot.node, !!slot.attribute)) {
        if (current === slot.applied && current !== slot.source) write(slot, slot.source);
        return;
      }
      const translated = replaceTranslation(slot.source, cache);
      if (current !== translated) write(slot, translated);
      else slot.applied = current;
      for (const piece of translationPieces(slot.source)) {
        const source = translationSource(piece);
        if (source && !Object.hasOwn(cache, source) && !attempted.has(source)) pending.add(source);
      }
    }
    function scan() {
      if (stopped) return;
      // A complete scan also covers mutations queued before our own writes.
      observer.disconnect();
      for (const [node] of textSlots) if (!node.isConnected) textSlots.delete(node);
      for (const [node] of attributeSlots) if (!node.isConnected) attributeSlots.delete(node);
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        if (node instanceof Text) {
          let slot = textSlots.get(node);
          if (!slot && !skipped(node)) {
            slot = { node, source: node.data, applied: node.data };
            textSlots.set(node, slot);
          }
          if (slot) update(slot);
        } else if (node instanceof Element) {
          for (const attribute of TRANSLATION_ATTRIBUTES) {
            const value = node.getAttribute(attribute);
            const slots = attributeSlots.get(node) ?? new Map<string, Slot>();
            if (value === null) { slots.delete(attribute); continue; }
            let slot = slots.get(attribute);
            if (!slot && !skipped(node, true)) {
              slot = { node, attribute, source: value, applied: value };
              slots.set(attribute, slot); attributeSlots.set(node, slots);
            }
            if (slot) update(slot);
          }
        }
      }
      observer.observe(document.body, options);
      // Quiet loading: hide the screen (never show English) while a batch of its words is still on the way, at most 3 seconds.
      if (pending.size >= 3) { quiet(true); clearTimeout(quietTimer); quietTimer = setTimeout(() => quiet(false), 3000); }
      else if (!running || !pending.size) { quiet(false); }
      void flush();
    }
    function schedule() {
      clearTimeout(timer);
      timer = setTimeout(scan, 120);
    }
    async function flush() {
      if (running || stopped || !pending.size) return;
      running = true;
      try {
        while (pending.size && !stopped) {
          const strings = [...pending].slice(0, 200);
          for (const source of strings) { pending.delete(source); attempted.add(source); }
          try {
            // Saved words first (fast, no AI), then only the new ones, so a new word never holds back the rest of the screen.
            for (const cachedOnly of [true, false]) {
              const ask = cachedOnly ? strings : strings.filter(x => !Object.hasOwn(cache, x));
              if (!ask.length) break;
              const response = await fetch('/api/i18n/translate', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lang: language, strings: ask, ...(cachedOnly ? { cached_only: true } : {}) }), signal: abort.signal,
              });
              if (!response.ok) continue;
              const result = await response.json();
              if (stopped) return;
              const received = readTranslationCache(JSON.stringify(result.translations));
              for (const source of ask) if (Object.hasOwn(received, source)) cache[source] = received[source];
              try { localStorage.setItem(key, JSON.stringify(Object.fromEntries(Object.entries(cache).slice(-5000)))); } catch { /* Keep the in memory cache. */ }
              scan();
            }
          } catch { /* Keep English when offline or when translation is unavailable. */ }
        }
      } finally { running = false; quiet(false); }
    }
    scan();
    return () => {
      stopped = true; abort.abort(); observer.disconnect(); clearTimeout(timer); clearTimeout(quietTimer); quiet(false);
      for (const slot of [...textSlots.values(), ...[...attributeSlots.values()].flatMap(slots => [...slots.values()])]) {
        if (slot.node.isConnected && read(slot) === slot.applied) write(slot, slot.source);
      }
      root.lang = previousLang; root.dir = previousDir;
    };
  }, [language]);
  // Remember the language for the pre-paint hint once it is known (never guess before preferences load).
  useEffect(() => { if (preferences.data || chosen) { try { localStorage.setItem(LANG_HINT_KEY, language); } catch { /* Storage may be disabled. */ } } }, [language, preferences.data, chosen]);
  return null;
}
