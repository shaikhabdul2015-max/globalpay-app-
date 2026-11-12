import type {
  CurrencyCode,
  DoubleEntryRecord,
  Recipient,
  Transaction,
  UserProfile,
  WalletBalance,
} from '../types';

export interface ClientWalletSnapshot {
  user: {
    id: string;
    name: string;
    email: string;
    persona: string;
    baseCurrency: CurrencyCode;
    isFrozen: boolean;
    security: UserProfile['security'];
  };
  balances: Record<CurrencyCode, WalletBalance>;
  transactions: Transaction[];
  ledger: DoubleEntryRecord[];
  recipients: Recipient[];
}

export interface ChatTurnPayload {
  role: 'user' | 'assistant';
  text: string;
}

export interface AIConfirmationProposal {
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

export interface AIBalanceSummaryItem {
  currency: CurrencyCode;
  name: string;
  symbol: string;
  flag: string;
  available: number;
  pending: number;
  held: number;
}

export interface AIConversionQuote {
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  fromAmount: number;
  toAmount: number;
  rate: number;
  swapFee: number;
  fromSymbol: string;
  toSymbol: string;
}

export interface AIAssistantResponsePayload {
  parsedCommand: {
    action:
      | 'send'
      | 'add_money'
      | 'swap'
      | 'check_balance'
      | 'convert_quote'
      | 'transaction_history'
      | 'general_chat';
    amount?: number;
    currency?: CurrencyCode;
    fromCurrency?: CurrencyCode;
    toCurrency?: CurrencyCode;
    recipient?: string;
  };
  replyText: string;
  requiresConfirmation: boolean;
  confirmationProposal?: AIConfirmationProposal;
  balanceSummary?: AIBalanceSummaryItem[];
  conversionQuote?: AIConversionQuote;
  recentTransactions?: Transaction[];
}

export interface BackendExecutionResult {
  transaction: Transaction;
  balances: Record<CurrencyCode, WalletBalance>;
  ledgerEntries: DoubleEntryRecord[];
  addedRecipient?: Recipient;
}

let cachedToken: string | null = null;
let cachedUserId: string | null = null;

export function buildWalletSnapshot(params: {
  currentUser: UserProfile;
  baseCurrency: CurrencyCode;
  balances: Record<CurrencyCode, WalletBalance>;
  transactions: Transaction[];
  ledger: DoubleEntryRecord[];
  recipients: Recipient[];
}): ClientWalletSnapshot {
  return {
    user: {
      id: params.currentUser.id,
      name: params.currentUser.name,
      email: params.currentUser.email,
      persona: params.currentUser.persona,
      baseCurrency: params.baseCurrency,
      isFrozen: params.currentUser.isFrozen,
      security: params.currentUser.security,
    },
    balances: params.balances,
    transactions: params.transactions,
    ledger: params.ledger,
    recipients: params.recipients,
  };
}

async function ensureSession(snapshot: ClientWalletSnapshot, forceRefresh = false): Promise<string> {
  if (cachedToken && cachedUserId === snapshot.user.id && !forceRefresh) {
    return cachedToken;
  }

  const res = await fetch('/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ snapshot }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to authenticate GlobalPay session.');
  }

  const data = (await res.json()) as { token: string; userId: string };
  cachedToken = data.token;
  cachedUserId = data.userId;
  return data.token;
}

async function authorizedFetch<T>(
  url: string,
  options: RequestInit,
  snapshot: ClientWalletSnapshot
): Promise<T> {
  let token = await ensureSession(snapshot);

  const doRequest = (bearer: string) =>
    fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
        Authorization: `Bearer ${bearer}`,
      },
    });

  let res = await doRequest(token);

  if (res.status === 401) {
    token = await ensureSession(snapshot, true);
    res = await doRequest(token);
  }

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload.error || `Request failed with status ${res.status}`);
  }

  return payload as T;
}

