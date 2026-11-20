// Voice pack catalog and manifest checks. Pure functions: everything read from
// the network is validated here before any file is written.

export const VOICES_INDEX_URL = 'https://raw.githubusercontent.com/SmaxsupeR/namu-voices/main/index.json';
/** Packs this app version can run. */
export const SUPPORTED_ENGINE = 'supertonic-3';
export const SUPPORTED_FORMAT = 1;

export interface CatalogPack {
  id: string;
  version: number;
  name: string;
  size: number;
  voices: string[];
  license: string;
  /** Base URL of the pack's files, pinned to one commit. */
  base: string;
}

export interface PackFile {
  path: string;
  sha256: string;
  size: number;
}

export interface Manifest {
  id: string;
  name: string;
  quantizedWeights: boolean;
  files: PackFile[];
}

/** Files without which the engine cannot start. */
export const REQUIRED_FILES = [
  'LICENSE',
  'onnx/tts.json',
  'onnx/unicode_indexer.json',
  'onnx/duration_predictor.onnx',
  'onnx/text_encoder.onnx',
  'onnx/vector_estimator.onnx',
  'onnx/vocoder.onnx',
];

const ID = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const SHA = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const SAFE_PATH = /^[A-Za-z0-9_-][A-Za-z0-9_.-]*(\/[A-Za-z0-9_-][A-Za-z0-9_.-]*)*$/;
/** Largest pack accepted, so a broken catalog cannot fill the phone. */
export const MAX_PACK_BYTES = 600 * 1024 * 1024;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const posInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0;

/** A relative path inside the pack: no "..", no absolute paths, no odd characters. */
export function isSafePath(p: unknown): p is string {
  return typeof p === 'string' && p.length <= 200 && SAFE_PATH.test(p) && !p.split('/').some((s) => s === '..' || s === '.');
}

export class PackError extends Error {
  constructor(public code: 'bad_catalog' | 'bad_manifest' | 'mismatch' | 'no_pack') {
    super(code);
  }
}

/** Reads index.json from namu-voices. Unknown or unsupported packs are skipped. */
export function parseCatalog(json: unknown): CatalogPack[] {
  if (!isObj(json) || json.format !== SUPPORTED_FORMAT || !Array.isArray(json.packs) || typeof json.baseUrl !== 'string') throw new PackError('bad_catalog');
  const baseUrl = json.baseUrl;
  if (!baseUrl.startsWith('https://') || !baseUrl.includes('{ref}')) throw new PackError('bad_catalog');
  const out: CatalogPack[] = [];
  for (const p of json.packs) {
    if (!isObj(p)) continue;
    if (p.engine !== SUPPORTED_ENGINE || p.language !== 'ko') continue;
    if (typeof p.id !== 'string' || !ID.test(p.id) || !posInt(p.version) || !posInt(p.size) || p.size > MAX_PACK_BYTES) continue;
    if (typeof p.ref !== 'string' || !COMMIT.test(p.ref) || !isSafePath(p.path)) continue;
    out.push({
      id: p.id,
      version: p.version,
      name: typeof p.name === 'string' ? p.name : p.id,
      size: p.size,
      voices: Array.isArray(p.voices) ? p.voices.filter((v): v is string => typeof v === 'string') : [],
      license: typeof p.license === 'string' ? p.license : '',
      base: `${baseUrl.replace('{ref}', p.ref)}${p.path}/`,
    });
  }
  return out;
}

/** Checks a pack manifest against the catalog entry it came from. */
export function parseManifest(json: unknown, expectedId: string): Manifest {
  if (!isObj(json) || !Array.isArray(json.files)) throw new PackError('bad_manifest');
  if (json.id !== expectedId) throw new PackError('mismatch');
  const files: PackFile[] = [];
  const seen = new Set<string>();
  for (const f of json.files) {
    if (!isObj(f) || !isSafePath(f.path) || typeof f.sha256 !== 'string' || !SHA.test(f.sha256) || !posInt(f.size)) throw new PackError('bad_manifest');
    if (seen.has(f.path)) throw new PackError('bad_manifest');
    seen.add(f.path);
    files.push({ path: f.path, sha256: f.sha256, size: f.size });
  }
  if (!REQUIRED_FILES.every((r) => seen.has(r))) throw new PackError('bad_manifest');
  if (!files.some((f) => f.path.startsWith('voice_styles/'))) throw new PackError('bad_manifest');
  if (files.reduce((n, f) => n + f.size, 0) > MAX_PACK_BYTES) throw new PackError('bad_manifest');
  return { id: expectedId, name: typeof json.name === 'string' ? json.name : expectedId, quantizedWeights: json.quantizedWeights === true, files };
}

export function packBytes(m: Manifest): number {
  return m.files.reduce((n, f) => n + f.size, 0);
}

/** Voices present in a manifest, e.g. ["F1", "M3"]. */
export function manifestVoices(m: Manifest): string[] {
  return m.files.map((f) => /^voice_styles\/([A-Za-z0-9_-]+)\.json$/.exec(f.path)?.[1]).filter((v): v is string => !!v);
}

/** Folder name of an installed pack version. */
export function packFolder(id: string, version: number): string {
  return `${id}-v${version}`;
}

/** Record of the active pack, written last during installation. */
export interface Installed {
  id: string;
  version: number;
  folder: string;
  name: string;
  quantizedWeights: boolean;
  voices: string[];
  bytes: number;
  installedAt: number;
}

export function parseInstalled(json: unknown): Installed | null {
  if (!isObj(json)) return null;
  const { id, version, folder } = json;
  if (typeof id !== 'string' || !ID.test(id) || !posInt(version) || folder !== packFolder(id, version)) return null;
  return {
    id,
    version,
    folder,
    name: typeof json.name === 'string' ? json.name : id,
    quantizedWeights: json.quantizedWeights === true,
    voices: Array.isArray(json.voices) ? json.voices.filter((v): v is string => typeof v === 'string') : [],
    bytes: typeof json.bytes === 'number' ? json.bytes : 0,
    installedAt: typeof json.installedAt === 'number' ? json.installedAt : 0,
  };
}

/** Whether a catalog pack is newer than the installed one. */
export function hasUpdate(installed: Installed | null, catalog: CatalogPack[]): CatalogPack | null {
  const c = catalog.find((p) => p.id === (installed?.id ?? p.id));
  if (!c) return null;
  if (!installed) return c;
  return c.version > installed.version ? c : null;
}
