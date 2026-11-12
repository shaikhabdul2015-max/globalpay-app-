import { CURRENCY_CODES, SUPPORTED_CURRENCIES, isValidCurrencyCode } from './currencies.ts';
import type { CurrencyCode, ParsedAICommand } from './types.ts';

export type RecognizedIntentType =
  | 'send_money'
  | 'receive_money'
  | 'check_balance'
  | 'transaction_history'
  | 'currency_conversion'
  | 'fx_rate_lookup'
  | 'deposit_funds'
  | 'withdraw_funds'
  | 'payment_status'
  | 'general_chat';

export interface LocalIntentResult {
  intent: RecognizedIntentType;
  action: ParsedAICommand['action'];
  amount?: number;
  currency?: CurrencyCode;
  fromCurrency?: CurrencyCode;
  toCurrency?: CurrencyCode;
  recipient?: string;
  method?: 'paypal' | 'bank' | 'card';
  notes?: string;
  limit?: number;
  requires_confirmation: boolean;
  replyText: string;
  confidence: number;
  ambiguous?: boolean;
  clarification_prompt?: string;
  rate_timestamp?: string;
}

export function detectCurrencyTokens(text: string): CurrencyCode[] {
  const found: CurrencyCode[] = [];
  const pushUnique = (code: CurrencyCode) => {
    if (!found.includes(code)) found.push(code);
  };

  const tokenRegex = /\b(USD|EUR|GBP|INR|AED|JPY|CAD|AUD|SGD|THB|CHF)\b/gi;
  for (const match of text.matchAll(tokenRegex)) {
    const code = match[1].toUpperCase();
    if (isValidCurrencyCode(code)) pushUnique(code);
  }

  if (found.length === 0) {
    if (/\$|\bdollars?\b/i.test(text)) pushUnique('USD');
    if (/€|\beuros?\b/i.test(text)) pushUnique('EUR');
    if (/£|\bpounds?\b/i.test(text)) pushUnique('GBP');
    if (/₹|\brupees?\b/i.test(text)) pushUnique('INR');
    if (/¥|\byen\b/i.test(text)) pushUnique('JPY');
    if (/\bdirhams?\b/i.test(text)) pushUnique('AED');
    if (/\bfrancs?\b/i.test(text)) pushUnique('CHF');
    if (/\bbaht\b/i.test(text)) pushUnique('THB');
  }

  return found;
}

