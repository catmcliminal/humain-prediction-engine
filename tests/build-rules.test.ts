import { describe, expect, it } from 'vitest';
import { buildRules, FREEZE_AT } from '../scripts/build-rules.mjs';
import { FREEZE_AT as SHARED_FREEZE } from '../src/shared/constants';

describe('rules build script', () => {
  it('keeps the freeze constant in step with the shared constant', () => expect(FREEZE_AT).toBe(SHARED_FREEZE));
  it('injects the PIN and the freeze time and leaves no placeholders', () => {
    const out = buildRules({ hostPin: 'a-long-test-pin' });
    expect(out).toContain("=== 'a-long-test-pin'");
    expect(out).toContain('now < 1798722000000');
    expect(out).not.toMatch(/__[A-Z_]+__/);
    expect(() => JSON.parse(out)).not.toThrow();
  });
  it.each([
    ['missing', undefined],
    ['the placeholder', 'CHANGE-THIS-PIN'],
    ['an instruction placeholder', 'YOUR-SAVED-PIN'],
    ['too short', 'abc123'],
    ['containing a quote', "abcdefgh'x"],
    ['containing a space', 'abcd efgh1'],
    ['containing a backslash', 'abcdefgh\\x'],
  ])('refuses a PIN that is %s', (_n, pin) => expect(() => buildRules({ hostPin: pin as string })).toThrow());
});
