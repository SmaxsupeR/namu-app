// Browser versions of the file helpers: the system share sheet where it can take files (iPhone:
// save to Files, send in a messenger), otherwise an ordinary download; a file input for opening.

export async function shareTextFile(name: string, content: string, mimeType: string): Promise<void> {
  const file = new File([content], name, { type: mimeType });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: name });
      return;
    } catch (e) {
      // The user closed the sheet: that is not an error. Anything else falls back to a download.
      if (e instanceof DOMException && e.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function pickTextFile(): Promise<{ name: string; text: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.csv,.tsv,.txt,application/json,text/plain,text/csv';
    input.onchange = async () => {
      const f = input.files?.[0];
      resolve(f ? { name: f.name, text: await f.text() } : null);
    };
    // Closing the picker without a file: resolve once focus comes back.
    window.addEventListener('focus', () => setTimeout(() => !input.files?.length && resolve(null), 1000), { once: true });
    input.click();
  });
}

export function stamp(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}
