import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import {
  CurrencyCode,
  WalletBalance,
  Transaction,
  DoubleEntryRecord,
  UserProfile,
  FeeBreakdown,
  Recipient,
  AppNotification,
  KYCStatus,
  SampleMerchantQR,
  NavigationTab,
} from '../types';
import { SUPPORTED_CURRENCIES, DEMO_PERSONAS, PRESET_RECIPIENTS, SAMPLE_MERCHANT_QRS } from '../data/currencies';
import {
  buildWalletSnapshot,
  syncWalletToBackend,
  type BackendExecutionResult,
  type ClientWalletSnapshot,
} from '../services/aiWalletApi';

interface PaymentContextType {
  currentUser: UserProfile;
  switchPersona: (personaId: string) => void;
  updateUser: (updated: Partial<UserProfile>) => void;
  balances: Record<CurrencyCode, WalletBalance>;
  transactions: Transaction[];
  ledger: DoubleEntryRecord[];
  recipients: Recipient[];
  notifications: AppNotification[];
  unreadNotificationCount: number;
  markNotificationAsRead: (id: string) => void;
  markAllNotificationsAsRead: () => void;
  
  // Currency operations
  baseCurrency: CurrencyCode;
  setBaseCurrency: (code: CurrencyCode) => void;
  totalPortfolioInBase: { amount: number; symbol: string; code: CurrencyCode };
  secondaryPortfolioEquivalent: { amount: number; symbol: string; code: CurrencyCode };
  addCurrencyToWallet: (code: CurrencyCode) => void;
  toggleHideCurrency: (code: CurrencyCode) => void;
  
  // FX Engine & Calculations
  getExchangeRate: (from: CurrencyCode, to: CurrencyCode) => number;
  calculateSwapQuote: (from: CurrencyCode, to: CurrencyCode, amount: number) => {
    fromAmount: number;
    toAmount: number;
    rate: number;
    fee: FeeBreakdown;
    effectiveRate: number;
  };
  calculateTransferQuote: (from: CurrencyCode, to: CurrencyCode, amount: number) => {
    sendAmount: number;
    receiveAmount: number;
    rate: number;
    fee: FeeBreakdown;
    estimatedArrival: string;
  };
  calculateQRQuote: (fromCurrency: CurrencyCode, merchantCurrency: CurrencyCode, merchantAmount: number) => {
    merchantAmount: number;
    merchantCurrency: CurrencyCode;
    userDebitAmount: number;
    fromCurrency: CurrencyCode;
    rate: number;
    fee: FeeBreakdown;
  };

  // Execution actions
  executeSwap: (from: CurrencyCode, to: CurrencyCode, amount: number) => Promise<Transaction>;
  executeQRPayment: (merchant: SampleMerchantQR, fromCurrency: CurrencyCode, customAmount?: number) => Promise<Transaction>;
  executeTransfer: (recipient: Recipient, fromCurrency: CurrencyCode, amount: number, notes?: string) => Promise<Transaction>;
  executeTopUp: (currency: CurrencyCode, amount: number, method: string) => Promise<Transaction>;
  executeRefund: (txId: string, reason: string) => Promise<Transaction>;

  // Management actions
  addRecipient: (recipient: Omit<Recipient, 'id' | 'verified'>) => Recipient;
  deleteRecipient: (id: string) => void;
  submitKYC: (details: Partial<UserProfile['kyc']>) => void;
  adminReviewKYC: (userId: string, newStatus: KYCStatus, reason?: string) => void;
  toggleAccountFreeze: (isFrozen: boolean) => void;
  
  // Security checks
  verifySecurityPin: (enteredPin: string) => boolean;
  
  // Navigation Tab
  currentTab: NavigationTab;
  setCurrentTab: (tab: NavigationTab) => void;

  // Active Modals & Views
  activeModal: 'swap' | 'qr_scan' | 'scan_qr' | 'send' | 'add_money' | 'receipt' | 'notifications' | 'kyc_flow' | 'auth' | null;
  selectedTxForReceipt: Transaction | null;
  activeReceipt: Transaction | null;
  closeReceipt: () => void;
  openModal: (modal: 'swap' | 'qr_scan' | 'scan_qr' | 'send' | 'add_money' | 'receipt' | 'notifications' | 'kyc_flow' | 'auth') => void;
  closeModal: () => void;
  viewReceipt: (tx: Transaction) => void;

  // Backend AI & Wallet Synchronization
  getWalletSnapshot: () => ClientWalletSnapshot;
  applyBackendExecution: (result: BackendExecutionResult) => void;
  isAIChatOpen: boolean;
  setIsAIChatOpen: (open: boolean) => void;
  toggleAIChat: () => void;
}

const STORAGE_KEY = 'globalpay_mvp_state_v1';

const PaymentContext = createContext<PaymentContextType | undefined>(undefined);

// Initial balances for Alex Rivera (matches FR-14 wireframe)
const INITIAL_BALANCES: Record<CurrencyCode, WalletBalance> = {
  USD: { currency: 'USD', available: 1250.00, pending: 0, held: 0, hidden: false },
  EUR: { currency: 'EUR', available: 620.40, pending: 0, held: 0, hidden: false },
  GBP: { currency: 'GBP', available: 350.00, pending: 0, held: 0, hidden: false },
  INR: { currency: 'INR', available: 25000.00, pending: 0, held: 0, hidden: false },
  AED: { currency: 'AED', available: 1500.00, pending: 0, held: 0, hidden: false },
  JPY: { currency: 'JPY', available: 0, pending: 0, held: 0, hidden: true },
  CAD: { currency: 'CAD', available: 0, pending: 0, held: 0, hidden: true },
  AUD: { currency: 'AUD', available: 0, pending: 0, held: 0, hidden: true },
  SGD: { currency: 'SGD', available: 0, pending: 0, held: 0, hidden: true },
  THB: { currency: 'THB', available: 0, pending: 0, held: 0, hidden: true },
  CHF: { currency: 'CHF', available: 0, pending: 0, held: 0, hidden: true },
};

