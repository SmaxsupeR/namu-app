// Dictionaries filled with random words from the bundled dictionary, optionally renewed
// every week. Renewing replaces only words that were never studied: started and learned
// words keep their place and their FSRS history.
import { parseSampleConfig, refreshDue, sampleWords, type SampleConfig } from '../dict/sample';
import { createDictionary, duplicateKey, importEntries } from './repo';
import type { Db } from './schema';

export interface AutoDictionary {
  config: SampleConfig;
  refreshedAt: number;
}

/** Keys of every word the learner already has, in any dictionary. */
async function ownKeys(db: Db): Promise<Set<string>> {
  const rows = await db.getAllAsync<{ korean: string }>('SELECT korean FROM entries', []);
  return new Set(rows.map((r) => duplicateKey(r.korean)));
}

/** Words of a dictionary nobody has studied yet: not shown, not in training, not scheduled, never answered. */
const UNTOUCHED = `
  SELECT e.id, e.korean FROM entries e
   WHERE e.dictionary_id = ? AND e.introduced_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM review_cards c WHERE c.entry_id = e.id)
     AND NOT EXISTS (SELECT 1 FROM acquisition a WHERE a.entry_id = e.id)
     AND NOT EXISTS (SELECT 1 FROM practice_attempts p WHERE p.entry_id = e.id)`;

export async function getAutoDictionary(db: Db, dictionaryId: string): Promise<AutoDictionary | null> {
  const row = await db.getFirstAsync<{ config: string; refreshed_at: number }>('SELECT config, refreshed_at FROM auto_dictionaries WHERE dictionary_id = ?', [dictionaryId]);
  return row ? { config: parseSampleConfig(row.config), refreshedAt: row.refreshed_at } : null;
}

/** Creates a dictionary with `config.count` random words the learner does not have yet. Returns its id and size. */
export async function createAutoDictionary(db: Db, dict: Db, input: { name: string; color?: string; config: SampleConfig }, now = Date.now()): Promise<{ id: string; added: number }> {
  const have = await ownKeys(db);
  const words = await sampleWords(dict, input.config, input.config.count, (k) => have.has(duplicateKey(k)));
  const id = await createDictionary(db, { name: input.name, color: input.color }, now);
  await importEntries(db, id, words, now);
  await db.runAsync('INSERT INTO auto_dictionaries (dictionary_id, config, refreshed_at) VALUES (?, ?, ?)', [id, JSON.stringify(input.config), now]);
  return { id, added: words.length };
}

/** New words for a set: untouched words go, fresh ones (not seen before in this set) come in. */
export async function refreshAutoDictionary(db: Db, dict: Db, dictionaryId: string, now = Date.now()): Promise<{ removed: number; added: number } | null> {
  const auto = await getAutoDictionary(db, dictionaryId);
  if (!auto) return null;
  const untouched = await db.getAllAsync<{ id: string; korean: string }>(UNTOUCHED, [dictionaryId]);
  const have = await ownKeys(db);
  // Words just removed should not come straight back.
  const leaving = new Set(untouched.map((u) => duplicateKey(u.korean)));
  const words = await sampleWords(dict, auto.config, auto.config.count, (k) => have.has(duplicateKey(k)) || leaving.has(duplicateKey(k)));
  await db.withTransactionAsync(async () => {
    for (const u of untouched) await db.runAsync('DELETE FROM entries WHERE id = ?', [u.id]);
  });
  await importEntries(db, dictionaryId, words, now);
  await db.runAsync('UPDATE auto_dictionaries SET refreshed_at = ? WHERE dictionary_id = ?', [now, dictionaryId]);
  return { removed: untouched.length, added: words.length };
}

/** Renews every weekly set that is a week old. Returns how many were renewed. */
export async function refreshDueAutoDictionaries(db: Db, dict: Db, now = Date.now()): Promise<number> {
  const rows = await db.getAllAsync<{ dictionary_id: string; config: string; refreshed_at: number }>(
    `SELECT a.dictionary_id, a.config, a.refreshed_at FROM auto_dictionaries a JOIN dictionaries d ON d.id = a.dictionary_id WHERE d.is_archived = 0 AND d.is_paused = 0`,
    [],
  );
  let n = 0;
  for (const r of rows) {
    if (!refreshDue(parseSampleConfig(r.config), r.refreshed_at, now)) continue;
    if (await refreshAutoDictionary(db, dict, r.dictionary_id, now)) n++;
  }
  return n;
}
