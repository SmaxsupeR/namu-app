import { describe, expect, it } from 'vitest';
import { isStorageBusy, shouldReloadForBusy } from './busy';

const busy = new Error("Failed to execute 'createSyncAccessHandle' on 'FileSystemFileHandle': Access Handles cannot be created if there is another open Access Handle");

describe('opening a busy browser database', () => {
  it('recognises the busy errors and nothing else', () => {
    expect(isStorageBusy(busy)).toBe(true);
    expect(isStorageBusy(new Error('Invalid VFS state'))).toBe(true);
    expect(isStorageBusy(new Error('no such table: words'))).toBe(false);
  });
  it('reloads a few times at most, and never for other errors', () => {
    expect(shouldReloadForBusy(busy, 0)).toBe(true);
    expect(shouldReloadForBusy(busy, 2)).toBe(true);
    expect(shouldReloadForBusy(busy, 3)).toBe(false);
    expect(shouldReloadForBusy(new Error('broken'), 0)).toBe(false);
  });
});
