import { GoogleGenAI, Type } from '@google/genai';
import { CURRENCY_CODES, SUPPORTED_CURRENCIES, isValidCurrencyCode } from './currencies.ts';
import type {
  AIActionType,
  CurrencyCode,
  ParsedAICommand,
  Recipient,
  Transaction,
  WalletBalance,
  WalletSnapshot,
} from './types.ts';
import {
  calculateSwapQuote,
  calculateTransferQuote,
  getCachedExchangeRate,
  getExchangeRate,
  resolveRecipientMatch,
} from './walletEngine.ts';

const ALLOWED_ACTIONS: ReadonlySet<AIActionType> = new Set([
  'send',
  'add_money',
  'swap',
  'check_balance',
  'convert_quote',
  'transaction_history',
  'general_chat',
]);

let cachedClient: GoogleGenAI | null = null;
let cachedApiKey: string | undefined;

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new GeminiConfigurationError(
      'GEMINI_API_KEY is not configured on the server. Add GEMINI_API_KEY in environment secrets.'
    );
  }
  if (!cachedClient || cachedApiKey !== apiKey) {
    cachedClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
    cachedApiKey = apiKey;
  }
  return cachedClient;
}

export class GeminiConfigurationError extends Error {
  statusCode = 503;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface ConfirmationProposal {
  action: 'send' | 'add_money' | 'swap';
  amount: number;
  currency: CurrencyCode;
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  receiveAmount: number;
  rate: number;
  feeTotal: number;
  feeBreakdown: {
    conversionFee: number;
    transferFee: number;
    networkFee: number;
  };
  totalDebit: number;
  estimatedArrival?: string;
  recipientName?: string;
  recipientId?: string;
  recipientCountry?: string;
  recipientBank?: string;
  recipientAccount?: string;
  recipientNeedsSetup?: boolean;
  recipientCandidates?: Recipient[];
  method?: 'paypal' | 'bank' | 'card';
  notes?: string;
  requiresPin: boolean;
  pinThreshold: number;
  validationError?: string;
}

export interface AIAssistantResponse {
  parsedCommand: {
    action: AIActionType;
    amount?: number;
    currency?: CurrencyCode;
    fromCurrency?: CurrencyCode;
    toCurrency?: CurrencyCode;
    recipient?: string;
  };
  intent?: string;
  source?: 'local_intent_fast' | 'gemini_fast_model' | 'fallback_parser';
  latencyMs?: number;
  replyText: string;
  requiresConfirmation: boolean;
  clarificationNeeded?: boolean;
  confirmationProposal?: ConfirmationProposal;
  balanceSummary?: Array<{
    currency: CurrencyCode;
    name: string;
    symbol: string;
    flag: string;
    available: number;
    pending: number;
    held: number;
  }>;
  conversionQuote?: {
    fromCurrency: CurrencyCode;
    toCurrency: CurrencyCode;
    fromAmount: number;
    toAmount: number;
    rate: number;
    swapFee: number;
    fromSymbol: string;
    toSymbol: string;
    rateTimestamp?: string;
    source?: string;
  };
  recentTransactions?: Transaction[];
}

const SYSTEM_INSTRUCTION = `You are GlobalPay AI, the intelligent financial assistant inside the GlobalPay Multi-Currency International Wallet.
Your job is to classify the user's request into a strict structured JSON command and write a concise, helpful, natural response.

Supported actions:
1. "send" - User wants to send or transfer money to a person or recipient (e.g. "Send $50 to John", "Hey GlobalPay, send fifty dollars to John", "Transfer 200 EUR to Marco").
   - Extract: amount (positive number), currency (3-letter code like USD, EUR, GBP, etc., default to user's base currency if unspecified or "dollars" -> USD, "euros" -> EUR, "pounds" -> GBP), recipient (name string), optional notes.
2. "add_money" - User wants to deposit/top up/add money into their wallet (e.g. "Add $50 to my wallet", "Deposit 100 USD", "Top up 200 GBP via PayPal").
   - Extract: amount, currency (default to user's base currency if "$"/unspecified), optional method ("paypal", "bank", or "card" — default to "paypal").
3. "swap" - User explicitly wants to exchange/swap currencies in their wallet (e.g. "Swap 100 USD to EUR", "Exchange 50 GBP for USD").
   - Extract: amount, fromCurrency, toCurrency.
4. "check_balance" - User asks about wallet balances (e.g. "What's my USD balance?", "Show my EUR balance", "How much money do I have?").
   - Extract: optional currency (omit if asking for all balances).
5. "convert_quote" - User asks for a currency conversion calculation or exchange rate without executing a swap (e.g. "Convert 100 USD to EUR", "How much is 50 GBP in USD?", "What is the USD to EUR rate?").
   - Extract: amount (default 1 if asking for general rate), fromCurrency, toCurrency.
6. "transaction_history" - User asks to see recent transactions or activity (e.g. "Show my recent transactions", "What did I spend in EUR?").
   - Extract: optional currency, optional limit (default 5).
7. "general_chat" - General financial advice, GlobalPay features, greeting, or clarification when required transaction fields (like amount) are missing.

CRITICAL SECURITY & ACCURACY RULES:
- Supported currency codes are ONLY: ${CURRENCY_CODES.join(', ')}.
- NEVER invent or guess wallet balances, exchange rates, or transaction records in your replyText—keep replyText brief when returning structured financial queries because the backend appends exact verified figures.
- NEVER claim a payment or transfer has been executed. For send/add_money/swap, state that you have prepared the transaction details for confirmation.
- If the user asks to send/add/swap without specifying a valid positive amount, set action to "general_chat", clarificationNeeded to true, and ask for the missing amount clearly.`;

async function callGeminiWithRetry<T>(fn: () => Promise<T>, maxAttempts = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;
      const status = (err as { status?: number })?.status;
      if (status && status >= 400 && status < 500 && status !== 429) {
        throw err;
      }
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
      }
    }
  }
  throw lastError;
}

