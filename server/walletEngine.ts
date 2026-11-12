import { SUPPORTED_CURRENCIES } from './currencies.ts';
import type {
  CurrencyCode,
  DoubleEntryRecord,
  FeeBreakdown,
  Recipient,
  Transaction,
  WalletBalance,
  WalletSnapshot,
} from './types.ts';

const walletStore = new Map<string, WalletSnapshot>();

export function syncWalletSnapshot(userId: string, snapshot: WalletSnapshot): WalletSnapshot {
  walletStore.set(userId, {
    ...snapshot,
    user: { ...snapshot.user, id: userId },
  });
  return walletStore.get(userId)!;
}

export function getWalletSnapshot(userId: string): WalletSnapshot | null {
  return walletStore.get(userId) ?? null;
}

export interface CachedRateEntry {
  rate: number;
  timestamp: string;
  source: string;
}

const fxCache = new Map<string, { rate: number; timestamp: string; expiresAt: number }>();
const FX_CACHE_TTL_MS = 60_000; // 60s short-lived cache for market quote stability

export function getCachedExchangeRate(from: CurrencyCode, to: CurrencyCode): CachedRateEntry {
  const now = Date.now();
  const cacheKey = `${from}_${to}`;
  const cached = fxCache.get(cacheKey);

  if (cached && cached.expiresAt > now) {
    return {
      rate: cached.rate,
      timestamp: cached.timestamp,
      source: 'GlobalPay Real-Time FX Feed (Cached)',
    };
  }

  const rate = getExchangeRate(from, to);
  const timestamp = new Date().toISOString();
  fxCache.set(cacheKey, {
    rate,
    timestamp,
    expiresAt: now + FX_CACHE_TTL_MS,
  });

  return {
    rate,
    timestamp,
    source: 'GlobalPay Real-Time FX Feed',
  };
}

export function getExchangeRate(from: CurrencyCode, to: CurrencyCode): number {
  if (from === to) return 1.0;
  const fromDef = SUPPORTED_CURRENCIES[from];
  const toDef = SUPPORTED_CURRENCIES[to];
  const rateInUSD = 1 / fromDef.rateToUSD;
  return rateInUSD * toDef.rateToUSD;
}

export function calculateSwapQuote(from: CurrencyCode, to: CurrencyCode, amount: number) {
  const rate = getExchangeRate(from, to);
  const conversionFee = Math.max(0.35, amount * 0.0045);
  const fee: FeeBreakdown = {
    currencyConversionFee: parseFloat(conversionFee.toFixed(2)),
    transferFee: 0,
    paymentFee: 0,
    networkFee: 0,
    totalFee: parseFloat(conversionFee.toFixed(2)),
    feeCurrency: from,
  };
  const toAmount = Math.max(0, amount) * rate;
  return {
    fromAmount: amount,
    toAmount: parseFloat(toAmount.toFixed(SUPPORTED_CURRENCIES[to].decimals)),
    rate: parseFloat(rate.toFixed(4)),
    fee,
    effectiveRate: parseFloat(rate.toFixed(4)),
  };
}

export function calculateTransferQuote(from: CurrencyCode, to: CurrencyCode, amount: number) {
  const rate = getExchangeRate(from, to);
  const conversionFee = amount * 0.003;
  const transferFee = 1.0;
  const networkFee = 0.5;
  const totalFee = conversionFee + transferFee + networkFee;

  const fee: FeeBreakdown = {
    currencyConversionFee: parseFloat(conversionFee.toFixed(2)),
    transferFee,
    paymentFee: 0,
    networkFee,
    totalFee: parseFloat(totalFee.toFixed(2)),
    feeCurrency: from,
  };

  const receiveAmount = amount * rate;
  const estimatedArrival =
    to === 'EUR'
      ? 'Instant (SEPA Instant)'
      : to === 'GBP'
      ? 'Instant (Faster Payments)'
      : to === 'INR'
      ? 'Instant (UPI / IMPS)'
      : '1 - 4 hours (Local Clearing Partner)';

  return {
    sendAmount: amount,
    receiveAmount: parseFloat(receiveAmount.toFixed(SUPPORTED_CURRENCIES[to].decimals)),
    rate: parseFloat(rate.toFixed(4)),
    fee,
    estimatedArrival,
  };
}