// Initial transactions (matches FR-14 wireframe)
const INITIAL_TRANSACTIONS: Transaction[] = [
  {
    id: 'TX-891042',
    timestamp: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
    type: 'qr_payment',
    status: 'completed',
    title: 'Blue Tokai Coffee & Bakery',
    description: 'International QR Payment via UPI',
    fromAmount: 4.20,
    fromCurrency: 'USD',
    toAmount: 350,
    toCurrency: 'INR',
    exchangeRate: 85.34,
    fees: {
      currencyConversionFee: 0.10,
      transferFee: 0,
      paymentFee: 0.10,
      networkFee: 0,
      totalFee: 0.20,
      feeCurrency: 'USD',
    },
    sender: { name: 'Alex Rivera' },
    recipient: {
      name: 'Blue Tokai Coffee Roasters',
      type: 'merchant',
      category: 'Cafe & Dining',
      country: 'India',
    },
    qrData: {
      standard: 'UPI',
      merchantId: 'bluetokai@icici',
      location: 'New Delhi, India',
    },
    auditTrail: [
      { timestamp: new Date(Date.now() - 1000 * 60 * 35).toISOString(), action: 'QR_SCANNED', actor: 'Alex Rivera' },
      { timestamp: new Date(Date.now() - 1000 * 60 * 34).toISOString(), action: 'FX_LOCKED', actor: 'FX_ENGINE' },
      { timestamp: new Date(Date.now() - 1000 * 60 * 33).toISOString(), action: 'COMPLETED', actor: 'PAYMENT_GATEWAY' },
    ],
  },
  {
    id: 'TX-887419',
    timestamp: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    type: 'swap',
    status: 'completed',
    title: 'Currency Swap: USD → EUR',
    description: 'Instant multi-currency wallet exchange',
    fromAmount: 100.00,
    fromCurrency: 'USD',
    toAmount: 91.20,
    toCurrency: 'EUR',
    exchangeRate: 0.912,
    fees: {
      currencyConversionFee: 0.50,
      transferFee: 0,
      paymentFee: 0,
      networkFee: 0,
      totalFee: 0.50,
      feeCurrency: 'USD',
    },
    sender: { name: 'Alex Rivera' },
    recipient: { name: 'EUR Multi-Currency Wallet', type: 'wallet' },
    auditTrail: [
      { timestamp: new Date(Date.now() - 1000 * 60 * 180).toISOString(), action: 'SWAP_INITIATED', actor: 'Alex Rivera' },
      { timestamp: new Date(Date.now() - 1000 * 60 * 179).toISOString(), action: 'LEDGER_SETTLED', actor: 'DOUBLE_ENTRY_ENGINE' },
    ],
  },
  {
    id: 'TX-882103',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    type: 'deposit',
    status: 'completed',
    title: 'Wallet Deposit: USD Bank Transfer',
    description: 'Top-up from Chase Checking (...3921)',
    fromAmount: 500.00,
    fromCurrency: 'USD',
    toAmount: 500.00,
    toCurrency: 'USD',
    exchangeRate: 1.0,
    fees: {
      currencyConversionFee: 0,
      transferFee: 0,
      paymentFee: 0,
      networkFee: 0,
      totalFee: 0,
      feeCurrency: 'USD',
    },
    sender: { name: 'Chase Bank N.A.' },
    recipient: { name: 'Alex Rivera (USD Wallet)', type: 'wallet' },
    auditTrail: [
      { timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), action: 'DEPOSIT_CREDITED', actor: 'ACH_NETWORK' },
    ],
  },
  {
    id: 'TX-879012',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    type: 'transfer',
    status: 'completed',
    title: 'Transfer to Marco Rossi',
    description: 'Apartment booking deposit Rome',
    fromAmount: 320.00,
    fromCurrency: 'USD',
    toAmount: 290.50,
    toCurrency: 'EUR',
    exchangeRate: 0.912,
    fees: {
      currencyConversionFee: 0.96,
      transferFee: 1.00,
      paymentFee: 0,
      networkFee: 0.50,
      totalFee: 2.46,
      feeCurrency: 'USD',
    },
    sender: { name: 'Alex Rivera' },
    recipient: {
      name: 'Marco Rossi',
      type: 'bank',
      country: 'Italy',
      account: 'IT60 X054 2811 ... 0456',
    },
    transferDetails: {
      payoutMethod: 'bank',
      recipientBank: 'UniCredit Banca',
      recipientAccount: 'IT60 X054 2811 ... 0456',
      estimatedArrival: 'Arrived via SEPA Instant',
      currentStep: 4,
    },
    auditTrail: [
      { timestamp: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(), action: 'TRANSFER_INITIATED', actor: 'Alex Rivera' },
      { timestamp: new Date(Date.now() - 1000 * 60 * 60 * 47).toISOString(), action: 'SEPA_CLEARED', actor: 'CLEARING_SYSTEM' },
    ],
  },
];

// Initial double-entry records
const INITIAL_LEDGER: DoubleEntryRecord[] = [
  {
    id: 'LED-001',
    entryNumber: 1001,
    txId: 'TX-882103',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    debitAccount: 'EXTERNAL_BANK_SETTLEMENT_USD',
    creditAccount: 'USER_WALLET_USD',
    amount: 500.0,
    currency: 'USD',
    memo: 'ACH Top-up funds credited to Alex Rivera',
  },
  {
    id: 'LED-002',
    entryNumber: 1002,
    txId: 'TX-887419',
    timestamp: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    debitAccount: 'USER_WALLET_USD',
    creditAccount: 'FX_POOL_USD',
    amount: 100.0,
    currency: 'USD',
    memo: 'Currency swap USD surrendered',
  },
  {
    id: 'LED-003',
    entryNumber: 1003,
    txId: 'TX-887419',
    timestamp: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    debitAccount: 'USER_WALLET_USD',
    creditAccount: 'GLOBALPAY_REVENUE_FEE',
    amount: 0.50,
    currency: 'USD',
    memo: 'Transparent swap service fee',
  },
  {
    id: 'LED-004',
    entryNumber: 1004,
    txId: 'TX-887419',
    timestamp: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    debitAccount: 'FX_POOL_EUR',
    creditAccount: 'USER_WALLET_EUR',
    amount: 91.20,
    currency: 'EUR',
    memo: 'Currency swap EUR delivered to user wallet',
  },
  {
    id: 'LED-005',
    entryNumber: 1005,
    txId: 'TX-891042',
    timestamp: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
    debitAccount: 'USER_WALLET_USD',
    creditAccount: 'MERCHANT_SETTLEMENT_INR',
    amount: 4.20,
    currency: 'USD',
    memo: 'QR merchant payment for Blue Tokai Coffee (₹350)',
  },
];

