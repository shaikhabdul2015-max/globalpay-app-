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

export interface Currency {
  code: CurrencyCode;
  name: string;
  symbol: string;
  flag: string;
  rateToUSD: number; // 1 USD = rateToUSD [Currency]
  decimals: number;
  country: string;
  accountDetails: {
    systemName: string; // e.g. "ACH / Fedwire", "SEPA / IBAN", "Faster Payments", "UPI / IMPS"
    identifierLabel: string; // e.g. "Routing & Account", "IBAN & BIC", "Sort Code & Account", "UPI ID / VPA"
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

export type QRStandard = 'EMVCo' | 'UPI' | 'PromptPay' | 'SGQR' | 'Pix' | 'Universal';

export interface FeeBreakdown {
  currencyConversionFee: number;
  transferFee: number;
  paymentFee: number;
  networkFee: number;
  totalFee: number;
  feeCurrency: CurrencyCode;
}

export interface Transaction {
  id: string; // e.g. "TX-984210"
  timestamp: string;
  type: TransactionType;
  status: TransactionStatus;
  title: string;
  description?: string;
  fromAmount: number;
  fromCurrency: CurrencyCode;
  toAmount: number;
  toCurrency: CurrencyCode;
  exchangeRate: number; // 1 fromCurrency = exchangeRate toCurrency
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
  qrData?: {
    standard: QRStandard;
    merchantId: string;
    terminalId?: string;
    location?: string;
    rawPayload?: string;
  };
  transferDetails?: {
    payoutMethod: 'bank' | 'wallet' | 'upi';
    recipientBank?: string;
    recipientAccount?: string;
    estimatedArrival: string;
    currentStep: number; // 1: Initiated, 2: FX Converted, 3: Banking Partner Sent, 4: Delivered
  };
  failureReason?: string;
  refundedTxId?: string;
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

export type KYCStatus =
  | 'not_started'
  | 'pending'
  | 'verified'
  | 'additional_review'
  | 'rejected';

export interface KYCData {
  status: KYCStatus;
  fullName: string;
  dateOfBirth: string;
  country: string;
  address: string;
  idType: 'passport' | 'national_id' | 'drivers_license';
  idNumber: string;
  idDocumentUploaded: boolean;
  selfieVerified: boolean;
  submittedAt?: string;
  reviewedAt?: string;
  reviewerNotes?: string;
  requiredInfoReason?: string;
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

export interface SecuritySession {
  id: string;
  deviceName: string;
  deviceType: 'mobile' | 'desktop';
  location: string;
  ipAddress: string;
  lastActive: string;
  isCurrent: boolean;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: 'payment' | 'transfer' | 'swap' | 'kyc' | 'security' | 'system' | 'transaction' | 'rate_alert';
  timestamp: string;
  read: boolean;
  relatedTxId?: string;
}

export interface SampleMerchantQR {
  id: string;
  name: string;
  category: string;
  location: string;
  country: string;
  currency: CurrencyCode;
  requestedAmount: number;
  standard: QRStandard;
  terminalId: string;
  payload?: string;
  flag: string;
}

export type UserPersonaId = 'tourist' | 'freelancer' | 'student' | 'business';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  persona: UserPersonaId;
  personaTitle: string;
  avatar: string;
  baseCurrency: CurrencyCode;
  kyc: KYCData;
  security: {
    biometricEnabled: boolean;
    twoFactorEnabled: boolean;
    passkeyActive: boolean;
    dailyLimit: number;
    requirePinAboveAmount: number;
    pinCode: string;
  };
  sessions: SecuritySession[];
  isFrozen: boolean;
}

export type NavigationTab = 'home' | 'wallet' | 'activity' | 'kyc' | 'profile' | 'admin';
