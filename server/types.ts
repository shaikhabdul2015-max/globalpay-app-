export type CurrencyCode =
  | 'USD'
  | 'EUR'
  | 'GBP'
  | 'INR'
  | 'AED'
  | 'JPY'
  | 'CAD'
  | 'AUD'
  | 'SGD'
  | 'THB'
  | 'CHF';

export interface CurrencyDefinition {
  code: CurrencyCode;
  name: string;
  symbol: string;
  flag: string;
  rateToUSD: number;
  decimals: number;
  country: string;
  accountDetails: {
    systemName: string;
    identifierLabel: string;
    accountNumber: string;
    routingCode: string;
    bankName: string;
  };
}

export interface WalletBalance {
  currency: CurrencyCode;
  available: number;
  pending: number;
  held: number;
  hidden: boolean;
}

export interface FeeBreakdown {
  currencyConversionFee: number;
  transferFee: number;
  paymentFee: number;
  networkFee: number;
  totalFee: number;
  feeCurrency: CurrencyCode;
}

export type TransactionType =
  | 'swap'
  | 'qr_payment'
  | 'transfer'
  | 'deposit'
  | 'withdrawal'
  | 'refund';

export type TransactionStatus =
  | 'draft'
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'refunded';

export interface Transaction {
  id: string;
  timestamp: string;
  type: TransactionType;
  status: TransactionStatus;
  title: string;
  description?: string;
  fromAmount: number;
  fromCurrency: CurrencyCode;
  toAmount: number;
  toCurrency: CurrencyCode;
  exchangeRate: number;
  fees: FeeBreakdown;
  notes?: string;
  sender: {
    name: string;
    account?: string;
  };
  recipient: {
    name: string;
    type: 'merchant' | 'bank' | 'wallet' | 'upi';
    account?: string;
    country?: string;
    category?: string;
  };
  transferDetails?: {
    payoutMethod: 'bank' | 'wallet' | 'upi';
    recipientBank?: string;
    recipientAccount?: string;
    estimatedArrival: string;
    currentStep: number;
  };
  auditTrail: Array<{
    timestamp: string;
    action: string;
    actor: string;
    details?: string;
  }>;
}

export interface DoubleEntryRecord {
  id: string;
  entryNumber: number;
  txId: string;
  timestamp: string;
  debitAccount: string;
  creditAccount: string;
  amount: number;
  currency: CurrencyCode;
  memo: string;
}

export interface Recipient {
  id: string;
  name: string;
  country: string;
  currency: CurrencyCode;
  type: 'bank' | 'wallet' | 'upi';
  accountNumber: string;
  routingOrBank: string;
  nickname?: string;
  verified: boolean;
}

export interface UserSecurityConfig {
  biometricEnabled: boolean;
  twoFactorEnabled: boolean;
  passkeyActive: boolean;
  dailyLimit: number;
  requirePinAboveAmount: number;
  pinCode: string;
}

export interface UserSnapshot {
  id: string;
  name: string;
  email: string;
  persona: string;
  baseCurrency: CurrencyCode;
  isFrozen: boolean;
  security: UserSecurityConfig;
}

export interface WalletSnapshot {
  user: UserSnapshot;
  balances: Record<CurrencyCode, WalletBalance>;
  transactions: Transaction[];
  ledger: DoubleEntryRecord[];
  recipients: Recipient[];
}

export type AIActionType =
  | 'send'
  | 'add_money'
  | 'swap'
  | 'check_balance'
  | 'convert_quote'
  | 'transaction_history'
  | 'general_chat';

export interface ParsedAICommand {
  action: AIActionType;
  amount?: number;
  currency?: CurrencyCode;
  fromCurrency?: CurrencyCode;
  toCurrency?: CurrencyCode;
  recipient?: string;
  method?: 'paypal' | 'bank' | 'card';
  notes?: string;
  limit?: number;
  replyText: string;
  clarificationNeeded?: boolean;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  requestId: string;
  userId: string;
  action: string;
  status: 'allowed' | 'denied' | 'success' | 'error';
  details: Record<string, unknown>;
  ip: string;
}
