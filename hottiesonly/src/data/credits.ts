export type CreditPack = {
  id: string;
  credits: number;
  priceCents: number;
  badge?: string;
};

export const CREDIT_PACKS: CreditPack[] = [
  { id: "p20", credits: 20, priceCents: 499 },
  { id: "p60", credits: 60, priceCents: 1199, badge: "Popular" },
  { id: "p150", credits: 150, priceCents: 2499, badge: "Best value" },
  { id: "p400", credits: 400, priceCents: 4999 },
];