export function validateAndNormalizeParsedCommand(
  raw: unknown,
  defaultCurrency: CurrencyCode
): ParsedAICommand {
  if (!raw || typeof raw !== 'object') {
    return {
      action: 'general_chat',
      replyText: 'I could not understand that request. Could you rephrase it?',
      clarificationNeeded: true,
    };
  }

  const obj = raw as Record<string, unknown>;
  const rawAction = typeof obj.action === 'string' ? obj.action.trim() : 'general_chat';
  const action: AIActionType = ALLOWED_ACTIONS.has(rawAction as AIActionType)
    ? (rawAction as AIActionType)
    : 'general_chat';

  const normalizeCurrency = (val: unknown): CurrencyCode | undefined => {
    if (typeof val !== 'string') return undefined;
    const upper = val.trim().toUpperCase();
    return isValidCurrencyCode(upper) ? upper : undefined;
  };

  const amount =
    typeof obj.amount === 'number' && Number.isFinite(obj.amount) && obj.amount > 0
      ? Math.round(obj.amount * 100) / 100
      : undefined;

  const currency = normalizeCurrency(obj.currency);
  const fromCurrency = normalizeCurrency(obj.fromCurrency);
  const toCurrency = normalizeCurrency(obj.toCurrency);
  const recipient = typeof obj.recipient === 'string' ? obj.recipient.trim().slice(0, 120) : undefined;
  const notes = typeof obj.notes === 'string' ? obj.notes.trim().slice(0, 200) : undefined;
  const method =
    obj.method === 'paypal' || obj.method === 'card' || obj.method === 'bank'
      ? obj.method
      : undefined;
  const limit =
    typeof obj.limit === 'number' && Number.isFinite(obj.limit) && obj.limit >= 1
      ? Math.min(20, Math.floor(obj.limit))
      : undefined;
  const replyText =
    typeof obj.replyText === 'string' && obj.replyText.trim().length > 0
      ? obj.replyText.trim().slice(0, 1000)
      : 'Here is what I found for your GlobalPay account.';

  if (action === 'send') {
    if (!amount || !recipient) {
      return {
        action: 'general_chat',
        replyText: !amount
          ? 'Please specify the amount you would like to send (for example: "Send $50 to Marco").'
          : 'Who would you like to send this money to?',
        clarificationNeeded: true,
      };
    }
    return {
      action: 'send',
      amount,
      currency: currency || fromCurrency || defaultCurrency,
      recipient,
      notes,
      replyText,
    };
  }

  if (action === 'add_money') {
    if (!amount) {
      return {
        action: 'general_chat',
        replyText: 'Please specify how much you want to add (for example: "Add $50 to my wallet" or "Deposit 100 USD").',
        clarificationNeeded: true,
      };
    }
    return {
      action: 'add_money',
      amount,
      currency: currency || toCurrency || defaultCurrency,
      method: method || 'paypal',
      replyText,
    };
  }

  if (action === 'swap') {
    const resolvedFrom = fromCurrency || currency || defaultCurrency;
    const resolvedTo = toCurrency || (resolvedFrom === 'USD' ? 'EUR' : 'USD');
    if (!amount || resolvedFrom === resolvedTo) {
      return {
        action: 'general_chat',
        replyText: !amount
          ? 'Please specify the amount and currencies to swap (for example: "Swap 100 USD to EUR").'
          : 'Please choose two different currencies to swap.',
        clarificationNeeded: true,
      };
    }
    return {
      action: 'swap',
      amount,
      fromCurrency: resolvedFrom,
      toCurrency: resolvedTo,
      replyText,
    };
  }

  if (action === 'convert_quote') {
    const resolvedFrom = fromCurrency || currency || defaultCurrency;
    const resolvedTo = toCurrency || (resolvedFrom === 'USD' ? 'EUR' : 'USD');
    return {
      action: 'convert_quote',
      amount: amount || 1,
      fromCurrency: resolvedFrom,
      toCurrency: resolvedTo,
      replyText,
    };
  }

  if (action === 'check_balance') {
    return {
      action: 'check_balance',
      currency,
      replyText,
    };
  }

  if (action === 'transaction_history') {
    return {
      action: 'transaction_history',
      currency,
      limit: limit || 5,
      replyText,
    };
  }

  return {
    action: 'general_chat',
    replyText,
    clarificationNeeded: Boolean(obj.clarificationNeeded),
  };
}

