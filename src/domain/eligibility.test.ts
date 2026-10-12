import { describe, expect, it } from 'vitest';
import { isEligibilityComplete, isEligible } from './eligibility';

describe('eligibility rules', () => {
  it('only approves three explicit no answers', () => {
    expect(isEligible({ recovery: 'no', discomfort_infection: 'no', symptoms: 'no' })).toBe(true);
    expect(isEligible({ recovery: 'no', discomfort_infection: 'unsure', symptoms: 'no' })).toBe(
      false,
    );
  });

  it('does not treat partial answers as complete', () => {
    expect(isEligibilityComplete({ recovery: 'no' })).toBe(false);
    expect(
      isEligibilityComplete({ recovery: 'no', discomfort_infection: 'no', symptoms: 'yes' }),
    ).toBe(true);
  });
});
