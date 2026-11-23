import { describe, expect, it } from 'vitest';
import { isMemoryError, modesFor, threadsFor } from './mode';

const phone = (totalRamMb: number, availRamMb: number, lowRamDevice = false) => ({ totalRamMb, availRamMb, lowRamDevice, cores: 8 });

describe('memory mode', () => {
  it('uses fast mode with light as backup on a roomy phone', () => {
    expect(modesFor(phone(12000, 5000))).toEqual(['fast', 'light']);
  });
  it('uses only light mode when RAM is tight', () => {
    expect(modesFor(phone(4000, 1500))).toEqual(['light']);
    expect(modesFor(phone(8000, 900))).toEqual(['light']);
  });
  it('leaves weak phones to the system voice', () => {
    expect(modesFor(phone(2000, 1500))).toEqual([]);
    expect(modesFor(phone(8000, 5000, true))).toEqual([]);
    expect(modesFor(phone(8000, 300))).toEqual([]);
  });
  it('caps threads at four', () => {
    expect(threadsFor(phone(8000, 4000))).toBe(4);
    expect(threadsFor({ ...phone(8000, 4000), cores: 2 })).toBe(2);
  });
  it('knows which errors call for a lighter mode', () => {
    expect(isMemoryError('E_OUT_OF_MEMORY')).toBe(true);
    expect(isMemoryError('E_MISSING_FILE')).toBe(false);
  });
});
