import React, { useState } from 'react';
import {
  ShieldAlert,
  Users,
  TrendingUp,
  Sliders,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RotateCcw,
  BookOpen,
  Activity,
  ArrowRight,
  Database,
  Lock,
  Unlock,
  Sparkles,
} from 'lucide-react';
import { usePayment } from '../store/paymentContext';
import { SUPPORTED_CURRENCIES } from '../data/currencies';
import { CurrencyCode, KYCStatus } from '../types';

export const AdminDashboard: React.FC = () => {
  const {
    currentUser,
    updateUser,
    transactions,
    ledger,
    updateTransactionStatus,
    rates,
    updateExchangeRate,
    feeConfig,
    updateFeeConfig,
  } = usePayment();

  const [activeTab, setActiveTab] = useState<'users_kyc' | 'tx_monitoring' | 'fx_rates' | 'ledger_audit'>('tx_monitoring');
  const [selectedCurrencyForFX, setSelectedCurrencyForFX] = useState<CurrencyCode>('EUR');
  const [fxRateInput, setFxRateInput] = useState<string>(rates['EUR']?.toString() || '0.92');

  const [baseFeeInput, setBaseFeeInput] = useState(feeConfig.transferBaseFeeUSD.toString());
  const [conversionRateInput, setConversionRateInput] = useState((feeConfig.conversionRatePercent * 100).toString());

  const handleUpdateKYCStatus = (newStatus: KYCStatus) => {
    updateUser({
      kyc: {
        ...currentUser.kyc,
        status: newStatus,
        reviewerNotes: `Admin updated to ${newStatus} on ${new Date().toLocaleDateString()}`,
      },
    });
  };

  const handleSaveFX = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(fxRateInput);
    if (!isNaN(parsed) && parsed > 0) {
      updateExchangeRate(selectedCurrencyForFX, parsed);
    }
  };

  const handleSaveFeeConfig = (e: React.FormEvent) => {
    e.preventDefault();
    updateFeeConfig({
      transferBaseFeeUSD: parseFloat(baseFeeInput) || 1.0,
      conversionRatePercent: (parseFloat(conversionRateInput) || 0.3) / 100,
    });
  };

  return (
    <div className="space-y-6 pb-24 max-w-5xl mx-auto">
      {/* Admin Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-white tracking-tight">Admin & Compliance Ops</h1>
            <span className="text-xs bg-rose-500/20 text-rose-300 font-mono font-bold px-2.5 py-0.5 rounded-full border border-rose-500/40">
              FR-18 Internal
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Operational dashboard for KYC approvals, AML transaction controls, FX rate overrides, and double-entry ledger audits
          </p>
        </div>

        {/* Global stats pills */}
        <div className="flex gap-2 text-xs">
          <div className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 font-mono">
            <span className="text-slate-400">Total Ledger Entries: </span>
            <span className="text-emerald-400 font-bold">{ledger.length}</span>
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 font-mono">
            <span className="text-slate-400">Total Transactions: </span>
            <span className="text-cyan-400 font-bold">{transactions.length}</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[
          { id: 'tx_monitoring', label: 'Transaction Monitoring & AML', icon: Activity },
          { id: 'users_kyc', label: 'User & KYC Management', icon: Users },
          { id: 'fx_rates', label: 'FX Rate & Fee Overrides', icon: Sliders },
          { id: 'ledger_audit', label: 'Double-Entry Ledger Audit', icon: Database },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2.5 rounded-2xl text-xs font-bold whitespace-nowrap flex items-center gap-2 border transition-all ${
                isActive
                  ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md shadow-emerald-500/20'
                  : 'bg-slate-800/60 text-slate-300 border-slate-700 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: TRANSACTION MONITORING & CONTROLS */}
      {activeTab === 'tx_monitoring' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Live Transactions & Action Controls
            </div>
            <span className="text-xs text-slate-500 font-mono">
              Simulate ops team actions (Complete / Refund / Fail)
            </span>
          </div>

          <div className="space-y-2.5">
            {transactions.map((tx) => (
              <div
                key={tx.id}
                className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60 flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-white">{tx.id}</span>
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-slate-700 text-slate-300 font-mono">
                      {tx.type}
                    </span>
                    <span
                      className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${
                        tx.status === 'completed'
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : tx.status === 'processing'
                          ? 'bg-amber-500/20 text-amber-400'
                          : tx.status === 'refunded'
                          ? 'bg-indigo-500/20 text-indigo-400'
                          : 'bg-red-500/20 text-red-400'
                      }`}
                    >
                      {tx.status}
                    </span>
                  </div>

                  <div className="text-xs text-slate-300">
                    <span className="font-semibold text-slate-100">{tx.title}</span> — From:{' '}
                    <span className="font-mono text-emerald-300">
                      {tx.fromAmount} {tx.fromCurrency}
                    </span>{' '}
                    → To:{' '}
                    <span className="font-mono text-cyan-300">
                      {tx.toAmount} {tx.toCurrency}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-400 font-mono">
                    Sender: {tx.sender.name} | Recipient: {tx.recipient.name} | Fee:{' '}
                    {tx.fees.totalFee.toFixed(2)} {tx.fromCurrency}
                  </div>
                </div>

                {/* Operations Action Buttons */}
                <div className="flex items-center gap-2 shrink-0">
                  {tx.status !== 'completed' && (
                    <button
                      onClick={() => updateTransactionStatus(tx.id, 'completed')}
                      className="px-2.5 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-xs font-bold border border-emerald-500/40 flex items-center gap-1 transition-colors"
                      title="Force Complete"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Approve</span>
                    </button>
                  )}

                  {tx.status !== 'refunded' && tx.status !== 'failed' && (
                    <button
                      onClick={() => updateTransactionStatus(tx.id, 'refunded')}
                      className="px-2.5 py-1.5 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 text-xs font-bold border border-indigo-500/40 flex items-center gap-1 transition-colors"
                      title="Issue Refund & Revert Ledger"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Refund</span>
                    </button>
                  )}

                  {tx.status !== 'failed' && (
                    <button
                      onClick={() => updateTransactionStatus(tx.id, 'failed')}
                      className="px-2.5 py-1.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs font-bold border border-red-500/40 flex items-center gap-1 transition-colors"
                      title="Fail Transaction"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Block</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: USER & KYC MANAGEMENT */}
      {activeTab === 'users_kyc' && (
        <div className="space-y-4">
          <div className="p-5 rounded-3xl bg-slate-800/60 border border-slate-700/60 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img
                  src={currentUser.avatar}
                  alt={currentUser.name}
                  className="w-12 h-12 rounded-full object-cover ring-2 ring-slate-700"
                />
                <div>
                  <h3 className="text-base font-bold text-white">{currentUser.name}</h3>
                  <div className="text-xs text-slate-400">{currentUser.email}</div>
                  <div className="text-[11px] text-slate-500 font-mono">
                    User ID: {currentUser.id} · Tier: {currentUser.tier.toUpperCase()}
                  </div>
                </div>
              </div>

              <div className="text-right">
                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold font-mono ${
                    currentUser.kyc.status === 'verified'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      : currentUser.kyc.status === 'pending'
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                      : 'bg-red-500/20 text-red-400 border border-red-500/40'
                  }`}
                >
                  KYC: {currentUser.kyc.status.toUpperCase()}
                </span>
              </div>
            </div>

            {/* Submitted Document Snapshot */}
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2 text-xs">
              <div className="font-bold text-slate-300">Submitted Document Information:</div>
              <div className="grid grid-cols-2 gap-2 text-slate-400">
                <div>
                  ID Type: <span className="text-slate-200">{currentUser.kyc.idType || 'Passport'}</span>
                </div>
                <div>
                  ID Number: <span className="font-mono text-slate-200">{currentUser.kyc.idNumber || 'P884920193'}</span>
                </div>
                <div>
                  Country: <span className="text-slate-200">{currentUser.kyc.country || 'USA'}</span>
                </div>
                <div>
                  DOB: <span className="text-slate-200">{currentUser.kyc.dateOfBirth || '1995-06-14'}</span>
                </div>
                <div>
                  Liveness Verified: <span className="text-emerald-400 font-bold">Yes (Passed 99.8%)</span>
                </div>
                <div>
                  Address: <span className="text-slate-200">{currentUser.kyc.address || '742 Evergreen Terrace'}</span>
                </div>
              </div>
            </div>

            {/* Compliance Override Controls */}
            <div className="space-y-2 pt-2">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                Compliance Officer Actions:
              </span>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleUpdateKYCStatus('verified')}
                  className="px-3 py-2 rounded-xl bg-emerald-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-colors"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Approve & Verify Account</span>
                </button>

                <button
                  onClick={() => handleUpdateKYCStatus('additional_review')}
                  className="px-3 py-2 rounded-xl bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/40 font-bold text-xs flex items-center gap-1.5 transition-colors"
                >
                  <AlertTriangle className="w-4 h-4" />
                  <span>Flag for Additional Review</span>
                </button>

                <button
                  onClick={() => handleUpdateKYCStatus('rejected')}
                  className="px-3 py-2 rounded-xl bg-red-500/20 text-red-300 hover:bg-red-500/30 border border-red-500/40 font-bold text-xs flex items-center gap-1.5 transition-colors"
                >
                  <XCircle className="w-4 h-4" />
                  <span>Reject Verification</span>
                </button>

                <button
                  onClick={() => handleUpdateKYCStatus('pending')}
                  className="px-3 py-2 rounded-xl bg-slate-700 text-slate-300 hover:bg-slate-650 font-semibold text-xs transition-colors"
                >
                  Reset to Pending
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: FX RATES & FEE OVERRIDES */}
      {activeTab === 'fx_rates' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* FX Rates Editor */}
          <form
            onSubmit={handleSaveFX}
            className="p-5 rounded-3xl bg-slate-800/60 border border-slate-700/60 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Live FX Market Rate Override</h3>
              <span className="text-[10px] font-mono text-emerald-400">Base: USD</span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Target Currency</label>
                <select
                  value={selectedCurrencyForFX}
                  onChange={(e) => {
                    const c = e.target.value as CurrencyCode;
                    setSelectedCurrencyForFX(c);
                    setFxRateInput(rates[c]?.toString() || '1');
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                >
                  {Object.keys(SUPPORTED_CURRENCIES).map((c) => (
                    <option key={c} value={c}>
                      {c} ({SUPPORTED_CURRENCIES[c as CurrencyCode].name})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  Exchange Rate (1 USD = ? {selectedCurrencyForFX})
                </label>
                <input
                  type="number"
                  step="any"
                  value={fxRateInput}
                  onChange={(e) => setFxRateInput(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-mono"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-colors"
              >
                Update Live FX Rate
              </button>
            </div>
          </form>

          {/* Transparent Fee Engine Controls (FR-07) */}
          <form
            onSubmit={handleSaveFeeConfig}
            className="p-5 rounded-3xl bg-slate-800/60 border border-slate-700/60 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Transparent Fee Engine Configuration</h3>
              <span className="text-[10px] font-mono text-cyan-400">FR-07</span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  Fixed Transfer Base Fee (USD)
                </label>
                <input
                  type="number"
                  step="0.05"
                  value={baseFeeInput}
                  onChange={(e) => setBaseFeeInput(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-mono"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  FX Conversion Markup Rate (%)
                </label>
                <input
                  type="number"
                  step="0.05"
                  value={conversionRateInput}
                  onChange={(e) => setConversionRateInput(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-mono"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-colors"
              >
                Save Fee Configuration
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 4: DOUBLE-ENTRY LEDGER AUDIT */}
      {activeTab === 'ledger_audit' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-400" />
                <span>Source of Truth: Double-Entry Financial Ledger</span>
              </div>
              <div className="text-[11px] text-slate-400">
                Balances are derived mathematically from matched debit and credit entries.
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-slate-950/80 border border-slate-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-900 text-slate-400 border-b border-slate-800 text-[11px]">
                  <tr>
                    <th className="p-3">Entry ID</th>
                    <th className="p-3">Transaction</th>
                    <th className="p-3">Account</th>
                    <th className="p-3">Debit</th>
                    <th className="p-3">Credit</th>
                    <th className="p-3">Currency</th>
                    <th className="p-3">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {ledger.map((entry) => (
                    <tr key={entry.id} className="hover:bg-slate-900/50">
                      <td className="p-3 text-slate-500">{entry.id}</td>
                      <td className="p-3 text-slate-300 font-semibold">{entry.transactionId}</td>
                      <td className="p-3 text-slate-300">{entry.accountId}</td>
                      <td className="p-3">
                        {entry.debit > 0 ? (
                          <span className="text-rose-400 font-bold">-{entry.debit.toFixed(2)}</span>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>
                      <td className="p-3">
                        {entry.credit > 0 ? (
                          <span className="text-emerald-400 font-bold">+{entry.credit.toFixed(2)}</span>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>
                      <td className="p-3 text-slate-400">{entry.currency}</td>
                      <td className="p-3 text-slate-500 text-[10px]">
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
