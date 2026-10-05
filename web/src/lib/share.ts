export function whatsappLink(phone: string, text: string): string {
  const clean = phone.replace(/[^0-9]/g, '');
  const normalized = clean.startsWith('0') && !clean.startsWith('00') ? `263${clean.slice(1)}` : clean;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(text)}`;
}

export async function shareCaseUpdate(title: string, text: string, url: string): Promise<void> {
  if (navigator.share) {
    await navigator.share({ title, text, url });
    return;
  }
  await navigator.clipboard?.writeText(`${text} ${url}`).catch(() => undefined);
}

export function setAppBadge(count?: number): void {
  const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void> };
  if (typeof nav.setAppBadge === 'function') {
    nav.setAppBadge(count).catch(() => undefined);
  }
}
