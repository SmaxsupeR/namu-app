// Downloads, checks and installs the voice pack. Written against a small IO
// interface so the whole flow is tested in Node with a fake file system.
//
// Layout inside the app's private storage (left out of cloud backup):
//   voices/installed.json          the active pack; written last, read first
//   voices/<id>-v<version>/        an installed pack
//   voices/.partial-<id>-v<n>/     a download in progress (kept for resume)
import {
  packBytes,
  packFolder,
  parseCatalog,
  parseInstalled,
  parseManifest,
  manifestVoices,
  PackError,
  VOICES_INDEX_URL,
  type CatalogPack,
  type Installed,
  type Manifest,
} from './pack';

export interface PackIO {
  fileSize(file: string): Promise<number>;
  exists(file: string): Promise<boolean>;
  readText(file: string): Promise<string | null>;
  writeTextAtomic(file: string, text: string): Promise<unknown>;
  moveDir(from: string, to: string): Promise<unknown>;
  deleteTree(file: string): Promise<unknown>;
  listDir(dir: string): Promise<string[]>;
  sha256(file: string): Promise<string>;
  freeSpaceMb(dir: string): Promise<number>;
  /** Resumable download; `onBytes` gets the bytes of this file on disk. */
  download(url: string, dest: string, size: number, onBytes: (bytes: number) => void): Promise<number>;
  cancelDownload(): void;
}

export type FetchJson = (url: string) => Promise<unknown>;

export interface DownloadProgress {
  done: number;
  total: number;
  /** Bytes still to fetch when the download started (files already complete are skipped). */
  toFetch: number;
  file: string;
  phase: 'download' | 'verify' | 'install';
}

export type PackState = { status: 'none' } | { status: 'ready'; pack: Installed; dir: string } | { status: 'damaged'; pack: Installed; missing: string[] };

export type InstallErrorCode = 'no_space' | 'corrupt' | 'cancelled' | 'network' | 'bad_catalog' | 'bad_manifest' | 'mismatch' | 'no_pack';

export class InstallError extends Error {
  constructor(public code: InstallErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
  }
}

/** Space kept free on top of the pack itself. */
export const SPARE_MB = 50;