export async function processAIChatCommand(params: {
  message: string;
  history: ChatTurn[];
  wallet: WalletSnapshot;
}): Promise<AIAssistantResponse> {
  const startTime = Date.now();
  const ai = getGeminiClient();

  const recipientNames = params.wallet.recipients
    .map((r) => `${r.name} (${r.currency})`)
    .join(', ');

  const historyContext = params.history
    .slice(-4)
    .map((turn) => `${turn.role === 'user' ? 'User' : 'Assistant'}: ${turn.text}`)
    .join('\n');

  const prompt = [
    `Active User: ${params.wallet.user.name} (Base currency: ${params.wallet.user.baseCurrency})`,
    `Saved Recipients: ${recipientNames || 'None'}`,
    historyContext ? `Recent Conversation:\n${historyContext}` : '',
    `Current User Message: "${params.message}"`,
  ]
    .filter(Boolean)
    .join('\n\n');

  // Phase 1: Fast AI Model Configuration using gemini-2.5-flash with zero thinking budget for ultra-low latency
  const response = await callGeminiWithRetry(() =>
    ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        maxOutputTokens: 500,
        thinkingConfig: { thinkingBudget: 0 },
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            action: {
              type: Type.STRING,
              description:
                'One of: send, add_money, swap, check_balance, convert_quote, transaction_history, general_chat',
            },
            amount: {
              type: Type.NUMBER,
              description: 'Positive numeric amount if applicable',
            },
            currency: {
              type: Type.STRING,
              description: '3-letter ISO currency code (e.g. USD, EUR, GBP)',
            },
            fromCurrency: {
              type: Type.STRING,
              description: 'Source 3-letter ISO currency code for swap or conversion',
            },
            toCurrency: {
              type: Type.STRING,
              description: 'Target 3-letter ISO currency code for swap or conversion',
            },
            recipient: {
              type: Type.STRING,
              description: 'Recipient name for send commands',
            },
            method: {
              type: Type.STRING,
              description: 'Deposit method for add_money: paypal, bank, or card (default paypal)',
            },
            notes: {
              type: Type.STRING,
              description: 'Optional transfer memo/note',
            },
            limit: {
              type: Type.INTEGER,
              description: 'Number of transactions to list',
            },
            clarificationNeeded: {
              type: Type.BOOLEAN,
              description: 'True if required parameters are missing',
            },
            replyText: {
              type: Type.STRING,
              description: 'Concise, ultra-fast financial assistant reply to display to the user',
            },
          },
          required: ['action', 'replyText'],
        },
      },
    })
  );

  const rawJsonText = (response.text ?? '{}').trim();
  let parsedRaw: unknown;
  try {
    parsedRaw = JSON.parse(rawJsonText);
  } catch {
    parsedRaw = {
      action: 'general_chat',
      replyText: 'I received your request, could you please rephrase it with clear amount and currency details?',
    };
  }

  const parsed = validateAndNormalizeParsedCommand(parsedRaw, params.wallet.user.baseCurrency);
  const result = buildVerifiedAssistantResponse(parsed, params.wallet);
  result.source = 'gemini_fast_model';
  result.latencyMs = Date.now() - startTime;
  return result;
}

