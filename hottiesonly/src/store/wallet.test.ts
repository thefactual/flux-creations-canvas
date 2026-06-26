import { describe, it, expect } from "vitest";
import { canSpend } from "./walletStore";
import { mockReply, COST_PER_MESSAGE } from "./chatStore";
import { formatPrice, compact } from "@/lib/utils";
import { CREDIT_PACKS } from "@/data/credits";

describe("wallet / chat helpers", () => {
  it("canSpend gates on balance and rejects negatives", () => {
    expect(canSpend(0, COST_PER_MESSAGE)).toBe(false);
    expect(canSpend(1, 1)).toBe(true);
    expect(canSpend(5, 6)).toBe(false);
    expect(canSpend(5, -1)).toBe(false);
  });

  it("formatPrice drops .00 for whole dollars", () => {
    expect(formatPrice(1999)).toBe("$19.99");
    expect(formatPrice(5000)).toBe("$50");
    expect(formatPrice(499)).toBe("$4.99");
  });

  it("compact formats large counts", () => {
    expect(compact(420)).toBe("420");
    expect(compact(18420)).toBe("18.4K");
    expect(compact(1_240_000)).toBe("1.2M");
  });

  it("mockReply is deterministic and non-empty", () => {
    const a = mockReply("hi there", 2);
    expect(a.length).toBeGreaterThan(0);
    expect(mockReply("hi there", 2)).toBe(a);
  });

  it("credit packs are well-formed", () => {
    expect(CREDIT_PACKS.length).toBeGreaterThan(0);
    for (const p of CREDIT_PACKS) {
      expect(p.credits).toBeGreaterThan(0);
      expect(p.priceCents).toBeGreaterThan(0);
    }
  });
});
