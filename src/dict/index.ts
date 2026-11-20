// Opens the bundled dictionary. It ships inside the app and is copied to app
// storage on first use; a new dictionary version gets a new file name.
import * as SQLite from 'expo-sqlite';
import type { Db } from '../db/schema';

const NAME = 'krdict-1.db';
let opening: Promise<Db> | null = null;

export function getDictionary(): Promise<Db> {
  if (!opening) {
    opening = (async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      await SQLite.importDatabaseFromAssetAsync(NAME, {
        assetId: require('../../assets/dict/krdict.db'),
      });
      return SQLite.openDatabaseAsync(NAME, { useNewConnection: true });
    })();
    opening.catch(() => {
      opening = null;
    });
  }
  return opening;
}