export function resolveRecipientMatch(recipients: Recipient[], query: string): {
  exact: Recipient | null;
  candidates: Recipient[];
} {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return { exact: null, candidates: [] };

  const exactId = recipients.find((r) => r.id.toLowerCase() === normalized);
  if (exactId) return { exact: exactId, candidates: [exactId] };

  const exactName = recipients.find(
    (r) =>
      r.name.toLowerCase() === normalized ||
      (r.nickname && r.nickname.toLowerCase() === normalized)
  );
  if (exactName) return { exact: exactName, candidates: [exactName] };

  const partialMatches = recipients.filter((r) => {
    const firstName = r.name.toLowerCase().split(' ')[0];
    return (
      firstName === normalized ||
      r.name.toLowerCase().includes(normalized) ||
      (r.nickname && r.nickname.toLowerCase().includes(normalized))
    );
  });

  if (partialMatches.length === 1) {
    return { exact: partialMatches[0], candidates: partialMatches };
  }

  return { exact: null, candidates: partialMatches };
}

export function executeAuthorizedTransfer(params: {
  userId: string;
  recipientId?: string;
  newRecipient?: Omit<Recipient, 'id' | 'verified'>;
  fromCurrency: CurrencyCode;
  amount: number;
  notes?: string;
  pin?: string;
}): {
  transaction: Transaction;
  balances: Record<CurrencyCode, WalletBalance>;
  ledgerEntries: DoubleEntryRecord[];
  addedRecipient?: Recipient;
} {
  const snapshot = getWalletSnapshot(params.userId);
  if (!snapshot) {
    throw new WalletOperationError(404, 'Wallet session not initialized. Please reload your wallet.');
  }

  if (snapshot.user.isFrozen) {
    throw new WalletOperationError(403, 'Your account is currently restricted. Please contact support.');
  }

  let targetRecipient: Recipient | undefined;
  let addedRecipient: Recipient | undefined;

  if (params.recipientId) {
    targetRecipient = snapshot.recipients.find((r) => r.id === params.recipientId);
  }

  if (!targetRecipient && params.newRecipient) {
    addedRecipient = {
      ...params.newRecipient,
      id: `rec-${Date.now()}`,
      verified: true,
    };
    targetRecipient = addedRecipient;
    snapshot.recipients = [addedRecipient, ...snapshot.recipients];
  }

  if (!targetRecipient) {
    throw new WalletOperationError(400, 'Recipient could not be resolved. Please select or add a verified recipient.');
  }

  const quote = calculateTransferQuote(params.fromCurrency, targetRecipient.currency, params.amount);
  const totalDebit = parseFloat((params.amount + quote.fee.totalFee).toFixed(2));
  const available = snapshot.balances[params.fromCurrency]?.available || 0;

  if (available < totalDebit) {
    const sym = SUPPORTED_CURRENCIES[params.fromCurrency].symbol;
    throw new WalletOperationError(
      400,
      `Insufficient ${params.fromCurrency} balance. Required: ${sym}${totalDebit.toFixed(
        2
      )} (including ${sym}${quote.fee.totalFee.toFixed(2)} fee), Available: ${sym}${available.toFixed(2)}.`
    );
  }

  // Enforce daily safety limit in USD equivalent
  const usdEquivalent = totalDebit / SUPPORTED_CURRENCIES[params.fromCurrency].rateToUSD;
  if (usdEquivalent > snapshot.user.security.dailyLimit) {
    throw new WalletOperationError(
      403,
      `Transfer exceeds your daily safety limit of $${snapshot.user.security.dailyLimit}.`
    );
  }

  // Enforce PIN above configured threshold
  if (usdEquivalent >= snapshot.user.security.requirePinAboveAmount) {
    if (!params.pin || params.pin !== snapshot.user.security.pinCode) {
      throw new WalletOperationError(
        403,
        `Security PIN verification required for transfers of $${snapshot.user.security.requirePinAboveAmount} or more.`
      );
    }
  }

  const txId = `TX-${Math.floor(100000 + Math.random() * 900000)}`;
  const now = new Date().toISOString();

  const newTx: Transaction = {
    id: txId,
    timestamp: now,
    type: 'transfer',
    status: 'completed',
    title: `Transfer to ${targetRecipient.name}`,
    description: params.notes || `Cross-border transfer to ${targetRecipient.country}`,
    fromAmount: params.amount,
    fromCurrency: params.fromCurrency,
    toAmount: quote.receiveAmount,
    toCurrency: targetRecipient.currency,
    exchangeRate: quote.rate,
    fees: quote.fee,
    sender: { name: snapshot.user.name },
    recipient: {
      name: targetRecipient.name,
      type: targetRecipient.type,
      account: targetRecipient.accountNumber,
      country: targetRecipient.country,
    },
    transferDetails: {
      payoutMethod: targetRecipient.type,
      recipientBank: targetRecipient.routingOrBank,
      recipientAccount: targetRecipient.accountNumber,
      estimatedArrival: quote.estimatedArrival,
      currentStep: 4,
    },
    notes: params.notes,
    auditTrail: [
      { timestamp: now, action: 'TRANSFER_INITIATED', actor: snapshot.user.name },
      { timestamp: now, action: 'SANCTIONS_SCREENING_PASSED', actor: 'COMPLIANCE_ENGINE' },
      { timestamp: now, action: 'PARTNER_RAILS_DISPATCHED', actor: 'SETTLEMENT_RAILS' },
      { timestamp: now, action: 'FUNDS_DELIVERED', actor: 'CLEARING_SYSTEM' },
    ],
  };

  const entryNum = snapshot.ledger.length + 1000;
  const newLedgerEntries: DoubleEntryRecord[] = [
    {
      id: `LED-${entryNum + 1}`,
      entryNumber: entryNum + 1,
      txId,
      timestamp: now,
      debitAccount: `USER_WALLET_${params.fromCurrency}`,
      creditAccount: `CROSS_BORDER_ESCROW_${params.fromCurrency}`,
      amount: params.amount,
      currency: params.fromCurrency,
      memo: `Transfer principal to ${targetRecipient.name}`,
    },
    {
      id: `LED-${entryNum + 2}`,
      entryNumber: entryNum + 2,
      txId,
      timestamp: now,
      debitAccount: `USER_WALLET_${params.fromCurrency}`,
      creditAccount: 'GLOBALPAY_TRANSFER_FEES',
      amount: quote.fee.totalFee,
      currency: params.fromCurrency,
      memo: 'Transparent cross-border transfer fees',
    },
  ];

  snapshot.balances = {
    ...snapshot.balances,
    [params.fromCurrency]: {
      ...snapshot.balances[params.fromCurrency],
      available: parseFloat((available - totalDebit).toFixed(2)),
    },
  };
  snapshot.transactions = [newTx, ...snapshot.transactions];
  snapshot.ledger = [...snapshot.ledger, ...newLedgerEntries];

  return {
    transaction: newTx,
    balances: snapshot.balances,
    ledgerEntries: newLedgerEntries,
    addedRecipient,
  };
}