export function parseLocalIntent(
  rawInput: string,
  defaultCurrency: CurrencyCode = 'USD'
): LocalIntentResult {
  const trimmed = rawInput.trim();
  const lower = trimmed.toLowerCase();

  // Extract amount
  const amountMatch = trimmed.match(/(?:\$|€|£|₹|¥)?\s*(\d+(?:,\d{3})*(?:\.\d{1,2})?)/);
  const parsedAmount = amountMatch ? Number(amountMatch[1].replace(/,/g, '')) : undefined;
  const amount =
    typeof parsedAmount === 'number' && Number.isFinite(parsedAmount) && parsedAmount > 0
      ? Math.round(parsedAmount * 100) / 100
      : undefined;

  const currencies = detectCurrencyTokens(trimmed);
  const primaryCurrency = currencies[0] || defaultCurrency;

  // 1. Send Money / Transfer
  if (/\b(send|transfer|pay|remit|wire)\b/i.test(lower)) {
    const toMatch = trimmed.match(/\bto\s+([a-zA-Z][a-zA-Z0-9 .'-]{0,50})/i);
    const recipient = toMatch ? toMatch[1].replace(/[.!?]+$/, '').trim() : undefined;

    if (!amount && !recipient) {
      return {
        intent: 'send_money',
        action: 'general_chat',
        requires_confirmation: false,
        ambiguous: true,
        confidence: 0.8,
        clarification_prompt: 'Who would you like to send money to, and how much? (e.g. "Send $50 to Marco")',
        replyText: 'Who would you like to send money to, and how much? (e.g. "Send $50 to Marco")',
      };
    }

    if (!amount) {
      return {
        intent: 'send_money',
        action: 'general_chat',
        recipient,
        requires_confirmation: false,
        ambiguous: true,
        confidence: 0.85,
        clarification_prompt: `How much would you like to send to ${recipient}? (e.g. "Send $50 to ${recipient}")`,
        replyText: `How much would you like to send to ${recipient}? (e.g. "Send $50 to ${recipient}")`,
      };
    }

    if (!recipient) {
      return {
        intent: 'send_money',
        action: 'general_chat',
        amount,
        currency: primaryCurrency,
        requires_confirmation: false,
        ambiguous: true,
        confidence: 0.85,
        clarification_prompt: `Who would you like to send ${SUPPORTED_CURRENCIES[primaryCurrency].symbol}${amount} to?`,
        replyText: `Who would you like to send ${SUPPORTED_CURRENCIES[primaryCurrency].symbol}${amount} to?`,
      };
    }

    return {
      intent: 'send_money',
      action: 'send',
      amount,
      currency: primaryCurrency,
      fromCurrency: primaryCurrency,
      recipient,
      requires_confirmation: true,
      confidence: 0.98,
      replyText: `Preparing transfer of ${SUPPORTED_CURRENCIES[primaryCurrency].symbol}${amount.toFixed(2)} ${primaryCurrency} to ${recipient}. Please review and confirm below.`,
    };
  }

  // 2. Deposit Funds / Add Money / Top Up (triggers PayPal Sandbox overlay)
  if (/\b(add|deposit|top\s*up|topup|fund|load|paypal)\b/i.test(lower)) {
    const method: 'paypal' | 'bank' | 'card' = /\bbank\b/i.test(lower)
      ? 'bank'
      : /\bcard\b/i.test(lower)
      ? 'card'
      : 'paypal';

    if (!amount) {
      return {
        intent: 'deposit_funds',
        action: 'general_chat',
        currency: primaryCurrency,
        method,
        requires_confirmation: false,
        ambiguous: true,
        confidence: 0.85,
        clarification_prompt: `How much would you like to deposit into your ${primaryCurrency} wallet? (e.g. "Deposit $200" or "Add $50 via PayPal")`,
        replyText: `How much would you like to deposit into your ${primaryCurrency} wallet? (e.g. "Deposit $200" or "Add $50 via PayPal")`,
      };
    }

    return {
      intent: 'deposit_funds',
      action: 'add_money',
      amount,
      currency: primaryCurrency,
      fromCurrency: primaryCurrency,
      toCurrency: primaryCurrency,
      method,
      requires_confirmation: true,
      confidence: 0.99,
      replyText: `PayPal Sandbox Checkout is ready to add ${SUPPORTED_CURRENCIES[primaryCurrency].symbol}${amount.toFixed(2)} ${primaryCurrency} to your wallet. Approve the checkout overlay to update your balance.`,
    };
  }

  // 3. Receive Money / Payment Request / Account Details
  if (/\b(receive|get paid|request money|my details|my account details|receive money|deposit details)\b/i.test(lower)) {
    const def = SUPPORTED_CURRENCIES[primaryCurrency];
    return {
      intent: 'receive_money',
      action: 'general_chat',
      currency: primaryCurrency,
      requires_confirmation: false,
      confidence: 0.95,
      replyText: `To receive ${primaryCurrency} funds, share your GlobalPay ${def.accountDetails.systemName} details: ${def.accountDetails.identifierLabel}: ${def.accountDetails.routingCode}, Account: ${def.accountDetails.accountNumber} (${def.accountDetails.bankName}).`,
    };
  }

  // 4. Withdraw Funds
  if (/\b(withdraw|cash out|payout|sweep)\b/i.test(lower)) {
    return {
      intent: 'withdraw_funds',
      action: 'general_chat',
      amount,
      currency: primaryCurrency,
      requires_confirmation: false,
      confidence: 0.9,
      replyText: amount
        ? `To withdraw ${SUPPORTED_CURRENCIES[primaryCurrency].symbol}${amount} ${primaryCurrency} to your external linked bank, please use the Withdraw option under your Wallet tab or send to your verified external account.`
        : 'To withdraw funds from your multi-currency wallet to your local bank account, navigate to the Wallet tab and tap your preferred currency balance.',
    };
  }

  // 5. Payment Status / Transaction Status
  if (/\b(status|tracking|track|where is my money|is my payment complete)\b/i.test(lower)) {
    const txMatch = trimmed.match(/\b(TX-\d{6})\b/i);
    const txId = txMatch ? txMatch[1].toUpperCase() : undefined;
    return {
      intent: 'payment_status',
      action: 'transaction_history',
      requires_confirmation: false,
      confidence: 0.92,
      replyText: txId
        ? `Checking status for transaction ${txId}. Your recent activity shows authoritative settlement on GlobalPay ledger rails.`
        : 'Here are your recent transaction records. All completed transfers settle instantaneously or within 1 hour depending on the partner banking rail.',
    };
  }

  // 6. Currency Conversion Quote vs Swap
  if (/\b(swap)\b/i.test(lower) || (/\bexchange\b/i.test(lower) && !/\brate\b/i.test(lower))) {
    const fromCur = currencies[0] || defaultCurrency;
    const toCur = currencies[1] || (fromCur === 'EUR' ? 'USD' : 'EUR');

    if (!amount) {
      return {
        intent: 'currency_conversion',
        action: 'general_chat',
        fromCurrency: fromCur,
        toCurrency: toCur,
        requires_confirmation: false,
        ambiguous: true,
        confidence: 0.85,
        clarification_prompt: `How much ${fromCur} would you like to swap into ${toCur}? (e.g. "Swap 100 ${fromCur} to ${toCur}")`,
        replyText: `How much ${fromCur} would you like to swap into ${toCur}? (e.g. "Swap 100 ${fromCur} to ${toCur}")`,
      };
    }

    return {
      intent: 'currency_conversion',
      action: 'swap',
      amount,
      currency: fromCur,
      fromCurrency: fromCur,
      toCurrency: toCur,
      requires_confirmation: true,
      confidence: 0.97,
      replyText: `Please review and confirm swapping ${SUPPORTED_CURRENCIES[fromCur].symbol}${amount.toFixed(2)} ${fromCur} to ${toCur}.`,
    };
  }

  // 7. FX Rate Lookup (e.g. "What's the USD to INR rate?", "convert 100 usd to eur")
  if (
    /\b(convert|rate|exchange rate|how much is|fx rate|quote|price of)\b/i.test(lower) ||
    (currencies.length >= 2 && !/\bsend|transfer|add|deposit\b/i.test(lower))
  ) {
    const fromCur = currencies[0] || defaultCurrency;
    const toCur = currencies[1] || (fromCur === 'EUR' ? 'USD' : 'EUR');
    const isRateOnly = !amount || /\b(rate|exchange rate|what('s| is) the rate)\b/i.test(lower);

    return {
      intent: isRateOnly ? 'fx_rate_lookup' : 'currency_conversion',
      action: 'convert_quote',
      amount: amount || 1,
      fromCurrency: fromCur,
      toCurrency: toCur,
      requires_confirmation: false,
      confidence: 0.98,
      rate_timestamp: new Date().toISOString(),
      replyText: `Calculating live mid-market conversion between ${fromCur} and ${toCur}.`,
    };
  }

  // 8. Transaction History
  if (/\b(transactions?|history|activity|recent|spent|ledger|statement|records?)\b/i.test(lower)) {
    return {
      intent: 'transaction_history',
      action: 'transaction_history',
      currency: currencies[0],
      limit: 5,
      requires_confirmation: false,
      confidence: 0.98,
      replyText: currencies[0]
        ? `Here are your recent ${currencies[0]} transactions.`
        : 'Here is your recent account activity across all wallet currencies.',
    };
  }

  // 9. Check Balance
  if (/\b(balance|wallet|how much do i have|how much money|holdings|funds|my money)\b/i.test(lower)) {
    return {
      intent: 'check_balance',
      action: 'check_balance',
      currency: currencies[0],
      requires_confirmation: false,
      confidence: 0.98,
      replyText: currencies[0]
        ? `Checking your ${currencies[0]} balance.`
        : 'Retrieving your verified balances across all supported currencies.',
    };
  }

  // 10. General chat fallback
  return {
    intent: 'general_chat',
    action: 'general_chat',
    requires_confirmation: false,
    confidence: 0.5,
    ambiguous: false,
    replyText:
      'I am GlobalPay AI. You can ask me to send money ("Send $50 to Marco"), deposit funds via PayPal ("Deposit $100"), check balances, lookup FX rates ("USD to INR rate"), or review recent transactions.',
  };
}
