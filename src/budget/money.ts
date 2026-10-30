/**
 * Money is tracked as an integer number of micro-USD (1e-6 USD) to avoid floating-point
 * drift in the budget ledger. A 6-decimal stablecoin's atomic unit (USDC/USDT/USAT on Celo)
 * is exactly one micro-USD, so an x402 quote's `maxAmountRequired` atomic string converts
 * with no scaling.
 */

export type MicroUsd = number;

/** Parse an x402 atomic amount string (6-decimal token base units) into micro-USD. */
export function microFromAtomic(atomic: string): MicroUsd {
  if (!/^\d+$/.test(atomic)) {
    throw new Error(`Invalid atomic amount: ${JSON.stringify(atomic)}`);
  }
  const n = Number(atomic);
  if (!Number.isSafeInteger(n)) {
    throw new Error(`Atomic amount out of safe integer range: ${atomic}`);
  }
  return n;
}

/** Convert a USD figure (e.g. from env config) into micro-USD. */
export function microFromUsd(usd: number): MicroUsd {
  if (!Number.isFinite(usd) || usd < 0) {
    throw new Error(`Invalid USD amount: ${usd}`);
  }
  return Math.round(usd * 1_000_000);
}

/** Format micro-USD as a USD string for logs and reports. */
export function usdFromMicro(micro: MicroUsd): string {
  return (micro / 1_000_000).toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
}
