import { describe, it, expect } from 'vitest';
import {
  canAfford,
  formatPrice,
  mockReply,
  COST_PER_MESSAGE,
  CREDIT_PACKS,
} from './chatStore';

describe('chatStore helpers', () => {
  it('canAfford gates on the per-message cost', () => {
    expect(canAfford(0)).toBe(false);
    expect(canAfford(COST_PER_MESSAGE)).toBe(true);
    expect(canAfford(COST_PER_MESSAGE - 1)).toBe(false);
  });

  it('formatPrice renders whole cents as dollars', () => {
    expect(formatPrice(499)).toBe('$4.99');
    expect(formatPrice(2499)).toBe('$24.99');
    expect(formatPrice(0)).toBe('$0.00');
  });

  it('mockReply always returns a non-empty known template', () => {
    const reply = mockReply('hello there', 3);
    expect(reply.length).toBeGreaterThan(0);
    // Same inputs are deterministic.
    expect(mockReply('hello there', 3)).toBe(reply);
  });

  it('credit packs are well-formed', () => {
    expect(CREDIT_PACKS.length).toBeGreaterThan(0);
    for (const pack of CREDIT_PACKS) {
      expect(pack.credits).toBeGreaterThan(0);
      expect(pack.priceCents).toBeGreaterThan(0);
    }
  });
});
