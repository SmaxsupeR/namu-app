import { describe, expect, it } from 'vitest';
import { hasUpdate, isSafePath, manifestVoices, packFolder, parseCatalog, parseInstalled, parseManifest, REQUIRED_FILES } from './pack';

const REF = 'e7986d0e3cafec044c7bb176ffbc9b886e77673f';
const catalogJson = (over: Record<string, unknown> = {}) => ({
  format: 1,
  baseUrl: 'https://raw.githubusercontent.com/SmaxsupeR/namu-voices/{ref}/',
  packs: [{ id: 'int8w', version: 1, name: 'INT8', language: 'ko', engine: 'supertonic-3', path: 'packs/int8w', size: 113434490, voices: ['F1', 'M1'], license: 'BigScience OpenRAIL-M', ref: REF, ...over }],
});
const sha = 'a'.repeat(64);
export const manifestJson = (files = [...REQUIRED_FILES, 'voice_styles/F1.json', 'voice_styles/M2.json']) => ({
  id: 'int8w',
  name: 'INT8',
  quantizedWeights: true,
  files: files.map((path) => ({ path, sha256: sha, size: 10 })),
});

describe('voice pack catalog', () => {
  it('pins file URLs to the published commit', () => {
    const [p] = parseCatalog(catalogJson());
    expect(p.base).toBe(`https://raw.githubusercontent.com/SmaxsupeR/namu-voices/${REF}/packs/int8w/`);
    expect(p.voices).toEqual(['F1', 'M1']);
  });

  it('skips packs this version cannot run or that look wrong', () => {
    expect(parseCatalog(catalogJson({ engine: 'other' }))).toEqual([]);
    expect(parseCatalog(catalogJson({ language: 'ja' }))).toEqual([]);
    expect(parseCatalog(catalogJson({ ref: 'main' }))).toEqual([]);
    expect(parseCatalog(catalogJson({ path: '../evil' }))).toEqual([]);
    expect(parseCatalog(catalogJson({ size: 10 * 1024 * 1024 * 1024 }))).toEqual([]);
  });

  it('rejects a catalog in an unknown format or without https', () => {
    expect(() => parseCatalog({ ...catalogJson(), format: 2 })).toThrow('bad_catalog');
    expect(() => parseCatalog({ ...catalogJson(), baseUrl: 'http://x/{ref}/' })).toThrow('bad_catalog');
    expect(() => parseCatalog('nope')).toThrow('bad_catalog');
  });
});

describe('pack manifest', () => {
  it('accepts a complete manifest and lists its voices', () => {
    const m = parseManifest(manifestJson(), 'int8w');
    expect(m.quantizedWeights).toBe(true);
    expect(manifestVoices(m)).toEqual(['F1', 'M2']);
  });

  it('rejects paths that leave the pack folder', () => {
    for (const p of ['../x', '/etc/passwd', 'onnx/../../x', 'a//b', './a', 'a\\b', '']) expect(isSafePath(p)).toBe(false);
    expect(isSafePath('voice_styles/F1.json')).toBe(true);
    expect(() => parseManifest(manifestJson([...REQUIRED_FILES, 'voice_styles/F1.json', '../escape']), 'int8w')).toThrow('bad_manifest');
  });

  it('rejects manifests that are incomplete, duplicated or for another pack', () => {
    expect(() => parseManifest(manifestJson(REQUIRED_FILES.slice(1)), 'int8w')).toThrow('bad_manifest');
    expect(() => parseManifest(manifestJson([...REQUIRED_FILES]), 'int8w')).toThrow('bad_manifest');
    expect(() => parseManifest(manifestJson([...REQUIRED_FILES, 'voice_styles/F1.json', 'LICENSE']), 'int8w')).toThrow('bad_manifest');
    expect(() => parseManifest(manifestJson(), 'other')).toThrow('mismatch');
    const bad = manifestJson();
    bad.files[0].sha256 = 'xyz';
    expect(() => parseManifest(bad, 'int8w')).toThrow('bad_manifest');
  });
});

describe('installed record', () => {
  it('round-trips and refuses a folder that does not match', () => {
    const rec = { id: 'int8w', version: 1, folder: packFolder('int8w', 1), name: 'INT8', quantizedWeights: true, voices: ['F1'], bytes: 5, installedAt: 1 };
    expect(parseInstalled(rec)).toEqual(rec);
    expect(parseInstalled({ ...rec, folder: '../../x' })).toBeNull();
    expect(parseInstalled(null)).toBeNull();
  });

  it('offers an update only for a newer version', () => {
    const cat = parseCatalog(catalogJson({ version: 2 }));
    const rec = parseInstalled({ id: 'int8w', version: 1, folder: 'int8w-v1' });
    expect(hasUpdate(rec, cat)?.version).toBe(2);
    expect(hasUpdate(parseInstalled({ id: 'int8w', version: 2, folder: 'int8w-v2' }), cat)).toBeNull();
    expect(hasUpdate(null, cat)?.id).toBe('int8w');
  });
});
