import { useEffect } from 'react';

const SITE = 'https://auto.radbitstudios.co.zw';

export default function Seo({ title, description, path = '/', jsonLd }: { title: string; description: string; path?: string; jsonLd?: object }) {
  useEffect(() => {
    document.title = title;
    const setMeta = (key: string, value: string, attr: 'name' | 'property' = 'name') => {
      let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.content = value;
    };
    setMeta('description', description);
    setMeta('og:title', title, 'property');
    setMeta('og:description', description, 'property');
    setMeta('og:url', `${SITE}${path}`, 'property');
    setMeta('twitter:title', title);
    setMeta('twitter:description', description);
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = `${SITE}${path}`;
    let script = document.head.querySelector<HTMLScriptElement>('script[data-seo="ld+json"]');
    if (jsonLd) {
      if (!script) {
        script = document.createElement('script');
        script.type = 'application/ld+json';
        script.dataset.seo = 'ld+json';
        document.head.appendChild(script);
      }
      script.textContent = JSON.stringify(jsonLd);
    } else if (script) {
      script.remove();
    }
  }, [title, description, path, jsonLd]);
  return null;
}
