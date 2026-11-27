// In a browser the database file can still be held by the previous page for a moment after a
// quick reload (OPFS access handle). Opening then fails, and the database worker stays broken
// for this page ("Invalid VFS state"), so retrying in place does not help. The cure is a fresh
// page a moment later: the root layout reloads once more, at most a few times in a row.
const BUSY = /createSyncAccessHandle|Access Handles cannot be created|NoModificationAllowedError|Invalid VFS state/i;

export function isStorageBusy(e: unknown): boolean {
  return BUSY.test(e instanceof Error ? `${e.name} ${e.message}` : String(e));
}

/** Whether to reload after a busy error, given how many reloads already happened in a row. */
export function shouldReloadForBusy(e: unknown, reloadsSoFar: number, maxReloads = 3): boolean {
  return isStorageBusy(e) && reloadsSoFar < maxReloads;
}
