// The last free-practice choices, so the next session starts the same way. Stored as one
// preference (JSON); anything missing or invalid falls back to the defaults of UX.md.
export type FreeDirs = 'both' | 'ko_ru' | 'ru_ko';
export type FreeMethod = 'keyboard' | 'self_grade' | 'choice';

export interface FreeChoice {
  /** Dictionary ids; empty = all dictionaries. */
  dicts: string[];
  dirs: FreeDirs;
  method: FreeMethod;
  limit: number;
}

export const FREE_PREF_KEY = 'freePractice';
export const FREE_COUNTS = [10, 20, 50];
export const DEFAULT_FREE: FreeChoice = { dicts: [], dirs: 'both', method: 'keyboard', limit: 20 };

/** Reads the stored choice; dictionaries that no longer exist are dropped. */
export function parseFreeChoice(text: string | null | undefined, existingDicts?: readonly string[]): FreeChoice {
  try {
    const v = JSON.parse(text ?? '') as Partial<FreeChoice>;
    const dicts = Array.isArray(v.dicts) ? v.dicts.filter((d): d is string => typeof d === 'string' && (!existingDicts || existingDicts.includes(d))) : [];
    return {
      dicts,
      dirs: v.dirs === 'ko_ru' || v.dirs === 'ru_ko' || v.dirs === 'both' ? v.dirs : DEFAULT_FREE.dirs,
      method: v.method === 'self_grade' || v.method === 'choice' || v.method === 'keyboard' ? v.method : DEFAULT_FREE.method,
      limit: FREE_COUNTS.includes(v.limit as number) ? (v.limit as number) : DEFAULT_FREE.limit,
    };
  } catch {
    return { ...DEFAULT_FREE };
  }
}
