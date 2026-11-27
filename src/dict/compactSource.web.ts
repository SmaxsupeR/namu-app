// Web: the dictionary is served gzip-compressed (10 MB instead of 29 MB; hosting limits single
// files to 25 MB) and unpacked in the browser. Called only when the database is not there yet.
// assets/dict/krdict.db.gz is made by `npm run build:web` (scripts/gzip-dict.mjs).
import { Asset } from 'expo-asset';

export async function compactAssetId(): Promise<number | string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const asset = Asset.fromModule(require('../../assets/dict/krdict.db.gz'));
  const res = await fetch(asset.uri);
  if (!res.ok || !res.body) throw new Error(`dictionary download failed: ${res.status}`);
  const plain = res.body.pipeThrough(new DecompressionStream('gzip'));
  const blob = await new Response(plain).blob();
  return URL.createObjectURL(blob);
}
