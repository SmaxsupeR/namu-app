// The optional full dictionary (every example, related words, inflected forms),
// downloaded from the namu-voices catalog after the user asks for it.
// Layout in app storage: dict/installed.json (written last), dict/<id>-v<n>.db,
// and dict/<id>-v<n>.db.gz while downloading (kept for resume, deleted after).

export const CATALOG_URL = 'https://raw.githubusercontent.com/SmaxsupeR/namu-voices/main/index.json';
export const SUPPORTED_DICT_FORMAT = 2;
const MAX_BYTES = 400 * 1024 * 1024;

export interface DictOffer {
  id: string;
  version: number;
  name: string;
  url: string;
  size: number;
  sha256: string;
  unpackedSize: number;
  unpackedSha256: string;
  license: string;
}

export interface DictInstalled {
  id: string;
  version: number;
  file: string;
  bytes: number;
}

export interface DictIO {
  fileSize(file: string): Promise<number>;
  readText(file: string): Promise<string | null>;
  writeTextAtomic(file: string, text: string): Promise<unknown>;
  deleteTree(file: string): Promise<unknown>;
  listDir(dir: string): Promise<string[]>;
  sha256(file: string): Promise<string>;
  freeSpaceMb(dir: string): Promise<number>;
  gunzip(from: string, to: string): Promise<number>;
  download(url: string, dest: string, size: number, onBytes: (bytes: number) => void): Promise<number>;
  cancelDownload(): void;
}

export type DictErrorCode = 'no_space' | 'corrupt' | 'cancelled' | 'network' | 'bad_catalog' | 'no_pack';
export class DictError extends Error {
  constructor(public code: DictErrorCode) {
    super(code);
  }
}

const ID = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const SHA = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const NAME = /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,80}$/;
const PATH = /^[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)*$/;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const posInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= MAX_BYTES;

/** Dictionaries listed in the catalog that this app can open. */
export function parseDictCatalog(json: unknown): DictOffer[] {
  if (!isObj(json) || typeof json.baseUrl !== 'string' || !json.baseUrl.startsWith('https://') || !json.baseUrl.includes('{ref}')) throw new DictError('bad_catalog');
  const base = json.baseUrl;
  const list = Array.isArray(json.dictionaries) ? json.dictionaries : [];
  const out: DictOffer[] = [];
  for (const d of list) {
    if (!isObj(d) || d.format !== SUPPORTED_DICT_FORMAT || d.language !== 'ko-ru') continue;
    if (typeof d.id !== 'string' || !ID.test(d.id) || !Number.isInteger(d.version) || (d.version as number) < 1) continue;
    if (typeof d.ref !== 'string' || !COMMIT.test(d.ref) || typeof d.path !== 'string' || !PATH.test(d.path) || typeof d.file !== 'string' || !NAME.test(d.file)) continue;
    if (!posInt(d.size) || !posInt(d.unpackedSize) || typeof d.sha256 !== 'string' || !SHA.test(d.sha256) || typeof d.unpackedSha256 !== 'string' || !SHA.test(d.unpackedSha256)) continue;
    out.push({
      id: d.id,
      version: d.version as number,
      name: typeof d.name === 'string' ? d.name : d.id,
      url: `${base.replace('{ref}', d.ref)}${d.path}/${d.file}`,
      size: d.size,
      sha256: d.sha256,
      unpackedSize: d.unpackedSize,
      unpackedSha256: d.unpackedSha256,
      license: typeof d.license === 'string' ? d.license : '',
    });
  }
  return out;
}

export function createDictPack(io: DictIO, root: string, fetchJson: (url: string) => Promise<unknown>) {
  const record = `${root}/installed.json`;
  let stopping = false;

  /** The installed full dictionary, if its file is complete. */
  async function installed(): Promise<DictInstalled | null> {
    try {
      const text = await io.readText(record);
      if (!text) return null;
      const j = JSON.parse(text) as Record<string, unknown>;
      if (typeof j.id !== 'string' || !ID.test(j.id) || !Number.isInteger(j.version)) return null;
      const file = `${j.id}-v${j.version}.db`;
      const bytes = await io.fileSize(`${root}/${file}`);
      if (bytes <= 0 || bytes !== j.bytes) return null;
      return { id: j.id, version: j.version as number, file: `${root}/${file}`, bytes };
    } catch {
      return null;
    }
  }

  async function offer(): Promise<DictOffer | null> {
    let json: unknown;
    try {
      json = await fetchJson(CATALOG_URL);
    } catch {
      throw new DictError('network');
    }
    return parseDictCatalog(json)[0] ?? null;
  }

  /** Downloads, checks, unpacks and activates. Call only after the user agreed. */
  async function install(o: DictOffer, onProgress: (done: number, total: number, phase: 'download' | 'unpack') => void = () => {}): Promise<DictInstalled> {
    stopping = false;
    const name = `${o.id}-v${o.version}.db`;
    const gz = `${root}/${name}.gz`;
    const db = `${root}/${name}`;
    const have = Math.max(0, await io.fileSize(gz));
    const need = o.size - Math.min(have, o.size) + o.unpackedSize + 30 * 1024 * 1024;
    if ((await io.freeSpaceMb(root)) * 1024 * 1024 < need) throw new DictError('no_space');
    for (let attempt = 0; ; attempt++) {
      try {
        await io.download(o.url, gz, o.size, (b) => onProgress(Math.min(b, o.size), o.size, 'download'));
      } catch (e) {
        if (stopping || (e as { code?: string }).code === 'E_CANCELLED') throw new DictError('cancelled');
        throw new DictError('network');
      }
      if ((await io.fileSize(gz)) === o.size && (await io.sha256(gz)) === o.sha256) break;
      await io.deleteTree(gz);
      if (attempt >= 1) throw new DictError('corrupt');
    }
    if (stopping) throw new DictError('cancelled');
    onProgress(o.size, o.size, 'unpack');
    await io.gunzip(gz, db);
    if ((await io.fileSize(db)) !== o.unpackedSize || (await io.sha256(db)) !== o.unpackedSha256) {
      await io.deleteTree(db);
      await io.deleteTree(gz);
      throw new DictError('corrupt');
    }
    await io.writeTextAtomic(record, JSON.stringify({ id: o.id, version: o.version, bytes: o.unpackedSize }));
    await io.deleteTree(gz);
    // Older versions go once the new one is active.
    for (const f of await io.listDir(root)) if (f !== 'installed.json' && f !== name && !f.endsWith('.gz')) await io.deleteTree(`${root}/${f}`);
    return { id: o.id, version: o.version, file: db, bytes: o.unpackedSize };
  }

  function cancel() {
    stopping = true;
    io.cancelDownload();
  }

  async function remove(): Promise<void> {
    await io.deleteTree(record);
    for (const f of await io.listDir(root)) await io.deleteTree(`${root}/${f}`);
  }

  return { installed, offer, install, cancel, remove };
}

export type DictPack = ReturnType<typeof createDictPack>;
