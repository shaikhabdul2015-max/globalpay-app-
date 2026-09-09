import React from 'react';
import {
  Plus,
  ArrowLeftRight,
  Send,
  QrCode,
  ArrowUpRight,
  ArrowDownLeft,
  ChevronRight,
  ShieldCheck,
  AlertCircle,
  Eye,
  EyeOff,
  Sparkles,
} from 'lucide-react';
import { usePayment } from '../store/paymentContext';
import { SUPPORTED_CURRENCIES } from '../data/currencies';
import { CurrencyCode, Transaction, WalletBalance } from '../types';

interface HomeScreenProps {
  onNavigateTab?: (tab: any) => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({ onNavigateTab: propNavigate }) => {
  const {
    currentUser,
    balances,
    transactions,
    totalPortfolioInBase,
    secondaryPortfolioEquivalent,
    openModal,
    viewReceipt,
    setCurrentTab,
  } = usePayment();

  const onNavigateTab = propNavigate || setCurrentTab;

  const [hideBalances, setHideBalances] = React.useState(false);

  // Filter visible currencies
  const visibleCurrencies = (Object.values(balances) as WalletBalance[]).filter((b) => !b.hidden);

  const getTransactionIcon = (tx: Transaction) => {
    switch (tx.type) {
      case 'swap':
        return <ArrowLeftRight className="w-4 h-4 text-cyan-400" />;
      case 'qr_payment':
        return <QrCode className="w-4 h-4 text-emerald-400" />;
      case 'transfer':
        return <ArrowUpRight className="w-4 h-4 text-indigo-400" />;
      case 'deposit':
        return <ArrowDownLeft className="w-4 h-4 text-teal-400" />;
      case 'refund':
        return <Sparkles className="w-4 h-4 text-amber-400" />;
      default:
        return <ArrowUpRight className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div className="space-y-6 pb-24">
      {/* Account Restricted Banner if frozen */}
      {currentUser.isFrozen && (
        <div className="bg-red-500/15 border border-red-500/30 rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            <div className="text-xs text-red-200">
              <span className="font-semibold text-red-400">Account Restricted:</span> Outgoing
              transactions are temporarily disabled for security.
            </div>
          </div>
          <button
            onClick={() => onNavigateTab('admin')}
            className="text-xs font-semibold text-red-400 hover:underline shrink-0"
          >
            Review in Ops
          </button>
        </div>
      )}

      {/* KYC Alert if not verified */}
      {currentUser.kyc.status !== 'verified' && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <div className="text-xs font-semibold text-amber-300">
                KYC Verification {currentUser.kyc.status === 'pending' ? 'Pending' : 'Required'}
              </div>
              <div className="text-[11px] text-amber-200/70">
                Complete ID check to unlock higher cross-border limits.
              </div>
            </div>
          </div>
          <button
            onClick={() => openModal('kyc_flow')}
            className="px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-bold text-xs hover:bg-amber-400 transition-colors shrink-0"
          >
            Verify Now
          </button>
        </div>
      )}

      {/* Greeting & Persona badge */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <div className="text-xs text-slate-400 flex items-center gap-1.5">
            <span>👋 Welcome back,</span>
            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              {currentUser.personaTitle}
            </span>
          </div>
          <h1 className="text-2xl font-extrabold text-slate-100 tracking-tight mt-0.5">
            {currentUser.name}
          </h1>
        </div>

        <button
          onClick={() => setHideBalances(!hideBalances)}
          className="p-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700/60 transition-colors"
          title={hideBalances ? 'Show balances' : 'Hide balances'}
        >
          {hideBalances ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>

      {/* Total Balance Card (Wireframe exact match) */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-800/90 via-slate-850 to-slate-900 p-6 border border-slate-700/60 shadow-xl shadow-slate-950/40">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none"></div>

        <div className="flex items-center justify-between text-xs font-semibold tracking-wider text-slate-400 uppercase">
          <span>Total Balance</span>
          <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-800/40">
            Multi-Currency Portfolio
          </span>
        </div>

        <div className="mt-2.5">
          <div className="text-3xl sm:text-4xl font-black text-white tracking-tight flex items-baseline gap-1">
            <span>{totalPortfolioInBase.symbol}</span>
            <span>
              {hideBalances
                ? '••••••'
                : totalPortfolioInBase.amount.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
            </span>
            <span className="text-sm font-semibold text-slate-400 ml-1">
              {totalPortfolioInBase.code}
            </span>
          </div>

          <div className="text-xs font-medium text-slate-400 mt-1 flex items-center gap-1.5">
            <span>≈</span>
            <span>
              {secondaryPortfolioEquivalent.symbol}
              {hideBalances
                ? '••••••'
                : secondaryPortfolioEquivalent.amount.toLocaleString(undefined, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })}
            </span>
            <span className="text-[11px] text-slate-500">{secondaryPortfolioEquivalent.code}</span>
            <span className="text-slate-600">•</span>
            <span className="text-[11px] text-emerald-400/90 font-medium">Real-time mid-market FX</span>
          </div>
        </div>

        {/* 4 Quick Actions (FR-14 Wireframe: + Add Money | Swap FX | Send Money | Scan QR) */}
        <div className="grid grid-cols-4 gap-2.5 sm:gap-3 mt-6 pt-5 border-t border-slate-700/60">
          {/* Add Money */}
          <button
            onClick={() => openModal('add_money')}
            className="flex flex-col items-center justify-center p-2.5 rounded-2xl bg-slate-800/90 hover:bg-slate-750 text-slate-200 border border-slate-700 hover:border-slate-600 transition-all group active:scale-95"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center mb-1.5 group-hover:bg-emerald-500/25 transition-colors">
              <Plus className="w-5 h-5" />
            </div>
            <span className="text-xs font-semibold text-slate-200">Add Money</span>
          </button>

          {/* Swap FX */}
          <button
            onClick={() => openModal('swap')}
            className="flex flex-col items-center justify-center p-2.5 rounded-2xl bg-slate-800/90 hover:bg-slate-750 text-slate-200 border border-slate-700 hover:border-slate-600 transition-all group active:scale-95"
          >
            <div className="w-10 h-10 rounded-xl bg-cyan-500/15 text-cyan-400 flex items-center justify-center mb-1.5 group-hover:bg-cyan-500/25 transition-colors">
              <ArrowLeftRight className="w-5 h-5" />
            </div>
            <span className="text-xs font-semibold text-slate-200">Swap FX</span>
          </button>

          {/* Send Money */}
          <button
            onClick={() => openModal('send')}
            className="flex flex-col items-center justify-center p-2.5 rounded-2xl bg-slate-800/90 hover:bg-slate-750 text-slate-200 border border-slate-700 hover:border-slate-600 transition-all group active:scale-95"
          >
            <div className="w-10 h-10 rounded-xl bg-indigo-500/15 text-indigo-400 flex items-center justify-center mb-1.5 group-hover:bg-indigo-500/25 transition-colors">
              <Send className="w-5 h-5" />
            </div>
            <span className="text-xs font-semibold text-slate-200">Send</span>
          </button>

          {/* Scan QR (Core Traveler Differentiator) */}
          <button
            onClick={() => openModal('qr_scan')}
            className="flex flex-col items-center justify-center p-2.5 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-slate-950 font-bold shadow-md shadow-emerald-500/20 hover:brightness-105 transition-all group active:scale-95"
          >
            <div className="w-10 h-10 rounded-xl bg-slate-950/20 text-slate-950 flex items-center justify-center mb-1.5">
              <QrCode className="w-5 h-5 stroke-[2.5]" />
            </div>
            <span className="text-xs font-extrabold text-slate-950">Scan QR</span>
          </button>
        </div>
      </div>

      {/* Your Currencies Section (FR-03 & Wireframe) */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold tracking-wider uppercase text-slate-300">
              Your Currencies
            </h2>
            <span className="text-xs text-slate-500">({visibleCurrencies.length})</span>
          </div>
          <button
            onClick={() => onNavigateTab('wallet')}
            className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1 transition-colors"
          >
            <span>Manage All</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="space-y-2.5">
          {visibleCurrencies.map((bal) => {
            const cur = SUPPORTED_CURRENCIES[bal.currency];
            return (
              <div
                key={bal.currency}
                onClick={() => onNavigateTab('wallet')}
                className="p-4 rounded-2xl bg-slate-800/60 hover:bg-slate-800/90 border border-slate-700/60 flex items-center justify-between cursor-pointer transition-all hover:border-slate-600"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-2xl bg-slate-700/50 flex items-center justify-center text-2xl shadow-inner">
                    {cur.flag}
                  </div>
                  <div>
                    <div className="font-bold text-slate-100 text-sm flex items-center gap-1.5">
                      <span>{cur.code}</span>
                      <span className="text-xs font-normal text-slate-400">· {cur.name}</span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
                      <span>{cur.accountDetails.systemName}</span>
                      {bal.pending > 0 && (
                        <span className="text-amber-400 font-medium">
                          ({cur.symbol}
                          {bal.pending.toFixed(cur.decimals)} pending)
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="font-mono font-bold text-slate-100 text-base">
                    {hideBalances
                      ? '••••••'
                      : `${cur.symbol}${bal.available.toLocaleString(undefined, {
                          minimumFractionDigits: cur.decimals,
                          maximumFractionDigits: cur.decimals,
                        })}`}
                  </div>
                  <div className="text-[11px] text-slate-500">Available balance</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent Activity Section (FR-08 & Wireframe) */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="text-sm font-bold tracking-wider uppercase text-slate-300">
            Recent Activity
          </h2>
          <button
            onClick={() => onNavigateTab('activity')}
            className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1 transition-colors"
          >
            <span>View All</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="space-y-2.5">
          {transactions.slice(0, 4).map((tx) => {
            const isNegative = tx.type !== 'deposit' && tx.type !== 'refund';
            const fromCur = SUPPORTED_CURRENCIES[tx.fromCurrency];
            const toCur = SUPPORTED_CURRENCIES[tx.toCurrency];

            return (
              <div
                key={tx.id}
                onClick={() => viewReceipt(tx)}
                className="p-3.5 rounded-2xl bg-slate-800/40 hover:bg-slate-800/80 border border-slate-700/50 flex items-center justify-between cursor-pointer transition-all hover:border-slate-600"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-700/60 flex items-center justify-center shrink-0">
                    {getTransactionIcon(tx)}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-200 text-sm truncate flex items-center gap-1.5">
                      <span className="truncate">{tx.title}</span>
                      {tx.status === 'refunded' && (
                        <span className="text-[10px] font-bold text-amber-400 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-800/40">
                          Refunded
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate mt-0.5">
                      {tx.type === 'swap' ? (
                        <span>
                          1 {tx.fromCurrency} = {tx.exchangeRate} {tx.toCurrency}
                        </span>
                      ) : tx.type === 'qr_payment' ? (
                        <span>
                          {tx.recipient.name} · {tx.qrData?.standard}
                        </span>
                      ) : (
                        <span>{tx.recipient.name || tx.sender.name}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0 pl-3">
                  <div
                    className={`font-mono font-bold text-sm ${
                      isNegative ? 'text-slate-100' : 'text-emerald-400'
                    }`}
                  >
                    {isNegative ? '-' : '+'}
                    {fromCur.symbol}
                    {tx.fromAmount.toFixed(fromCur.decimals)}
                  </div>
                  {tx.type === 'swap' ? (
                    <div className="text-[11px] font-mono text-cyan-400">
                      +{toCur.symbol}
                      {tx.toAmount.toFixed(toCur.decimals)}
                    </div>
                  ) : tx.type === 'qr_payment' ? (
                    <div className="text-[10px] text-slate-400">
                      Fee: ${tx.fees.totalFee.toFixed(2)}
                    </div>
                  ) : (
                    <div className="text-[10px] text-slate-500 capitalize">{tx.status}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
