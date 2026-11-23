import { describe, expect, it } from 'vitest';
import { backoff, MAX_ATTEMPTS, pauseReason, type DeviceConditions } from './queuePolicy';

const ok: DeviceConditions = { battery: 80, charging: false, powerSave: false, thermal: 0, availRamMb: 3000, lowMemory: false };

describe('queue policy', () => {
  it('works in the foreground on a normal phone', () => {
    for (const p of [0, 1, 2, 3] as const) expect(pauseReason(p, ok, true)).toBeNull();
  });
  it('stops in the background', () => {
    expect(pauseReason(0, ok, false)).toBe('background');
  });
  it('stops when memory is short', () => {
    expect(pauseReason(0, { ...ok, lowMemory: true }, true)).toBe('memory');
    expect(pauseReason(0, { ...ok, availRamMb: 200 }, true)).toBe('memory');
  });
  it('lets only urgent work run on a warm phone, and nothing on a hot one', () => {
    expect(pauseReason(1, { ...ok, thermal: 2 }, true)).toBeNull();
    expect(pauseReason(2, { ...ok, thermal: 2 }, true)).toBe('thermal');
    expect(pauseReason(0, { ...ok, thermal: 3 }, true)).toBe('thermal');
  });
  it('saves the battery for lower priorities', () => {
    expect(pauseReason(3, { ...ok, battery: 40 }, true)).toBe('battery');
    expect(pauseReason(2, { ...ok, battery: 40 }, true)).toBeNull();
    expect(pauseReason(2, { ...ok, battery: 15 }, true)).toBe('battery');
    expect(pauseReason(1, { ...ok, battery: 15 }, true)).toBeNull();
    expect(pauseReason(3, { ...ok, battery: 15, charging: true }, true)).toBeNull();
    expect(pauseReason(2, { ...ok, powerSave: true }, true)).toBe('power_save');
    expect(pauseReason(1, { ...ok, powerSave: true }, true)).toBeNull();
    expect(pauseReason(3, { ...ok, battery: -1 }, true)).toBeNull();
  });
  it('backs off and then gives up', () => {
    expect(backoff(1)).toBe(5_000);
    expect(backoff(2)).toBe(30_000);
    expect(backoff(MAX_ATTEMPTS - 1)).toBe(600_000);
    expect(backoff(MAX_ATTEMPTS)).toBeNull();
  });
});
