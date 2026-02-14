/**
 * Cost report utilities: merging usage maps, computing totals,
 * fetching exchange rates, and formatting markdown cost tables.
 */

import type { ModelUsageMap, CostBreakdown, CurrencyAmount } from './costTypes';
import { emptyModelUsage } from './costTypes';
import { log } from './utils';

/** Maps common currency codes to their symbols. */
export const CURRENCY_SYMBOLS: Readonly<Record<string, string>> = {
  USD: '$',
  EUR: '\u20ac',
  GBP: '\u00a3',
  JPY: '\u00a5',
  CAD: 'CA$',
  AUD: 'AU$',
  CHF: 'CHF',
} as const;

/** Merges multiple ModelUsageMaps by summing corresponding fields per model key. */
export function mergeModelUsageMaps(...maps: ModelUsageMap[]): ModelUsageMap {
  const result: ModelUsageMap = {};

  maps.flatMap((map) => Object.entries(map)).forEach(([model, usage]) => {
    const existing = result[model] ?? emptyModelUsage();
    result[model] = {
      inputTokens: existing.inputTokens + usage.inputTokens,
      outputTokens: existing.outputTokens + usage.outputTokens,
      cacheReadInputTokens: existing.cacheReadInputTokens + usage.cacheReadInputTokens,
      cacheCreationInputTokens: existing.cacheCreationInputTokens + usage.cacheCreationInputTokens,
      costUSD: existing.costUSD + usage.costUSD,
    };
  });

  return result;
}

/** Sums costUSD across all models using CLI-reported cost as source of truth. */
export function computeTotalCostUsd(usageMap: ModelUsageMap): number {
  return Object.values(usageMap).reduce((sum, usage) => sum + usage.costUSD, 0);
}

/**
 * Fetches exchange rates from the free ExchangeRate-API.
 * Returns a map of currency code to conversion rate from USD.
 * Handles network errors gracefully by returning an empty map.
 */
export async function fetchExchangeRates(targetCurrencies: string[]): Promise<Record<string, number>> {
  if (targetCurrencies.length === 0) return {};

  try {
    const response = await fetch('https://open.er-api.com/v6/latest/USD');
    if (!response.ok) {
      log(`Exchange rate API returned status ${response.status}`, 'error');
      return {};
    }

    const data = await response.json() as { rates?: Record<string, number> };
    const ratesMap = data.rates;
    if (!ratesMap) return {};

    return targetCurrencies.reduce<Record<string, number>>((acc, currency) => {
      const rate = ratesMap[currency];
      return typeof rate === 'number' ? { ...acc, [currency]: rate } : acc;
    }, {});
  } catch (error) {
    log(`Failed to fetch exchange rates: ${error}`, 'error');
    return {};
  }
}

/** Builds a complete CostBreakdown by fetching exchange rates and computing totals. */
export async function buildCostBreakdown(
  usageMap: ModelUsageMap,
  currencies: string[],
): Promise<CostBreakdown> {
  const totalCostUsd = computeTotalCostUsd(usageMap);
  const rates = await fetchExchangeRates(currencies);

  const currencyAmounts: CurrencyAmount[] = currencies
    .filter(currency => typeof rates[currency] === 'number')
    .map(currency => ({
      currency,
      amount: totalCostUsd * rates[currency],
      symbol: CURRENCY_SYMBOLS[currency] ?? currency,
    }));

  return {
    totalCostUsd,
    modelUsage: usageMap,
    currencies: currencyAmounts,
  };
}

/** Formats a number with commas as thousands separator. */
function formatTokenCount(count: number): string {
  return count.toLocaleString('en-US');
}

/** Formats a cost breakdown as a markdown table for GitHub comments. */
export function formatCostBreakdownMarkdown(breakdown: CostBreakdown): string {
  const models = Object.entries(breakdown.modelUsage);

  if (models.length === 0) {
    return `**Total Cost:** $${breakdown.totalCostUsd.toFixed(4)}`;
  }

  const lines: string[] = [
    '| Model | Input Tokens | Output Tokens | Cache Read | Cache Write | Cost (USD) |',
    '|-------|-------------|---------------|------------|-------------|------------|',
  ];

  // Accumulate totals while building model rows
  const totals = models.reduce(
    (acc, [model, usage]) => {
      lines.push(
        `| ${model} | ${formatTokenCount(usage.inputTokens)} | ${formatTokenCount(usage.outputTokens)} | ${formatTokenCount(usage.cacheReadInputTokens)} | ${formatTokenCount(usage.cacheCreationInputTokens)} | $${usage.costUSD.toFixed(4)} |`
      );
      return {
        input: acc.input + usage.inputTokens,
        output: acc.output + usage.outputTokens,
        cacheRead: acc.cacheRead + usage.cacheReadInputTokens,
        cacheWrite: acc.cacheWrite + usage.cacheCreationInputTokens,
      };
    },
    { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
  );

  lines.push(
    `| **Total** | **${formatTokenCount(totals.input)}** | **${formatTokenCount(totals.output)}** | **${formatTokenCount(totals.cacheRead)}** | **${formatTokenCount(totals.cacheWrite)}** | **$${breakdown.totalCostUsd.toFixed(4)}** |`
  );

  lines.push('');
  lines.push(`**Total Cost:** $${breakdown.totalCostUsd.toFixed(4)} USD`);

  breakdown.currencies.forEach((currency) => {
    lines.push(`**Total Cost:** ${currency.symbol}${currency.amount.toFixed(4)} ${currency.currency}`);
  });

  return lines.join('\n');
}