export function executeAuthorizedTopUp(params: {
  userId: string;
  currency: CurrencyCode;
  amount: number;
  method: string;
}): {
  transaction: Transaction;
  balances: Record<CurrencyCode, WalletBalance>;
  ledgerEntries: DoubleEntryRecord[];
} {
  const snapshot = getWalletSnapshot(params.userId);
  if (!snapshot) {
    throw new WalletOperationError(404, 'Wallet session not initialized. Please reload your wallet.');
  }

  const txId = `TX-${Math.floor(100000 + Math.random() * 900000)}`;
  const now = new Date().toISOString();

  const newTx: Transaction = {
    id: txId,
    timestamp: now,
    type: 'deposit',
    status: 'completed',
    title: `Deposit: ${params.currency} Added`,
    description: `Added via ${params.method}`,
    fromAmount: params.amount,
    fromCurrency: params.currency,
    toAmount: params.amount,
    toCurrency: params.currency,
    exchangeRate: 1.0,
    fees: {
      currencyConversionFee: 0,
      transferFee: 0,
      paymentFee: 0,
      networkFee: 0,
      totalFee: 0,
      feeCurrency: params.currency,
    },
    sender: { name: params.method },
    recipient: { name: `${snapshot.user.name} (${params.currency} Wallet)`, type: 'wallet' },
    auditTrail: [
      { timestamp: now, action: 'TOPUP_INITIATED', actor: snapshot.user.name },
      { timestamp: now, action: 'FUNDS_CONFIRMED', actor: 'BANKING_GATEWAY' },
    ],
  };

  const entryNum = snapshot.ledger.length + 1000;
  const ledgerEntry: DoubleEntryRecord = {
    id: `LED-${entryNum + 1}`,
    entryNumber: entryNum + 1,
    txId,
    timestamp: now,
    debitAccount: `EXTERNAL_FUNDING_${params.method.replace(/\s+/g, '_').toUpperCase()}`,
    creditAccount: `USER_WALLET_${params.currency}`,
    amount: params.amount,
    currency: params.currency,
    memo: `Wallet deposit credited in ${params.currency}`,
  };

  const prevBal = snapshot.balances[params.currency];
  snapshot.balances = {
    ...snapshot.balances,
    [params.currency]: {
      currency: params.currency,
      available: parseFloat(((prevBal?.available || 0) + params.amount).toFixed(2)),
      pending: prevBal?.pending || 0,
      held: prevBal?.held || 0,
      hidden: false,
    },
  };
  snapshot.transactions = [newTx, ...snapshot.transactions];
  snapshot.ledger = [...snapshot.ledger, ledgerEntry];

  return {
    transaction: newTx,
    balances: snapshot.balances,
    ledgerEntries: [ledgerEntry],
  };
}