export function buildVerifiedAssistantResponse(
  parsed: ParsedAICommand,
  wallet: WalletSnapshot
): AIAssistantResponse {
  const { user, balances, transactions, recipients } = wallet;

  if (parsed.action === 'check_balance') {
    const targetCode = parsed.currency;
    if (targetCode) {
      const bal = balances[targetCode];
      const def = SUPPORTED_CURRENCIES[targetCode];
      const available = bal?.available ?? 0;
      const pending = bal?.pending ?? 0;
      const held = bal?.held ?? 0;
      return {
        parsedCommand: { action: 'check_balance', currency: targetCode },
        replyText: `Your ${def.name} (${targetCode}) available balance is ${def.symbol}${available.toLocaleString(
          undefined,
          { minimumFractionDigits: def.decimals, maximumFractionDigits: def.decimals }
        )}.`,
        requiresConfirmation: false,
        balanceSummary: [
          {
            currency: targetCode,
            name: def.name,
            symbol: def.symbol,
            flag: def.flag,
            available,
            pending,
            held,
          },
        ],
      };
    }

    const activeBalances = (Object.values(balances) as WalletBalance[])
      .filter((b) => !b.hidden || b.available > 0)
      .map((b) => {
        const def = SUPPORTED_CURRENCIES[b.currency];
        return {
          currency: b.currency,
          name: def.name,
          symbol: def.symbol,
          flag: def.flag,
          available: b.available,
          pending: b.pending,
          held: b.held,
        };
      });

    return {
      parsedCommand: { action: 'check_balance' },
      replyText: `Here are your active multi-currency wallet balances across ${activeBalances.length} currencies.`,
      requiresConfirmation: false,
      balanceSummary: activeBalances,
    };
  }

  if (parsed.action === 'convert_quote' && parsed.fromCurrency && parsed.toCurrency && parsed.amount) {
    const fromDef = SUPPORTED_CURRENCIES[parsed.fromCurrency];
    const toDef = SUPPORTED_CURRENCIES[parsed.toCurrency];
    const cachedRateEntry = getCachedExchangeRate(parsed.fromCurrency, parsed.toCurrency);
    const rate = parseFloat(cachedRateEntry.rate.toFixed(4));
    const quote = calculateSwapQuote(parsed.fromCurrency, parsed.toCurrency, parsed.amount);

    return {
      parsedCommand: {
        action: 'convert_quote',
        amount: parsed.amount,
        fromCurrency: parsed.fromCurrency,
        toCurrency: parsed.toCurrency,
      },
      intent: 'currency_conversion',
      replyText: `${fromDef.symbol}${parsed.amount.toFixed(fromDef.decimals)} ${parsed.fromCurrency} converts to ${
        toDef.symbol
      }${quote.toAmount.toLocaleString(undefined, {
        minimumFractionDigits: toDef.decimals,
        maximumFractionDigits: toDef.decimals,
      })} ${parsed.toCurrency} at the mid-market rate (1 ${parsed.fromCurrency} = ${rate} ${parsed.toCurrency}).`,
      requiresConfirmation: false,
      conversionQuote: {
        fromCurrency: parsed.fromCurrency,
        toCurrency: parsed.toCurrency,
        fromAmount: parsed.amount,
        toAmount: quote.toAmount,
        rate,
        swapFee: quote.fee.totalFee,
        fromSymbol: fromDef.symbol,
        toSymbol: toDef.symbol,
        rateTimestamp: cachedRateEntry.timestamp,
        source: cachedRateEntry.source,
      },
    };
  }

  if (parsed.action === 'transaction_history') {
    const filtered = parsed.currency
      ? transactions.filter(
          (t) => t.fromCurrency === parsed.currency || t.toCurrency === parsed.currency
        )
      : transactions;
    const recent = filtered.slice(0, parsed.limit || 5);

    return {
      parsedCommand: {
        action: 'transaction_history',
        currency: parsed.currency,
      },
      replyText:
        recent.length > 0
          ? `Here are your ${recent.length} most recent${
              parsed.currency ? ` ${parsed.currency}` : ''
            } transactions.`
          : `You have no recorded${parsed.currency ? ` ${parsed.currency}` : ''} transactions yet.`,
      requiresConfirmation: false,
      recentTransactions: recent,
    };
  }

  if (parsed.action === 'send' && parsed.amount && parsed.currency && parsed.recipient) {
    const fromCurrency = parsed.currency;
    const fromDef = SUPPORTED_CURRENCIES[fromCurrency];
    const match = resolveRecipientMatch(recipients, parsed.recipient);
    const resolvedRecipient = match.exact;

    const toCurrency: CurrencyCode = resolvedRecipient?.currency || fromCurrency;
    const quote = calculateTransferQuote(fromCurrency, toCurrency, parsed.amount);
    const totalDebit = parseFloat((parsed.amount + quote.fee.totalFee).toFixed(2));
    const available = balances[fromCurrency]?.available || 0;
    const usdEquiv = totalDebit / fromDef.rateToUSD;
    const requiresPin = usdEquiv >= user.security.requirePinAboveAmount;

    let validationError: string | undefined;
    if (user.isFrozen) {
      validationError = 'Account is currently restricted. Outgoing transfers are disabled.';
    } else if (available < totalDebit) {
      validationError = `Insufficient ${fromCurrency} balance. Available: ${fromDef.symbol}${available.toFixed(
        2
      )}, Required: ${fromDef.symbol}${totalDebit.toFixed(2)} (incl. fee).`;
    } else if (usdEquiv > user.security.dailyLimit) {
      validationError = `Exceeds your daily safety limit of $${user.security.dailyLimit}.`;
    }

    const proposal: ConfirmationProposal = {
      action: 'send',
      amount: parsed.amount,
      currency: fromCurrency,
      fromCurrency,
      toCurrency,
      receiveAmount: quote.receiveAmount,
      rate: quote.rate,
      feeTotal: quote.fee.totalFee,
      feeBreakdown: {
        conversionFee: quote.fee.currencyConversionFee,
        transferFee: quote.fee.transferFee,
        networkFee: quote.fee.networkFee,
      },
      totalDebit,
      estimatedArrival: quote.estimatedArrival,
      recipientName: resolvedRecipient ? resolvedRecipient.name : parsed.recipient,
      recipientId: resolvedRecipient?.id,
      recipientCountry: resolvedRecipient?.country,
      recipientBank: resolvedRecipient?.routingOrBank,
      recipientAccount: resolvedRecipient?.accountNumber,
      recipientNeedsSetup: !resolvedRecipient,
      recipientCandidates: !resolvedRecipient ? match.candidates : undefined,
      notes: parsed.notes,
      requiresPin,
      pinThreshold: user.security.requirePinAboveAmount,
      validationError,
    };

    return {
      parsedCommand: {
        action: 'send',
        amount: parsed.amount,
        currency: fromCurrency,
        recipient: proposal.recipientName,
      },
      replyText: resolvedRecipient
        ? `Please review and confirm your transfer of ${fromDef.symbol}${parsed.amount.toFixed(
            fromDef.decimals
          )} ${fromCurrency} to ${resolvedRecipient.name}.`
        : `"${parsed.recipient}" is not in your verified recipients list yet. Please verify or enter payout details below before confirming.`,
      requiresConfirmation: true,
      confirmationProposal: proposal,
    };
  }

  if (parsed.action === 'add_money' && parsed.amount && parsed.currency) {
    const def = SUPPORTED_CURRENCIES[parsed.currency];
    const resolvedMethod = parsed.method || 'paypal';
    const proposal: ConfirmationProposal = {
      action: 'add_money',
      amount: parsed.amount,
      currency: parsed.currency,
      fromCurrency: parsed.currency,
      toCurrency: parsed.currency,
      receiveAmount: parsed.amount,
      rate: 1.0,
      feeTotal: 0,
      feeBreakdown: { conversionFee: 0, transferFee: 0, networkFee: 0 },
      totalDebit: parsed.amount,
      method: resolvedMethod,
      requiresPin: false,
      pinThreshold: user.security.requirePinAboveAmount,
    };

    return {
      parsedCommand: {
        action: 'add_money',
        amount: parsed.amount,
        currency: parsed.currency,
      },
      replyText: `PayPal Sandbox Checkout is ready to add ${def.symbol}${parsed.amount.toFixed(
        def.decimals
      )} ${parsed.currency} to your wallet. Approve the checkout overlay to update your balance.`,
      requiresConfirmation: true,
      confirmationProposal: proposal,
    };
  }

  if (parsed.action === 'swap' && parsed.amount && parsed.fromCurrency && parsed.toCurrency) {
    const fromDef = SUPPORTED_CURRENCIES[parsed.fromCurrency];
    const toDef = SUPPORTED_CURRENCIES[parsed.toCurrency];
    const quote = calculateSwapQuote(parsed.fromCurrency, parsed.toCurrency, parsed.amount);
    const totalDebit = parseFloat((parsed.amount + quote.fee.totalFee).toFixed(2));
    const available = balances[parsed.fromCurrency]?.available || 0;

    let validationError: string | undefined;
    if (user.isFrozen) {
      validationError = 'Account is currently restricted.';
    } else if (available < totalDebit) {
      validationError = `Insufficient ${parsed.fromCurrency} balance. Available: ${
        fromDef.symbol
      }${available.toFixed(2)}, Required: ${fromDef.symbol}${totalDebit.toFixed(2)}.`;
    }

    const proposal: ConfirmationProposal = {
      action: 'swap',
      amount: parsed.amount,
      currency: parsed.fromCurrency,
      fromCurrency: parsed.fromCurrency,
      toCurrency: parsed.toCurrency,
      receiveAmount: quote.toAmount,
      rate: quote.rate,
      feeTotal: quote.fee.totalFee,
      feeBreakdown: {
        conversionFee: quote.fee.currencyConversionFee,
        transferFee: 0,
        networkFee: 0,
      },
      totalDebit,
      requiresPin: false,
      pinThreshold: user.security.requirePinAboveAmount,
      validationError,
    };

    return {
      parsedCommand: {
        action: 'swap',
        amount: parsed.amount,
        fromCurrency: parsed.fromCurrency,
        toCurrency: parsed.toCurrency,
      },
      replyText: `Please review and confirm swapping ${fromDef.symbol}${parsed.amount.toFixed(
        fromDef.decimals
      )} ${parsed.fromCurrency} into ${toDef.symbol}${quote.toAmount.toFixed(toDef.decimals)} ${
        parsed.toCurrency
      }.`,
      requiresConfirmation: true,
      confirmationProposal: proposal,
    };
  }

  return {
    parsedCommand: { action: 'general_chat' },
    replyText: parsed.replyText,
    requiresConfirmation: false,
    clarificationNeeded: Boolean(parsed.clarificationNeeded),
  };
}