export function createPackManager(io: PackIO, root: string, fetchJson: FetchJson) {
  const join = (...parts: string[]) => parts.join('/');
  const installedFile = join(root, 'installed.json');
  let stopping = false;

  async function readManifest(dir: string, id: string): Promise<Manifest | null> {
    try {
      const text = await io.readText(join(dir, 'manifest.json'));
      return text ? parseManifest(JSON.parse(text), id) : null;
    } catch {
      return null;
    }
  }

  /** The active pack. Only sizes are checked here, so this is fast enough for app start. */
  async function state(): Promise<PackState> {
    let pack: Installed | null = null;
    try {
      const text = await io.readText(installedFile);
      pack = text ? parseInstalled(JSON.parse(text)) : null;
    } catch {
      pack = null;
    }
    if (!pack) return { status: 'none' };
    const dir = join(root, pack.folder);
    const manifest = await readManifest(dir, pack.id);
    if (!manifest) return { status: 'damaged', pack, missing: ['manifest.json'] };
    const missing: string[] = [];
    for (const f of manifest.files) if ((await io.fileSize(join(dir, f.path))) !== f.size) missing.push(f.path);
    return missing.length ? { status: 'damaged', pack, missing } : { status: 'ready', pack, dir };
  }

  async function catalog(): Promise<CatalogPack[]> {
    try {
      return parseCatalog(await fetchJson(VOICES_INDEX_URL));
    } catch (e) {
      throw e instanceof PackError ? new InstallError(e.code) : new InstallError('network');
    }
  }

  /** Full check of the active pack by SHA-256. Returns damaged files. */
  async function verify(): Promise<string[]> {
    const s = await state();
    if (s.status === 'none') return [];
    if (s.status === 'damaged') return s.missing;
    const manifest = await readManifest(s.dir, s.pack.id);
    if (!manifest) return ['manifest.json'];
    const bad: string[] = [];
    for (const f of manifest.files) if ((await io.sha256(join(s.dir, f.path))) !== f.sha256) bad.push(f.path);
    return bad;
  }

  async function fileOk(path: string, size: number, sha: string): Promise<boolean> {
    return (await io.fileSize(path)) === size && (await io.sha256(path)) === sha;
  }

  /**
   * Downloads a catalog pack and makes it active. Only call after the user agreed.
   * Interrupted downloads continue where they stopped; the old pack stays usable
   * until the new one is fully checked.
   */
  async function install(c: CatalogPack, onProgress: (p: DownloadProgress) => void = () => {}): Promise<Installed> {
    stopping = false;
    let manifest: Manifest;
    try {
      manifest = parseManifest(await fetchJson(`${c.base}manifest.json`), c.id);
    } catch (e) {
      throw e instanceof PackError ? new InstallError(e.code) : new InstallError('network');
    }
    const folder = packFolder(c.id, c.version);
    const partial = join(root, `.partial-${folder}`);
    const total = packBytes(manifest);

    // What is already on disk from an earlier attempt.
    let toFetch = 0;
    const sizes = new Map<string, number>();
    for (const f of manifest.files) {
      const have = Math.max(0, await io.fileSize(join(partial, f.path)));
      sizes.set(f.path, have > f.size ? 0 : have);
      toFetch += f.size - (have > f.size ? 0 : have);
    }
    const freeMb = await io.freeSpaceMb(root);
    if (freeMb * 1024 * 1024 < toFetch + SPARE_MB * 1024 * 1024) throw new InstallError('no_space', `${Math.round(freeMb)} MB free`);

    const doneBefore = () => [...sizes.values()].reduce((a, b) => a + b, 0);
    for (const f of manifest.files) {
      if (stopping) throw new InstallError('cancelled');
      const dest = join(partial, f.path);
      onProgress({ done: doneBefore(), total, toFetch, file: f.path, phase: 'verify' });
      if (sizes.get(f.path) === f.size && (await io.sha256(dest)) === f.sha256) continue;
      let ok = false;
      for (let attempt = 0; attempt < 2 && !ok; attempt++) {
        if (attempt > 0) {
          // A complete file with a wrong hash: start this file again from zero.
          await io.deleteTree(dest);
          sizes.set(f.path, 0);
        }
        try {
          await io.download(`${c.base}${f.path}`, dest, f.size, (bytes) => {
            sizes.set(f.path, Math.min(bytes, f.size));
            onProgress({ done: doneBefore(), total, toFetch, file: f.path, phase: 'download' });
          });
        } catch (e) {
          if (stopping || (e as { code?: string }).code === 'E_CANCELLED') throw new InstallError('cancelled');
          throw new InstallError('network', (e as { code?: string }).code);
        }
        onProgress({ done: doneBefore(), total, toFetch, file: f.path, phase: 'verify' });
        ok = await fileOk(dest, f.size, f.sha256);
      }
      if (!ok) throw new InstallError('corrupt', f.path);
    }
    if (stopping) throw new InstallError('cancelled');

    onProgress({ done: total, total, toFetch, file: '', phase: 'install' });
    await io.writeTextAtomic(join(partial, 'manifest.json'), JSON.stringify({ id: manifest.id, name: manifest.name, quantizedWeights: manifest.quantizedWeights, files: manifest.files }));
    const finalDir = join(root, folder);
    const previous = await state();
    // The same version left over from a damaged install is replaced.
    if (await io.exists(finalDir)) {
      if (previous.status !== 'none' && previous.pack.folder === folder) await io.deleteTree(installedFile);
      await io.deleteTree(finalDir);
    }
    await io.moveDir(partial, finalDir);
    const record: Installed = {
      id: c.id,
      version: c.version,
      folder,
      name: c.name,
      quantizedWeights: manifest.quantizedWeights,
      voices: manifestVoices(manifest),
      bytes: total,
      installedAt: Date.now(),
    };
    // The switch to the new pack is this one atomic write.
    await io.writeTextAtomic(installedFile, JSON.stringify(record));
    await cleanup();
    return record;
  }

  /** Removes every folder except the active pack and, if given, one resumable download. */
  async function cleanup(keepPartial?: string): Promise<void> {
    const s = await state();
    const active = s.status === 'none' ? null : s.pack.folder;
    for (const name of await io.listDir(root)) {
      if (name === 'installed.json' || name === active) continue;
      if (keepPartial && name === `.partial-${keepPartial}`) continue;
      await io.deleteTree(join(root, name));
    }
  }

  function cancel() {
    stopping = true;
    io.cancelDownload();
  }

  /** Deletes the pack: first the record (so the app stops using it), then the files. */
  async function remove(): Promise<void> {
    const s = await state();
    await io.deleteTree(installedFile);
    if (s.status !== 'none') await io.deleteTree(join(root, s.pack.folder));
    for (const name of await io.listDir(root)) if (name.startsWith('.partial-')) await io.deleteTree(join(root, name));
  }

  return { state, catalog, install, verify, cancel, remove, cleanup, root };
}

export type PackManager = ReturnType<typeof createPackManager>;
