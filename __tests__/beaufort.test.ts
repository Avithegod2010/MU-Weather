/// <reference types="jest" />
import { beaufortForce } from '../utils/beaufort';

describe('beaufortForce', () => {
  it('maps the standard km/h thresholds', () => {
    expect(beaufortForce(0)).toBe(0);
    expect(beaufortForce(0.9)).toBe(0);
    expect(beaufortForce(1)).toBe(1);
    expect(beaufortForce(5.9)).toBe(1);
    expect(beaufortForce(6)).toBe(2);
    expect(beaufortForce(19.9)).toBe(3);
    expect(beaufortForce(20)).toBe(4);
    expect(beaufortForce(49.9)).toBe(6);
    expect(beaufortForce(50)).toBe(7);
    expect(beaufortForce(117.9)).toBe(11);
    expect(beaufortForce(118)).toBe(12);
    expect(beaufortForce(200)).toBe(12);
  });

  it('is monotonic over the whole range', () => {
    let prev = beaufortForce(0);
    for (let s = 1; s <= 150; s++) {
      const f = beaufortForce(s);
      expect(f).toBeGreaterThanOrEqual(prev);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(12);
      prev = f;
    }
  });
});
