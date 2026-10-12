/** A short device line for feedback, like "Android phone · Chrome 141 · 390x844". */
export function deviceSummary(ua = navigator.userAgent, w = window.innerWidth, h = window.innerHeight) {
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPhone' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Other';
  const kind = /Mobi|iPhone|Android.+Mobile/.test(ua) ? 'phone' : /iPad|Tablet|Android/.test(ua) ? 'tablet' : 'computer';
  const browser = ua.match(/(Edg|OPR|SamsungBrowser|CriOS|FxiOS|Firefox|Chrome|Version)\/(\d+)/);
  const name = browser ? ({ Edg: 'Edge', OPR: 'Opera', SamsungBrowser: 'Samsung Internet', CriOS: 'Chrome', FxiOS: 'Firefox', Version: 'Safari' } as Record<string, string>)[browser[1]] ?? browser[1] : 'Browser';
  return `${os === 'iPhone' ? os : `${os} ${kind}`} · ${name}${browser ? ' ' + browser[2] : ''} · ${w}x${h}`;
}
export const LAST_PAGE_KEY = 'groundwork-last-page';