const INITIAL_NOTIFICATIONS: AppNotification[] = [
  {
    id: 'notif-1',
    title: 'Payment Successful',
    message: 'Paid ₹350 INR ($4.20 USD) to Blue Tokai Coffee Roasters.',
    type: 'payment',
    timestamp: '35 minutes ago',
    read: false,
    relatedTxId: 'TX-891042',
  },
  {
    id: 'notif-2',
    title: 'Currency Swapped',
    message: 'Exchanged $100 USD for €91.20 EUR. Fee: $0.50 USD.',
    type: 'swap',
    timestamp: '3 hours ago',
    read: true,
    relatedTxId: 'TX-887419',
  },
  {
    id: 'notif-3',
    title: 'KYC Verified',
    message: 'Your identity has been fully verified. International limits active up to $5,000/day.',
    type: 'kyc',
    timestamp: 'Yesterday',
    read: true,
  },
];

export const PaymentProvider: React.FC<{ children: ReactNode; initialAIChatOpen?: boolean }> = ({
  children,
  initialAIChatOpen = false,
}) => {
  const [currentUser, setCurrentUser] = useState<UserProfile>(DEMO_PERSONAS.tourist);
  const [balances, setBalances] = useState<Record<CurrencyCode, WalletBalance>>(INITIAL_BALANCES);
  const [transactions, setTransactions] = useState<Transaction[]>(INITIAL_TRANSACTIONS);
  const [ledger, setLedger] = useState<DoubleEntryRecord[]>(INITIAL_LEDGER);
  const [recipients, setRecipients] = useState<Recipient[]>(PRESET_RECIPIENTS);
  const [notifications, setNotifications] = useState<AppNotification[]>(INITIAL_NOTIFICATIONS);
  const [baseCurrency, setBaseCurrency] = useState<CurrencyCode>('USD');
  const [currentTab, setCurrentTab] = useState<NavigationTab>('home');

  // Modals state
  const [activeModal, setActiveModal] = useState<
    'swap' | 'qr_scan' | 'scan_qr' | 'send' | 'add_money' | 'receipt' | 'notifications' | 'kyc_flow' | 'auth' | null
  >(null);
  const [selectedTxForReceipt, setSelectedTxForReceipt] = useState<Transaction | null>(null);
  const [isAIChatOpen, setIsAIChatOpen] = useState<boolean>(initialAIChatOpen);
  const toggleAIChat = () => setIsAIChatOpen((prev) => !prev);

  // Load from localStorage if present
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.currentUser) setCurrentUser(parsed.currentUser);
        if (parsed.balances) setBalances(parsed.balances);
        if (parsed.transactions) setTransactions(parsed.transactions);
        if (parsed.ledger) setLedger(parsed.ledger);
        if (parsed.recipients) setRecipients(parsed.recipients);
        if (parsed.notifications) setNotifications(parsed.notifications);
        if (parsed.baseCurrency) setBaseCurrency(parsed.baseCurrency);
      }
    } catch {
      // Ignore parse errors and keep initial
    }
  }, []);

  // Save to localStorage and sync authoritative snapshot to backend on changes
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          currentUser,
          balances,
          transactions,
          ledger,
          recipients,
          notifications,
          baseCurrency,
        })
      );
    } catch {
      // ignore
    }

    const snapshot = buildWalletSnapshot({
      currentUser,
      baseCurrency,
      balances,
      transactions,
      ledger,
      recipients,
    });
    syncWalletToBackend(snapshot).catch(() => {
      // Keep UI resilient if backend is temporarily unreachable
    });
  }, [currentUser, balances, transactions, ledger, recipients, notifications, baseCurrency]);

  const switchPersona = (personaId: string) => {
    const persona = DEMO_PERSONAS[personaId];
    if (persona) {
      setCurrentUser(persona);
      setBaseCurrency(persona.baseCurrency);
      // Adjust balances to match persona if switching
      if (personaId === 'tourist') {
        setBalances(INITIAL_BALANCES);
      } else if (personaId === 'freelancer') {
        setBalances({
          ...INITIAL_BALANCES,
          USD: { currency: 'USD', available: 3420.0, pending: 150, held: 0, hidden: false },
          EUR: { currency: 'EUR', available: 1850.0, pending: 0, held: 0, hidden: false },
          GBP: { currency: 'GBP', available: 980.0, pending: 0, held: 0, hidden: false },
        });
      } else if (personaId === 'student') {
        setBalances({
          ...INITIAL_BALANCES,
          CAD: { currency: 'CAD', available: 620.0, pending: 0, held: 0, hidden: false },
          USD: { currency: 'USD', available: 850.0, pending: 0, held: 0, hidden: false },
          JPY: { currency: 'JPY', available: 140000.0, pending: 0, held: 0, hidden: false },
        });
      } else if (personaId === 'business') {
        setBalances({
          ...INITIAL_BALANCES,
          USD: { currency: 'USD', available: 14200.0, pending: 800, held: 200, hidden: false },
          EUR: { currency: 'EUR', available: 8500.0, pending: 0, held: 0, hidden: false },
          AED: { currency: 'AED', available: 12000.0, pending: 0, held: 0, hidden: false },
          SGD: { currency: 'SGD', available: 4500.0, pending: 0, held: 0, hidden: false },
        });
      }
    }
  };

  const updateUser = (updated: Partial<UserProfile>) => {
    setCurrentUser((prev) => ({ ...prev, ...updated }));
  };

  // FX Rate lookup
  const getExchangeRate = (from: CurrencyCode, to: CurrencyCode): number => {
    if (from === to) return 1.0;
    const fromDef = SUPPORTED_CURRENCIES[from];
    const toDef = SUPPORTED_CURRENCIES[to];
    // 1 from = (1 / fromDef.rateToUSD) * toDef.rateToUSD
    const rateInUSD = 1 / fromDef.rateToUSD;
    return rateInUSD * toDef.rateToUSD;
  };

  // Portfolio total conversion
  const totalPortfolioInBase = useMemo(() => {
    let totalUSD = 0;
    (Object.values(balances) as WalletBalance[]).forEach((bal) => {
      const cur = SUPPORTED_CURRENCIES[bal.currency];
      const usdValue = (bal.available + bal.pending) / cur.rateToUSD;
      totalUSD += usdValue;
    });

    const targetDef = SUPPORTED_CURRENCIES[baseCurrency];
    const convertedAmount = totalUSD * targetDef.rateToUSD;

    return {
      amount: convertedAmount,
      symbol: targetDef.symbol,
      code: baseCurrency,
    };
  }, [balances, baseCurrency]);

  // Secondary equivalent (e.g. INR equivalent if base is USD, or USD equivalent if base is not USD)
  const secondaryPortfolioEquivalent = useMemo(() => {
    const secondaryCode: CurrencyCode = baseCurrency === 'USD' ? 'INR' : 'USD';
    const targetDef = SUPPORTED_CURRENCIES[secondaryCode];
    let totalUSD = 0;
    (Object.values(balances) as WalletBalance[]).forEach((bal) => {
      const cur = SUPPORTED_CURRENCIES[bal.currency];
      totalUSD += (bal.available + bal.pending) / cur.rateToUSD;
    });
    const convertedAmount = totalUSD * targetDef.rateToUSD;
    return {
      amount: convertedAmount,
      symbol: targetDef.symbol,
      code: secondaryCode,
    };
  }, [balances, baseCurrency]);

  // Unread notifications
  const unreadNotificationCount = useMemo(() => {
    return notifications.filter((n) => !n.read).length;
  }, [notifications]);

  const markNotificationAsRead = (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const markAllNotificationsAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const addCurrencyToWallet = (code: CurrencyCode) => {
    setBalances((prev) => ({
      ...prev,
      [code]: {
        currency: code,
        available: prev[code]?.available || 0,
        pending: prev[code]?.pending || 0,
        held: prev[code]?.held || 0,
        hidden: false,
      },
    }));
  };

  const toggleHideCurrency = (code: CurrencyCode) => {
    setBalances((prev) => ({
      ...prev,
      [code]: {
        ...prev[code],
        hidden: !prev[code]?.hidden,
      },
    }));
  };

  // Transparent Fee Calculations
  const calculateSwapQuote = (from: CurrencyCode, to: CurrencyCode, amount: number) => {
    const rate = getExchangeRate(from, to);
    // Transparent flat/percentage fee: 0.45% of fromAmount with minimum 0.35 in fromCurrency eq
    const conversionFee = Math.max(0.35, amount * 0.0045);
    const fee: FeeBreakdown = {
      currencyConversionFee: conversionFee,
      transferFee: 0,
      paymentFee: 0,
      networkFee: 0,
      totalFee: conversionFee,
      feeCurrency: from,
    };
    const effectiveFromAmount = Math.max(0, amount);
    const toAmount = effectiveFromAmount * rate;

    return {
      fromAmount: amount,
      toAmount: parseFloat(toAmount.toFixed(SUPPORTED_CURRENCIES[to].decimals)),
      rate: parseFloat(rate.toFixed(4)),
      fee,
      effectiveRate: parseFloat(rate.toFixed(4)),
    };
  };

  const calculateTransferQuote = (from: CurrencyCode, to: CurrencyCode, amount: number) => {
    const rate = getExchangeRate(from, to);
    // Transparent breakdown:
    // Transfer fee: $1.00 flat
    // FX conversion fee: 0.3%
    // Network/partner fee: $0.50
    const conversionFee = amount * 0.003;
    const transferFee = 1.0;
    const networkFee = 0.5;
    const totalFee = conversionFee + transferFee + networkFee;

    const fee: FeeBreakdown = {
      currencyConversionFee: parseFloat(conversionFee.toFixed(2)),
      transferFee: transferFee,
      paymentFee: 0,
      networkFee: networkFee,
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
  };

  const calculateQRQuote = (fromCurrency: CurrencyCode, merchantCurrency: CurrencyCode, merchantAmount: number) => {
    // 1 merchantCurrency = rateInFrom fromCurrency
    const rateFromMerchantToUser = getExchangeRate(merchantCurrency, fromCurrency);
    const rawDebit = merchantAmount * rateFromMerchantToUser;
    const paymentFee = 0.20; // $0.20 transparent payment fee as in FRD example
    const conversionFee = rawDebit * 0.002;
    const totalFee = paymentFee + conversionFee;

    const fee: FeeBreakdown = {
      currencyConversionFee: parseFloat(conversionFee.toFixed(2)),
      transferFee: 0,
      paymentFee: paymentFee,
      networkFee: 0,
      totalFee: parseFloat(totalFee.toFixed(2)),
      feeCurrency: fromCurrency,
    };

    const userDebitAmount = parseFloat((rawDebit + totalFee).toFixed(2));
    const rate = getExchangeRate(fromCurrency, merchantCurrency);

    return {
      merchantAmount,
      merchantCurrency,
      userDebitAmount,
      fromCurrency,
      rate: parseFloat(rate.toFixed(4)),
      fee,
    };
  };

  // Execution: Instant Swap (FR-04)
  const executeSwap = async (from: CurrencyCode, to: CurrencyCode, amount: number): Promise<Transaction> => {
    if (currentUser.isFrozen) {
      throw new Error('Your account is currently restricted. Please contact support.');
    }
    const currentFromBal = balances[from]?.available || 0;
    const quote = calculateSwapQuote(from, to, amount);
    const totalDebit = amount + quote.fee.totalFee;

    if (currentFromBal < totalDebit) {
      throw new Error(
        `Insufficient ${from} balance. You have ${SUPPORTED_CURRENCIES[from].symbol}${currentFromBal.toFixed(
          2
        )}, but ${SUPPORTED_CURRENCIES[from].symbol}${totalDebit.toFixed(2)} is required (including $${quote.fee.totalFee.toFixed(2)} fee).`
      );
    }

    const txId = `TX-${Math.floor(100000 + Math.random() * 900000)}`;
    const now = new Date().toISOString();

    const newTx: Transaction = {
      id: txId,
      timestamp: now,
      type: 'swap',
      status: 'completed',
      title: `Swap: ${from} → ${to}`,
      description: `Converted ${SUPPORTED_CURRENCIES[from].symbol}${amount.toFixed(2)} to ${
        SUPPORTED_CURRENCIES[to].symbol
      }${quote.toAmount.toFixed(2)}`,
      fromAmount: amount,
      fromCurrency: from,
      toAmount: quote.toAmount,
      toCurrency: to,
      exchangeRate: quote.rate,
      fees: quote.fee,
      sender: { name: currentUser.name, account: `${from} Wallet` },
      recipient: { name: `${to} Multi-Currency Wallet`, type: 'wallet' },
      auditTrail: [
        { timestamp: now, action: 'SWAP_ORDER_CREATED', actor: currentUser.name },
        { timestamp: now, action: 'FX_RATE_LOCKED', actor: 'FX_ENGINE', details: `1 ${from} = ${quote.rate} ${to}` },
        { timestamp: now, action: 'DOUBLE_ENTRY_SETTLED', actor: 'LEDGER_ENGINE' },
      ],
    };

    // Update Double-Entry Ledger
    const entryNum = ledger.length + 1000;
    const newLedgerEntries: DoubleEntryRecord[] = [
      {
        id: `LED-${entryNum + 1}`,
        entryNumber: entryNum + 1,
        txId,
        timestamp: now,
        debitAccount: `USER_WALLET_${from}`,
        creditAccount: `FX_POOL_${from}`,
        amount,
        currency: from,
        memo: `Swap principal deduction ${from}`,
      },
      {
        id: `LED-${entryNum + 2}`,
        entryNumber: entryNum + 2,
        txId,
        timestamp: now,
        debitAccount: `USER_WALLET_${from}`,
        creditAccount: `GLOBALPAY_REVENUE_FEE`,
        amount: quote.fee.totalFee,
        currency: from,
        memo: `Swap transparent service fee`,
      },
      {
        id: `LED-${entryNum + 3}`,
        entryNumber: entryNum + 3,
        txId,
        timestamp: now,
        debitAccount: `FX_POOL_${to}`,
        creditAccount: `USER_WALLET_${to}`,
        amount: quote.toAmount,
        currency: to,
        memo: `Swap received amount credit ${to}`,
      },
    ];

    // Update balances
    setBalances((prev) => ({
      ...prev,
      [from]: {
        ...prev[from],
        available: prev[from].available - totalDebit,
      },
      [to]: {
        currency: to,
        available: (prev[to]?.available || 0) + quote.toAmount,
        pending: prev[to]?.pending || 0,
        held: prev[to]?.held || 0,
        hidden: false,
      },
    }));

    setTransactions((prev) => [newTx, ...prev]);
    setLedger((prev) => [...prev, ...newLedgerEntries]);

    // Add Notification
    setNotifications((prev) => [
      {
        id: `notif-${Date.now()}`,
        title: 'Currency Swap Completed',
        message: `Exchanged ${SUPPORTED_CURRENCIES[from].symbol}${amount.toFixed(2)} for ${
          SUPPORTED_CURRENCIES[to].symbol
        }${quote.toAmount.toFixed(2)}. Rate: ${quote.rate}`,
        type: 'swap',
        timestamp: 'Just now',
        read: false,
        relatedTxId: txId,
      },
      ...prev,
    ]);

    return newTx;
  };

  // Execution: Tourist QR Payment (FR-05)
  const executeQRPayment = async (
    merchant: SampleMerchantQR,
    fromCurrency: CurrencyCode,
    customAmount?: number
  ): Promise<Transaction> => {
    if (currentUser.isFrozen) {
      throw new Error('Your account is currently restricted. Please contact support.');
    }
    const merchantAmount = customAmount ?? merchant.requestedAmount;
    const quote = calculateQRQuote(fromCurrency, merchant.currency, merchantAmount);
    const available = balances[fromCurrency]?.available || 0;

    if (available < quote.userDebitAmount) {
      throw new Error(
        `Insufficient ${fromCurrency} balance. Required: ${SUPPORTED_CURRENCIES[fromCurrency].symbol}${quote.userDebitAmount.toFixed(
          2
        )}, Available: ${SUPPORTED_CURRENCIES[fromCurrency].symbol}${available.toFixed(2)}`
      );
    }

    const txId = `TX-${Math.floor(100000 + Math.random() * 900000)}`;
    const now = new Date().toISOString();

    const newTx: Transaction = {
      id: txId,
      timestamp: now,
      type: 'qr_payment',
      status: 'completed',
      title: merchant.name,
      description: `Tourist QR payment via ${merchant.standard}`,
      fromAmount: quote.userDebitAmount - quote.fee.totalFee,
      fromCurrency,
      toAmount: merchantAmount,
      toCurrency: merchant.currency,
      exchangeRate: quote.rate,
      fees: quote.fee,
      sender: { name: currentUser.name },
      recipient: {
        name: merchant.name,
        type: 'merchant',
        category: merchant.category,
        country: merchant.location,
      },
      qrData: {
        standard: merchant.standard,
        merchantId: merchant.terminalId,
        location: merchant.location,
        rawPayload: merchant.payload,
      },
      auditTrail: [
        { timestamp: now, action: 'QR_SCANNED', actor: currentUser.name, details: `Scanned ${merchant.standard} QR` },
        { timestamp: now, action: 'MERCHANT_VERIFIED', actor: 'COMPLIANCE_ENGINE' },
        { timestamp: now, action: 'USER_CONFIRMED', actor: currentUser.name },
        { timestamp: now, action: 'SETTLED', actor: 'MERCHANT_GATEWAY' },
      ],
    };

    // Update Double Entry Ledger
    const entryNum = ledger.length + 1000;
    const newLedgerEntries: DoubleEntryRecord[] = [
      {
        id: `LED-${entryNum + 1}`,
        entryNumber: entryNum + 1,
        txId,
        timestamp: now,
        debitAccount: `USER_WALLET_${fromCurrency}`,
        creditAccount: `MERCHANT_CLEARING_${merchant.currency}`,
        amount: quote.userDebitAmount - quote.fee.totalFee,
        currency: fromCurrency,
        memo: `QR Merchant payment settlement for ${merchant.name}`,
      },
      {
        id: `LED-${entryNum + 2}`,
        entryNumber: entryNum + 2,
        txId,
        timestamp: now,
        debitAccount: `USER_WALLET_${fromCurrency}`,
        creditAccount: `GLOBALPAY_REVENUE_FEE`,
        amount: quote.fee.totalFee,
        currency: fromCurrency,
        memo: `Transparent QR payment fee ($0.20)`,
      },
    ];

    setBalances((prev) => ({
      ...prev,
      [fromCurrency]: {
        ...prev[fromCurrency],
        available: prev[fromCurrency].available - quote.userDebitAmount,
      },
    }));

    setTransactions((prev) => [newTx, ...prev]);
    setLedger((prev) => [...prev, ...newLedgerEntries]);

    setNotifications((prev) => [
      {
        id: `notif-${Date.now()}`,
        title: 'Payment Successful',
        message: `Paid ${SUPPORTED_CURRENCIES[merchant.currency].symbol}${merchantAmount} (${
          SUPPORTED_CURRENCIES[fromCurrency].symbol
        }${quote.userDebitAmount.toFixed(2)}) to ${merchant.name}.`,
        type: 'payment',
        timestamp: 'Just now',
        read: false,
        relatedTxId: txId,
      },
      ...prev,
    ]);

    return newTx;
  };

  // Execution: Cross-Border Transfer (FR-06)
  const executeTransfer = async (
    recipient: Recipient,
    fromCurrency: CurrencyCode,
    amount: number,
    notes?: string
  ): Promise<Transaction> => {
    if (currentUser.isFrozen) {
      throw new Error('Your account is currently restricted. Please contact support.');
    }
    const quote = calculateTransferQuote(fromCurrency, recipient.currency, amount);
    const totalDebit = amount + quote.fee.totalFee;
    const available = balances[fromCurrency]?.available || 0;

    if (available < totalDebit) {
      throw new Error(
        `Insufficient ${fromCurrency} balance. Required: ${SUPPORTED_CURRENCIES[fromCurrency].symbol}${totalDebit.toFixed(
          2
        )} (including transparent fees), Available: ${SUPPORTED_CURRENCIES[fromCurrency].symbol}${available.toFixed(2)}`
      );
    }

    // Daily limit check
    if (totalDebit > currentUser.security.dailyLimit) {
      throw new Error(
        `Transfer exceeds your daily safety limit of $${currentUser.security.dailyLimit}. Update limit in Security settings.`
      );
    }

    const txId = `TX-${Math.floor(100000 + Math.random() * 900000)}`;
    const now = new Date().toISOString();

    const newTx: Transaction = {
      id: txId,
      timestamp: now,
      type: 'transfer',
      status: 'completed',
      title: `Transfer to ${recipient.name}`,
      description: notes || `Cross-border transfer to ${recipient.country}`,
      fromAmount: amount,
      fromCurrency,
      toAmount: quote.receiveAmount,
      toCurrency: recipient.currency,
      exchangeRate: quote.rate,
      fees: quote.fee,
      sender: { name: currentUser.name },
      recipient: {
        name: recipient.name,
        type: recipient.type,
        account: recipient.accountNumber,
        country: recipient.country,
      },
      transferDetails: {
        payoutMethod: recipient.type,
        recipientBank: recipient.routingOrBank,
        recipientAccount: recipient.accountNumber,
        estimatedArrival: quote.estimatedArrival,
        currentStep: 4,
      },
      notes,
      auditTrail: [
        { timestamp: now, action: 'TRANSFER_INITIATED', actor: currentUser.name },
        { timestamp: now, action: 'SANCTIONS_SCREENING_PASSED', actor: 'COMPLIANCE_ENGINE' },
        { timestamp: now, action: 'PARTNER_RAILS_DISPATCHED', actor: 'SETTLEMENT_RAILS' },
        { timestamp: now, action: 'FUNDS_DELIVERED', actor: 'CLEARING_SYSTEM' },
      ],
    };

    // Update Double-Entry Ledger
    const entryNum = ledger.length + 1000;
    const newLedgerEntries: DoubleEntryRecord[] = [
      {
        id: `LED-${entryNum + 1}`,
        entryNumber: entryNum + 1,
        txId,
        timestamp: now,
        debitAccount: `USER_WALLET_${fromCurrency}`,
        creditAccount: `CROSS_BORDER_ESCROW_${fromCurrency}`,
        amount,
        currency: fromCurrency,
        memo: `Transfer principal to ${recipient.name}`,
      },
      {
        id: `LED-${entryNum + 2}`,
        entryNumber: entryNum + 2,
        txId,
        timestamp: now,
        debitAccount: `USER_WALLET_${fromCurrency}`,
        creditAccount: `GLOBALPAY_TRANSFER_FEES`,
        amount: quote.fee.totalFee,
        currency: fromCurrency,
        memo: `Transparent cross-border transfer fees`,
      },
    ];

    setBalances((prev) => ({
      ...prev,
      [fromCurrency]: {
        ...prev[fromCurrency],
        available: prev[fromCurrency].available - totalDebit,
      },
    }));

    setTransactions((prev) => [newTx, ...prev]);
    setLedger((prev) => [...prev, ...newLedgerEntries]);

    setNotifications((prev) => [
      {
        id: `notif-${Date.now()}`,
        title: 'Transfer Completed',
        message: `Sent ${SUPPORTED_CURRENCIES[recipient.currency].symbol}${quote.receiveAmount.toFixed(2)} to ${
          recipient.name
        }. Total paid: ${SUPPORTED_CURRENCIES[fromCurrency].symbol}${totalDebit.toFixed(2)}.`,
        type: 'transfer',
        timestamp: 'Just now',
        read: false,
        relatedTxId: txId,
      },
      ...prev,
    ]);

    return newTx;
  };

  // Top-Up / Deposit
  const executeTopUp = async (currency: CurrencyCode, amount: number, method: string): Promise<Transaction> => {
    const txId = `TX-${Math.floor(100000 + Math.random() * 900000)}`;
    const now = new Date().toISOString();

    const newTx: Transaction = {
      id: txId,
      timestamp: now,
      type: 'deposit',
      status: 'completed',
      title: `Deposit: ${currency} Added`,
      description: `Added via ${method}`,
      fromAmount: amount,
      fromCurrency: currency,
      toAmount: amount,
      toCurrency: currency,
      exchangeRate: 1.0,
      fees: {
        currencyConversionFee: 0,
        transferFee: 0,
        paymentFee: 0,
        networkFee: 0,
        totalFee: 0,
        feeCurrency: currency,
      },
      sender: { name: method },
      recipient: { name: `${currentUser.name} (${currency} Wallet)`, type: 'wallet' },
      auditTrail: [
        { timestamp: now, action: 'TOPUP_INITIATED', actor: currentUser.name },
        { timestamp: now, action: 'FUNDS_CONFIRMED', actor: 'BANKING_GATEWAY' },
      ],
    };

    const entryNum = ledger.length + 1000;
    const newLedgerEntry: DoubleEntryRecord = {
      id: `LED-${entryNum + 1}`,
      entryNumber: entryNum + 1,
      txId,
      timestamp: now,
      debitAccount: `EXTERNAL_FUNDING_${method.replace(/\s+/g, '_').toUpperCase()}`,
      creditAccount: `USER_WALLET_${currency}`,
      amount,
      currency,
      memo: `Wallet deposit credited in ${currency}`,
    };

    setBalances((prev) => ({
      ...prev,
      [currency]: {
        currency,
        available: (prev[currency]?.available || 0) + amount,
        pending: prev[currency]?.pending || 0,
        held: prev[currency]?.held || 0,
        hidden: false,
      },
    }));

    setTransactions((prev) => [newTx, ...prev]);
    setLedger((prev) => [...prev, newLedgerEntry]);

    setNotifications((prev) => [
      {
        id: `notif-${Date.now()}`,
        title: 'Money Added',
        message: `Successfully added ${SUPPORTED_CURRENCIES[currency].symbol}${amount.toFixed(2)} to your ${currency} wallet.`,
        type: 'payment',
        timestamp: 'Just now',
        read: false,
        relatedTxId: txId,
      },
      ...prev,
    ]);

    return newTx;
  };

  // Refund execution (Admin / Failed tx recovery FR-18 & Acceptance Criteria)
  const executeRefund = async (txId: string, reason: string): Promise<Transaction> => {
    const targetTx = transactions.find((t) => t.id === txId);
    if (!targetTx) throw new Error('Transaction not found');
    if (targetTx.status === 'refunded') throw new Error('Transaction has already been refunded');

    const refundTxId = `TX-REF-${Math.floor(100000 + Math.random() * 900000)}`;
    const now = new Date().toISOString();

    const refundTx: Transaction = {
      id: refundTxId,
      timestamp: now,
      type: 'refund',
      status: 'completed',
      title: `Refund: ${targetTx.title}`,
      description: `Refund for ${targetTx.id} - ${reason}`,
      fromAmount: targetTx.fromAmount + targetTx.fees.totalFee,
      fromCurrency: targetTx.fromCurrency,
      toAmount: targetTx.fromAmount + targetTx.fees.totalFee,
      toCurrency: targetTx.fromCurrency,
      exchangeRate: 1.0,
      fees: {
        currencyConversionFee: 0,
        transferFee: 0,
        paymentFee: 0,
        networkFee: 0,
        totalFee: 0,
        feeCurrency: targetTx.fromCurrency,
      },
      sender: { name: 'GlobalPay Operations / Merchant' },
      recipient: { name: currentUser.name, type: 'wallet' },
      refundedTxId: targetTx.id,
      auditTrail: [
        { timestamp: now, action: 'REFUND_PROCESSED', actor: 'ADMIN_OPERATIONS', details: reason },
      ],
    };

    // Re-credit the user's wallet
    const refundedAmount = targetTx.fromAmount + targetTx.fees.totalFee;
    setBalances((prev) => ({
      ...prev,
      [targetTx.fromCurrency]: {
        ...prev[targetTx.fromCurrency],
        available: (prev[targetTx.fromCurrency]?.available || 0) + refundedAmount,
      },
    }));

    // Update targetTx status
    setTransactions((prev) =>
      prev.map((t) => (t.id === txId ? { ...t, status: 'refunded' as const } : t))
    );
    setTransactions((prev) => [refundTx, ...prev]);

    // Ledger record
    const entryNum = ledger.length + 1000;
    const ledgerRefund: DoubleEntryRecord = {
      id: `LED-${entryNum + 1}`,
      entryNumber: entryNum + 1,
      txId: refundTxId,
      timestamp: now,
      debitAccount: `REFUND_CLEARING_POOL`,
      creditAccount: `USER_WALLET_${targetTx.fromCurrency}`,
      amount: refundedAmount,
      currency: targetTx.fromCurrency,
      memo: `Refund credited back to user wallet for ${txId} (${reason})`,
    };
    setLedger((prev) => [...prev, ledgerRefund]);

    setNotifications((prev) => [
      {
        id: `notif-${Date.now()}`,
        title: 'Refund Processed',
        message: `Refund of ${SUPPORTED_CURRENCIES[targetTx.fromCurrency].symbol}${refundedAmount.toFixed(
          2
        )} credited back to your account.`,
        type: 'payment',
        timestamp: 'Just now',
        read: false,
        relatedTxId: refundTxId,
      },
      ...prev,
    ]);

    return refundTx;
  };

  const addRecipient = (recipientData: Omit<Recipient, 'id' | 'verified'>): Recipient => {
    const newRec: Recipient = {
      ...recipientData,
      id: `rec-${Date.now()}`,
      verified: true,
    };
    setRecipients((prev) => [newRec, ...prev]);
    return newRec;
  };

  const deleteRecipient = (id: string) => {
    setRecipients((prev) => prev.filter((r) => r.id !== id));
  };

  const submitKYC = (details: Partial<UserProfile['kyc']>) => {
    const updatedKYC = {
      ...currentUser.kyc,
      ...details,
      status: 'pending' as const,
      submittedAt: new Date().toISOString(),
    };
    setCurrentUser((prev) => ({
      ...prev,
      kyc: updatedKYC,
    }));
    setNotifications((prev) => [
      {
        id: `notif-${Date.now()}`,
        title: 'KYC Documents Submitted',
        message: 'Your verification details have been received and are being processed.',
        type: 'kyc',
        timestamp: 'Just now',
        read: false,
      },
      ...prev,
    ]);
  };

  const adminReviewKYC = (userId: string, newStatus: KYCStatus, reason?: string) => {
    setCurrentUser((prev) => ({
      ...prev,
      kyc: {
        ...prev.kyc,
        status: newStatus,
        reviewedAt: new Date().toISOString(),
        reviewerNotes: reason || (newStatus === 'verified' ? 'Automated AML/CFT check passed.' : 'Requires follow-up.'),
        requiredInfoReason: reason,
      },
    }));
    setNotifications((prev) => [
      {
        id: `notif-${Date.now()}`,
        title: `KYC Status: ${newStatus.toUpperCase().replace('_', ' ')}`,
        message:
          newStatus === 'verified'
            ? 'Congratulations! Your account is verified with full cross-border access.'
            : reason || 'Please check your KYC profile for required information.',
        type: 'kyc',
        timestamp: 'Just now',
        read: false,
      },
      ...prev,
    ]);
  };

  const toggleAccountFreeze = (isFrozen: boolean) => {
    setCurrentUser((prev) => ({ ...prev, isFrozen }));
  };

  const verifySecurityPin = (enteredPin: string) => {
    return enteredPin === currentUser.security.pinCode;
  };

  const openModal = (
    modal: 'swap' | 'qr_scan' | 'scan_qr' | 'send' | 'add_money' | 'receipt' | 'notifications' | 'kyc_flow' | 'auth'
  ) => {
    if (modal === 'kyc_flow') {
      setCurrentTab('kyc');
      return;
    }
    if (modal === 'qr_scan') {
      setActiveModal('scan_qr');
      return;
    }
    setActiveModal(modal);
  };

  const closeModal = () => {
    setActiveModal(null);
  };

  const closeReceipt = () => {
    setSelectedTxForReceipt(null);
    if (activeModal === 'receipt') {
      setActiveModal(null);
    }
  };

  const viewReceipt = (tx: Transaction) => {
    setSelectedTxForReceipt(tx);
    setActiveModal('receipt');
  };

  const getWalletSnapshot = (): ClientWalletSnapshot => {
    return buildWalletSnapshot({
      currentUser,
      baseCurrency,
      balances,
      transactions,
      ledger,
      recipients,
    });
  };

  const applyBackendExecution = (result: BackendExecutionResult) => {
    setBalances(result.balances);
    setTransactions((prev) => {
      if (prev.some((t) => t.id === result.transaction.id)) return prev;
      return [result.transaction, ...prev];
    });
    setLedger((prev) => [...prev, ...result.ledgerEntries]);
    if (result.addedRecipient) {
      setRecipients((prev) => {
        if (prev.some((r) => r.id === result.addedRecipient!.id)) return prev;
        return [result.addedRecipient!, ...prev];
      });
    }

    const tx = result.transaction;
    const fromDef = SUPPORTED_CURRENCIES[tx.fromCurrency];
    const toDef = SUPPORTED_CURRENCIES[tx.toCurrency];
    const notifTitle =
      tx.type === 'deposit'
        ? 'Money Added via GlobalPay AI'
        : tx.type === 'swap'
        ? 'Currency Swap Completed'
        : 'Transfer Completed';
    const notifMessage =
      tx.type === 'deposit'
        ? `Added ${fromDef.symbol}${tx.fromAmount.toFixed(fromDef.decimals)} to your ${tx.fromCurrency} wallet.`
        : tx.type === 'swap'
        ? `Exchanged ${fromDef.symbol}${tx.fromAmount.toFixed(fromDef.decimals)} for ${toDef.symbol}${tx.toAmount.toFixed(
            toDef.decimals
          )}.`
        : `Sent ${toDef.symbol}${tx.toAmount.toFixed(toDef.decimals)} to ${tx.recipient.name}.`;

    setNotifications((prev) => [
      {
        id: `notif-${Date.now()}`,
        title: notifTitle,
        message: notifMessage,
        type: tx.type === 'swap' ? 'swap' : tx.type === 'transfer' ? 'transfer' : 'payment',
        timestamp: 'Just now',
        read: false,
        relatedTxId: tx.id,
      },
      ...prev,
    ]);
  };

  return (
    <PaymentContext.Provider
      value={{
        currentUser,
        switchPersona,
        updateUser,
        balances,
        transactions,
        ledger,
        recipients,
        notifications,
        unreadNotificationCount,
        markNotificationAsRead,
        markAllNotificationsAsRead,
        baseCurrency,
        setBaseCurrency,
        totalPortfolioInBase,
        secondaryPortfolioEquivalent,
        addCurrencyToWallet,
        toggleHideCurrency,
        getExchangeRate,
        calculateSwapQuote,
        calculateTransferQuote,
        calculateQRQuote,
        executeSwap,
        executeQRPayment,
        executeTransfer,
        executeTopUp,
        executeRefund,
        addRecipient,
        deleteRecipient,
        submitKYC,
        adminReviewKYC,
        toggleAccountFreeze,
        verifySecurityPin,
        currentTab,
        setCurrentTab,
        activeModal,
        selectedTxForReceipt,
        activeReceipt: selectedTxForReceipt,
        closeReceipt,
        openModal,
        closeModal,
        viewReceipt,
        getWalletSnapshot,
        applyBackendExecution,
        isAIChatOpen,
        setIsAIChatOpen,
        toggleAIChat,
      }}
    >
      {children}
    </PaymentContext.Provider>
  );
};

export const usePayment = () => {
  const context = useContext(PaymentContext);
  if (!context) {
    throw new Error('usePayment must be used within a PaymentProvider');
  }
  return context;
};