export async function syncWalletToBackend(snapshot: ClientWalletSnapshot): Promise<void> {
  await ensureSession(snapshot);
  await authorizedFetch<{ ok: boolean }>(
    '/api/wallet/sync',
    {
      method: 'POST',
      body: JSON.stringify({ snapshot }),
    },
    snapshot
  );
}

export async function sendAIMessage(
  message: string,
  history: ChatTurnPayload[],
  snapshot: ClientWalletSnapshot
): Promise<AIAssistantResponsePayload> {
  return authorizedFetch<AIAssistantResponsePayload>(
    '/api/ai/chat',
    {
      method: 'POST',
      body: JSON.stringify({ message, history, snapshot }),
    },
    snapshot
  );
}

export async function transcribeAudioOnBackend(
  audioBase64: string,
  mimeType: string,
  snapshot: ClientWalletSnapshot
): Promise<{ transcript: string }> {
  return authorizedFetch<{ transcript: string }>(
    '/api/ai/transcribe',
    {
      method: 'POST',
      body: JSON.stringify({ audioBase64, mimeType }),
    },
    snapshot
  );
}

export async function executeConfirmedTransfer(
  params: {
    recipientId?: string;
    newRecipient?: {
      name: string;
      country: string;
      currency: CurrencyCode;
      type: 'bank' | 'wallet' | 'upi';
      accountNumber: string;
      routingOrBank: string;
    };
    fromCurrency: CurrencyCode;
    amount: number;
    notes?: string;
    pin?: string;
    idempotencyKey: string;
  },
  snapshot: ClientWalletSnapshot
): Promise<BackendExecutionResult> {
  return authorizedFetch<BackendExecutionResult>(
    '/api/wallet/transfer',
    {
      method: 'POST',
      headers: { 'Idempotency-Key': params.idempotencyKey },
      body: JSON.stringify({
        recipientId: params.recipientId,
        newRecipient: params.newRecipient,
        fromCurrency: params.fromCurrency,
        amount: params.amount,
        notes: params.notes,
        pin: params.pin,
      }),
    },
    snapshot
  );
}

export async function executeConfirmedTopUp(
  params: {
    currency: CurrencyCode;
    amount: number;
    method: string;
    idempotencyKey: string;
  },
  snapshot: ClientWalletSnapshot
): Promise<BackendExecutionResult> {
  return authorizedFetch<BackendExecutionResult>(
    '/api/wallet/topup',
    {
      method: 'POST',
      headers: { 'Idempotency-Key': params.idempotencyKey },
      body: JSON.stringify({
        currency: params.currency,
        amount: params.amount,
        method: params.method,
      }),
    },
    snapshot
  );
}

export async function executeConfirmedSwap(
  params: {
    fromCurrency: CurrencyCode;
    toCurrency: CurrencyCode;
    amount: number;
    idempotencyKey: string;
  },
  snapshot: ClientWalletSnapshot
): Promise<BackendExecutionResult> {
  return authorizedFetch<BackendExecutionResult>(
    '/api/wallet/swap',
    {
      method: 'POST',
      headers: { 'Idempotency-Key': params.idempotencyKey },
      body: JSON.stringify({
        fromCurrency: params.fromCurrency,
        toCurrency: params.toCurrency,
        amount: params.amount,
      }),
    },
    snapshot
  );
}

export async function verifyTransactionOnBackend(
  txId: string,
  snapshot: ClientWalletSnapshot
): Promise<{ transaction: Transaction; verified: boolean }> {
  return authorizedFetch<{ transaction: Transaction; verified: boolean }>(
    `/api/wallet/transactions/${encodeURIComponent(txId)}`,
    { method: 'GET' },
    snapshot
  );
}

export async function fetchWalletStateFromBackend(snapshot: ClientWalletSnapshot): Promise<{
  balances: Record<CurrencyCode, WalletBalance>;
  transactions: Transaction[];
  recipients: Recipient[];
}> {
  return authorizedFetch<{
    balances: Record<CurrencyCode, WalletBalance>;
    transactions: Transaction[];
    recipients: Recipient[];
  }>('/api/wallet/state', { method: 'GET' }, snapshot);
}
