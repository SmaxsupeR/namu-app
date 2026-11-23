import { beforeEach, describe, expect, it } from 'vitest';
import { drillRating, nextMissed } from '../core/grammarReview';
import { Rating, State } from '../core/scheduler';
import { dueGrammarTopics, getGrammarCard, recordGrammarDrill } from './grammar';
import * as repo from './repo';
import { migrate, MIGRATIONS, type Db } from './schema';
import { openTestDb } from './testing';

const DAY = 86400000;
let db: Db;
beforeEach(async () => {
  db = openTestDb();
  await migrate(db);
});

describe('drill rating', () => {
  it('turns a score into an FSRS rating', () => {
    expect(drillRating(4, 10, null)).toBe(Rating.Again);
    expect(drillRating(7, 10, null)).toBe(Rating.Hard);
    expect(drillRating(9, 10, null)).toBe(Rating.Good);
    expect(drillRating(10, 10, null)).toBe(Rating.Good);
    expect(drillRating(10, 10, { state: State.Review })).toBe(Rating.Easy);
  });

  it('keeps missed words until they are answered right', () => {
    expect(nextMissed(['가다', '듣다'], ['돕다'], ['가다'])).toEqual(['돕다', '듣다']);
    expect(nextMissed([], ['a', 'b', 'c', 'd', 'e', 'f', 'g'], [])).toHaveLength(6);
  });
});

describe('grammar cards', () => {
  it('migrates to the latest version', async () => {
    const v = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version', []);
    expect(v?.user_version).toBe(MIGRATIONS.length);
  });

  it('schedules a topic after a drill and brings it back when due', async () => {
    const now = Date.UTC(2026, 0, 1);
    const card = await recordGrammarDrill(db, { topicId: 'past', correct: 9, total: 10, wrong: ['듣다'], right: ['가다'] }, now, 0.9);
    expect(card.reps).toBe(1);
    expect(card.missed).toEqual(['듣다']);
    expect(await dueGrammarTopics(db, now, ['past'])).toEqual([]);
    expect(await dueGrammarTopics(db, card.due, ['past'])).toEqual(['past']);
    // Topics that no longer exist in the app are not offered.
    expect(await dueGrammarTopics(db, card.due, [])).toEqual([]);
  });

  it('a failed drill comes back sooner than a good one', async () => {
    const now = Date.UTC(2026, 0, 1);
    await recordGrammarDrill(db, { topicId: 'a', correct: 10, total: 10, wrong: [], right: [] }, now, 0.9);
    await recordGrammarDrill(db, { topicId: 'b', correct: 10, total: 10, wrong: [], right: [] }, now, 0.9);
    const later = now + 3 * DAY;
    const good = await recordGrammarDrill(db, { topicId: 'a', correct: 10, total: 10, wrong: [], right: [] }, later, 0.9);
    const bad = await recordGrammarDrill(db, { topicId: 'b', correct: 2, total: 10, wrong: ['x'], right: [] }, later, 0.9);
    expect(bad.due).toBeLessThan(good.due);
    expect(bad.lapses).toBeGreaterThanOrEqual(good.lapses);
    const rows = await db.getAllAsync<{ n: number }>('SELECT COUNT(*) AS n FROM grammar_history', []);
    expect(rows[0].n).toBe(4);
  });

  it('does not touch word cards', async () => {
    await recordGrammarDrill(db, { topicId: 'past', correct: 5, total: 5, wrong: [], right: [] }, Date.now(), 0.9);
    const rows = await db.getAllAsync<{ n: number }>('SELECT COUNT(*) AS n FROM review_cards', []);
    expect(rows[0].n).toBe(0);
  });

  it('is part of backups and restores into an empty database', async () => {
    const now = Date.UTC(2026, 0, 1);
    await recordGrammarDrill(db, { topicId: 'past', correct: 8, total: 10, wrong: ['듣다'], right: [] }, now, 0.9);
    const backup = repo.parseBackup(JSON.stringify(await repo.exportBackup(db, now)));
    const other = openTestDb();
    await migrate(other);
    await repo.restoreBackup(other, backup);
    expect((await getGrammarCard(other, 'past'))?.missed).toEqual(['듣다']);
    // Restoring twice keeps one card per topic.
    await repo.restoreBackup(other, backup);
    const rows = await other.getAllAsync<{ n: number }>('SELECT COUNT(*) AS n FROM grammar_cards', []);
    expect(rows[0].n).toBe(1);
  });
});
