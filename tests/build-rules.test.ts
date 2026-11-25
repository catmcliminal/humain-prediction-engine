import { describe, expect, it } from 'vitest';
import { buildRules, FREEZE_AT } from '../scripts/build-rules.mjs';
import { FREEZE_AT as SHARED_FREEZE } from '../src/shared/constants';

describe('rules build script', () => {
  it('keeps the freeze constant in step with the shared constant', () => expect(FREEZE_AT).toBe(SHARED_FREEZE));
  it('injects the freeze time and leaves no placeholders', () => {
    const out = buildRules();
    expect(out).toContain('now < 1798722000000');
    expect(out).not.toMatch(/__[A-Z_]+__/);
    expect(() => JSON.parse(out)).not.toThrow();
  });
  it('has no host PIN or host registry any more', () => {
    const out = buildRules();
    expect(out).not.toMatch(/PIN|"hosts"/);
  });
});