export async function transcribeAudioCommand(audioBase64: string, mimeType: string): Promise<string> {
  const ai = getGeminiClient();
  const response = await callGeminiWithRetry(() =>
    ai.models.generateContent({
      model: 'gemini-3.5-transcribe',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: audioBase64,
            },
          },
          {
            text: 'Transcribe this financial voice command accurately in plain English text. Return only the spoken words.',
          },
        ],
      },
    })
  );

  return (response.text ?? '').trim();
}

function detectCurrencyTokens(text: string): CurrencyCode[] {
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
  }

  return found;
}

export function parseNaturalCommandFallback(
  message: string,
  defaultCurrency: CurrencyCode
): ParsedAICommand {
  const trimmed = message.trim();
  const amountMatch = trimmed.match(/(?:\$|€|£|₹|¥)?\s*(\d+(?:,\d{3})*(?:\.\d{1,2})?)/);
  const parsedAmount = amountMatch ? Number(amountMatch[1].replace(/,/g, '')) : undefined;
  const amount =
    typeof parsedAmount === 'number' && Number.isFinite(parsedAmount) && parsedAmount > 0
      ? Math.round(parsedAmount * 100) / 100
      : undefined;
  const currencies = detectCurrencyTokens(trimmed);

  // 1. Add Money / Deposit / Top Up -> triggers PayPal Sandbox Checkout
  if (/\b(add|deposit|top\s*up|topup|fund|load|paypal)\b/i.test(trimmed)) {
    return validateAndNormalizeParsedCommand(
      {
        action: 'add_money',
        amount,
        currency: currencies[0] || defaultCurrency,
        method: /\bbank\b/i.test(trimmed) ? 'bank' : /\bcard\b/i.test(trimmed) ? 'card' : 'paypal',
        replyText: 'Opening PayPal Sandbox Checkout for your wallet deposit.',
      },
      defaultCurrency
    );
  }

  // 2. Send Money
  if (/\b(send|transfer|pay)\b/i.test(trimmed)) {
    const toMatch = trimmed.match(/\bto\s+([a-zA-Z][a-zA-Z0-9 .'-]{0,50})/i);
    const recipient = toMatch ? toMatch[1].replace(/[.!?]+$/, '').trim() : undefined;
    return validateAndNormalizeParsedCommand(
      {
        action: 'send',
        amount,
        currency: currencies[0] || defaultCurrency,
        recipient,
        replyText: 'Preparing transfer details for your confirmation.',
      },
      defaultCurrency
    );
  }

  // 3. Swap vs Convert Quote
  if (/\b(swap|exchange)\b/i.test(trimmed)) {
    return validateAndNormalizeParsedCommand(
      {
        action: 'swap',
        amount,
        fromCurrency: currencies[0] || defaultCurrency,
        toCurrency: currencies[1] || (currencies[0] === 'EUR' ? 'USD' : 'EUR'),
        replyText: 'Preparing currency swap quote.',
      },
      defaultCurrency
    );
  }

  if (/\b(convert|rate|how much)\b/i.test(trimmed) && (currencies.length >= 2 || amount)) {
    return validateAndNormalizeParsedCommand(
      {
        action: 'convert_quote',
        amount: amount || 1,
        fromCurrency: currencies[0] || defaultCurrency,
        toCurrency: currencies[1] || (currencies[0] === 'EUR' ? 'USD' : 'EUR'),
        replyText: 'Fetching live mid-market rate.',
      },
      defaultCurrency
    );
  }

  // 4. Transaction history
  if (/\b(transactions?|history|activity|recent|spent)\b/i.test(trimmed)) {
    return validateAndNormalizeParsedCommand(
      {
        action: 'transaction_history',
        currency: currencies[0],
        limit: 5,
        replyText: 'Here is your recent transaction activity.',
      },
      defaultCurrency
    );
  }

  // 5. Balance check
  if (/\b(balance|wallet|how much do i have|holdings|funds)\b/i.test(trimmed)) {
    return validateAndNormalizeParsedCommand(
      {
        action: 'check_balance',
        currency: currencies[0],
        replyText: 'Checking your verified wallet balances.',
      },
      defaultCurrency
    );
  }

  return {
    action: 'general_chat',
    replyText:
      'I can help you add funds via PayPal Sandbox (e.g., "Add $50 to my wallet" or "Deposit 100 USD"), check balances, convert currencies, view transactions, or send money.',
    clarificationNeeded: true,
  };
}