export function executeAuthorizedSwap(params: {
  userId: string;
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  amount: number;
}): {
  transaction: Transaction;
  balances: Record<CurrencyCode, WalletBalance>;
  ledgerEntries: DoubleEntryRecord[];
} {
  const snapshot = getWalletSnapshot(params.userId);
  if (!snapshot) {
    throw new WalletOperationError(404, 'Wallet session not initialized. Please reload your wallet.');
  }

  if (snapshot.user.isFrozen) {
    throw new WalletOperationError(403, 'Your account is currently restricted. Please contact support.');
  }

  if (params.fromCurrency === params.toCurrency) {
    throw new WalletOperationError(400, 'Source and target currencies must be different.');
  }

  const quote = calculateSwapQuote(params.fromCurrency, params.toCurrency, params.amount);
  const totalDebit = parseFloat((params.amount + quote.fee.totalFee).toFixed(2));
  const currentFromBal = snapshot.balances[params.fromCurrency]?.available || 0;

  if (currentFromBal < totalDebit) {
    const sym = SUPPORTED_CURRENCIES[params.fromCurrency].symbol;
    throw new WalletOperationError(
      400,
      `Insufficient ${params.fromCurrency} balance. Available: ${sym}${currentFromBal.toFixed(
        2
      )}, Required: ${sym}${totalDebit.toFixed(2)} (including ${sym}${quote.fee.totalFee.toFixed(2)} fee).`
    );
  }

  const txId = `TX-${Math.floor(100000 + Math.random() * 900000)}`;
  const now = new Date().toISOString();

  const newTx: Transaction = {
    id: txId,
    timestamp: now,
    type: 'swap',
    status: 'completed',
    title: `Swap: ${params.fromCurrency} → ${params.toCurrency}`,
    description: `Converted ${SUPPORTED_CURRENCIES[params.fromCurrency].symbol}${params.amount.toFixed(2)} to ${
      SUPPORTED_CURRENCIES[params.toCurrency].symbol
    }${quote.toAmount.toFixed(SUPPORTED_CURRENCIES[params.toCurrency].decimals)}`,
    fromAmount: params.amount,
    fromCurrency: params.fromCurrency,
    toAmount: quote.toAmount,
    toCurrency: params.toCurrency,
    exchangeRate: quote.rate,
    fees: quote.fee,
    sender: { name: snapshot.user.name, account: `${params.fromCurrency} Wallet` },
    recipient: { name: `${params.toCurrency} Multi-Currency Wallet`, type: 'wallet' },
    auditTrail: [
      { timestamp: now, action: 'SWAP_ORDER_CREATED', actor: snapshot.user.name },
      { timestamp: now, action: 'FX_RATE_LOCKED', actor: 'FX_ENGINE', details: `1 ${params.fromCurrency} = ${quote.rate} ${params.toCurrency}` },
      { timestamp: now, action: 'DOUBLE_ENTRY_SETTLED', actor: 'LEDGER_ENGINE' },
    ],
  };

  const entryNum = snapshot.ledger.length + 1000;
  const newLedgerEntries: DoubleEntryRecord[] = [
    {
      id: `LED-${entryNum + 1}`,
      entryNumber: entryNum + 1,
      txId,
      timestamp: now,
      debitAccount: `USER_WALLET_${params.fromCurrency}`,
      creditAccount: `FX_POOL_${params.fromCurrency}`,
      amount: params.amount,
      currency: params.fromCurrency,
      memo: `Swap principal deduction ${params.fromCurrency}`,
    },
    {
      id: `LED-${entryNum + 2}`,
      entryNumber: entryNum + 2,
      txId,
      timestamp: now,
      debitAccount: `USER_WALLET_${params.fromCurrency}`,
      creditAccount: 'GLOBALPAY_REVENUE_FEE',
      amount: quote.fee.totalFee,
      currency: params.fromCurrency,
      memo: 'Swap transparent service fee',
    },
    {
      id: `LED-${entryNum + 3}`,
      entryNumber: entryNum + 3,
      txId,
      timestamp: now,
      debitAccount: `FX_POOL_${params.toCurrency}`,
      creditAccount: `USER_WALLET_${params.toCurrency}`,
      amount: quote.toAmount,
      currency: params.toCurrency,
      memo: `Swap received amount credit ${params.toCurrency}`,
    },
  ];

  const prevTo = snapshot.balances[params.toCurrency];
  snapshot.balances = {
    ...snapshot.balances,
    [params.fromCurrency]: {
      ...snapshot.balances[params.fromCurrency],
      available: parseFloat((currentFromBal - totalDebit).toFixed(2)),
    },
    [params.toCurrency]: {
      currency: params.toCurrency,
      available: parseFloat(((prevTo?.available || 0) + quote.toAmount).toFixed(SUPPORTED_CURRENCIES[params.toCurrency].decimals)),
      pending: prevTo?.pending || 0,
      held: prevTo?.held || 0,
      hidden: false,
    },
  };
  snapshot.transactions = [newTx, ...snapshot.transactions];
  snapshot.ledger = [...snapshot.ledger, ...newLedgerEntries];

  return {
    transaction: newTx,
    balances: snapshot.balances,
    ledgerEntries: newLedgerEntries,
  };
}

export function getTransactionById(userId: string, txId: string): Transaction | null {
  const snapshot = getWalletSnapshot(userId);
  if (!snapshot) return null;
  return snapshot.transactions.find((t) => t.id === txId) ?? null;
}

export class WalletOperationError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}
