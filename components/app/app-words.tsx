'use client';
import { Children, cloneElement, createContext, isValidElement, useContext, useEffect, useState, type ReactNode } from 'react';
import { isEnglish, languageFileUrl, readTranslationCache, replaceTranslation, translationSource, TRANSLATION_ATTRIBUTES } from '../../lib/i18n';
import { validatedAppLanguage } from '../../lib/head-scripts';
import { languageCookie } from '../../lib/language-cookie';
export const LANGUAGE_EVENT = 'groundwork-language-changed';
type Words = { language: string; words: Record<string,string> | null };
const Context = createContext<Words>({language: '', words: null});
export const useAppWords = () => useContext(Context);
export function AppWords({language, words, children}: Words & {children: ReactNode}) {
  const [current, setCurrent] = useState<Words>({language, words});
  useEffect(() => {
    let active = true;
    let generation = 0;
    const change = async (event: Event) => {
      const next = validatedAppLanguage((event as CustomEvent).detail);
      if (!next) return;
      const run = ++generation;
      document.cookie = languageCookie(next);
      setCurrent({language: next, words: isEnglish(next) ? {} : null});
      if (isEnglish(next)) return;
      try {
        const response = await fetch(languageFileUrl(next));
        if (!response.ok) throw new Error();
        const words = readTranslationCache(await response.text(), next);
        if (active && run === generation) setCurrent({language: next, words});
      } catch {
        // A failed dictionary is settled too. Reveal source copy instead of leaving it pending.
        if (active && run === generation) setCurrent({language: next, words: {}});
      }
    };
    window.addEventListener(LANGUAGE_EVENT, change);
    return () => { active = false; window.removeEventListener(LANGUAGE_EVENT, change); };
  }, []);
  return <Context.Provider value={current}>{children}</Context.Provider>;
}
/** Translate React's text before SSR and hydration. Never mutate a React owned translated node. */
export function Translated({children}: {children: ReactNode}) {
  const {language, words} = useAppWords();
  if (!language || isEnglish(language)) return children;
  function visit(node: ReactNode): ReactNode {
    if (typeof node === 'string') {
      if (!translationSource(node)) return node;
      const text = words ? replaceTranslation(node, words) : node;
      // Equality can mean a missing entry, an identifier or an intentional identity translation.
      // Only an outstanding dictionary request is pending. React owns these skipped nodes.
      const pending = words === null && /[A-Za-z]/.test(node);
      return <span data-no-translate="" data-translated-copy="" style={pending ? {visibility:'hidden'} : undefined} aria-busy={pending || undefined}>{pending ? '…' : text}</span>;
    }
    if (!isValidElement<Record<string,unknown>>(node)) return node;
    const props = node.props;
    if (props['data-no-translate'] !== undefined || ['script','style','textarea','code','pre'].includes(String(node.type))) return node;
    const next: Record<string,unknown> = {};
    if (node.type === 'option') {
      const source = Children.toArray(props.children as ReactNode).join('');
      const text = words ? replaceTranslation(source, words) : source;
      return cloneElement(node, {'data-no-translate':'', children:words === null && /[A-Za-z]/.test(source) ? '…' : text});
    }
    for (const attr of TRANSLATION_ATTRIBUTES) if (typeof props[attr] === 'string') { const text = words ? replaceTranslation(props[attr], words) : props[attr]; next[attr] = words === null && /[A-Za-z]/.test(text) ? '' : text; }
    if (props.children !== undefined) next.children = Children.map(props.children as ReactNode, visit);
    return cloneElement(node, next);
  }
  return <>{Children.map(children, visit)}</>;
}
