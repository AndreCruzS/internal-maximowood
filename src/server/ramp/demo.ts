import type { RampCard, RampFund, RampReimbursement, RampTxn } from "@/lib/expenses";

/**
 * Sample Ramp data, used until the API is connected so the Expenses pages can be
 * tried out. The same person always gets the same cards and purchases.
 * Everything here has a "demo_" id and is never sent to Ramp.
 */
const MERCHANTS: [string, string, number][] = [
  ["Shell", "Fuel", 64.18], ["Delta Air Lines", "Airlines", 412.6], ["Home Depot", "Supplies", 187.42],
  ["Marriott Miami", "Lodging", 289.0], ["Uber", "Taxi & rideshare", 23.75], ["Canva", "Software", 119.99],
  ["Staples", "Office supplies", 46.3], ["Chipotle", "Meals", 31.85], ["FedEx", "Shipping", 78.4],
  ["LinkedIn", "Advertising", 250.0], ["Amazon Business", "Supplies", 96.12], ["Starbucks", "Meals", 12.4],
];

function seed(text: string) {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296;
}

export function demoRamp(personId: string, name: string, now = new Date()) {
  const rand = seed(personId);
  const userId = `demo_user_${personId.slice(0, 8)}`;
  const last4 = String(1000 + Math.floor(rand() * 9000));
  const cards: RampCard[] = [
    { id: `demo_card_${personId.slice(0, 8)}_p`, name: "Main card", last4, physical: true, holderUserId: userId, suspended: false },
    { id: `demo_card_${personId.slice(0, 8)}_v`, name: "Online subscriptions", last4: String(1000 + Math.floor(rand() * 9000)), physical: false, holderUserId: userId, suspended: false },
  ];
  const txns: RampTxn[] = Array.from({ length: 9 }, (_, i) => {
    const [merchant, category, base] = MERCHANTS[Math.floor(rand() * MERCHANTS.length)];
    const card = cards[i % 4 === 3 ? 1 : 0];
    const at = new Date(now.getTime() - (i * 3 + Math.floor(rand() * 3) + 1) * 86_400_000);
    return {
      id: `demo_txn_${personId.slice(0, 8)}_${i}`,
      amount: Math.round(base * (0.8 + rand() * 0.5) * 100) / 100,
      currency: "USD",
      merchant,
      at: at.toISOString(),
      state: i === 0 ? "PENDING" : "CLEARED",
      cardId: card.id,
      cardLast4: card.last4,
      holderUserId: userId,
      holderName: name,
      // The newest few still need a receipt.
      receiptCount: i < 4 ? 0 : 1,
      memo: i < 4 ? "" : "Client visit",
      category,
    };
  });
  const funds: RampFund[] = [
    { id: "demo_fund_travel", name: "Travel", spent: Math.round(rand() * 1400 * 100) / 100, limit: 2000, currency: "USD" },
    { id: "demo_fund_software", name: "Software & subscriptions", spent: 119.99, limit: 500, currency: "USD" },
  ];
  const reimbursements: RampReimbursement[] = [
    { id: "demo_reimb_1", amount: 48.2, currency: "USD", merchant: "Parking — Port of Miami", date: new Date(now.getTime() - 9 * 86_400_000).toISOString().slice(0, 10), state: "REIMBURSED", type: "OUT_OF_POCKET" },
    { id: "demo_reimb_2", amount: 132.5, currency: "USD", merchant: "Mileage — Aventura to Doral", date: new Date(now.getTime() - 2 * 86_400_000).toISOString().slice(0, 10), state: "PENDING", type: "MILEAGE" },
  ];
  return { userId, cards, txns, funds, reimbursements };
}

export const isDemoId = (id: string | null | undefined) => Boolean(id?.startsWith("demo_"));
