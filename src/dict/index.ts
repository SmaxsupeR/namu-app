// Opens the dictionary: the full edition when it has been downloaded, otherwise
// the compact one bundled with the app (copied to app storage on first use; a
// new compact version gets a new file name).
import * as SQLite from 'expo-sqlite';
import { NamuTts } from '../../modules/namu-tts';
import type { Db } from '../db/schema';
import { createDictPack, type DictPack } from './fullPack';

const COMPACT = 'krdict-2.db';
const OLD_COMPACT = ['krdict-1.db'];

export type Edition = 'compact' | 'full';

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Download of the full edition; null where it is not supported (web). */
export const dictPack: DictPack | null = NamuTts
  ? createDictPack(
      {
        fileSize: NamuTts.fileSize,
        readText: NamuTts.readText,
        writeTextAtomic: NamuTts.writeTextAtomic,
        deleteTree: NamuTts.deleteTree,
        listDir: NamuTts.listDir,
        sha256: NamuTts.sha256,
        freeSpaceMb: NamuTts.freeSpaceMb,
        gunzip: NamuTts.gunzip,
        cancelDownload: () => NamuTts!.cancelDownload(),
        async download(url, dest, size, onBytes) {
          const sub = NamuTts!.addListener('onDownloadProgress', (e) => {
            if (e.dest === dest) onBytes(e.bytes);
          });
          try {
            return await NamuTts!.download(url, dest, size);
          } finally {
            sub.remove();
          }
        },
      },
      `${NamuTts.storageDir()}/dict`,
      fetchJson,
    )
  : null;

let opening: Promise<{ db: SQLite.SQLiteDatabase; edition: Edition }> | null = null;

async function open(): Promise<{ db: SQLite.SQLiteDatabase; edition: Edition }> {
  const full = await dictPack?.installed().catch(() => null);
  if (full) {
    const slash = full.file.lastIndexOf('/');
    const db = await SQLite.openDatabaseAsync(full.file.slice(slash + 1), { useNewConnection: true }, full.file.slice(0, slash));
    // The compact copy is not needed while the full edition is there.
    for (const name of [COMPACT, ...OLD_COMPACT]) await SQLite.deleteDatabaseAsync(name).catch(() => {});
    return { db, edition: 'full' };
  }
  for (const name of OLD_COMPACT) await SQLite.deleteDatabaseAsync(name).catch(() => {});
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  await SQLite.importDatabaseFromAssetAsync(COMPACT, { assetId: require('../../assets/dict/krdict.db') });
  return { db: await SQLite.openDatabaseAsync(COMPACT, { useNewConnection: true }), edition: 'compact' };
}

function opened() {
  if (!opening) {
    opening = open();
    opening.catch(() => {
      opening = null;
    });
  }
  return opening;
}

export async function getDictionary(): Promise<Db> {
  return (await opened()).db;
}

export async function dictionaryEdition(): Promise<Edition> {
  return (await opened()).edition;
}

/** Call after installing or removing the full edition. */
export async function reopenDictionary(): Promise<void> {
  const current = opening;
  opening = null;
  if (current) await current.then((d) => d.db.closeAsync()).catch(() => {});
}
