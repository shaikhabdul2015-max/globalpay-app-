import React, { useState } from 'react';
import {
  Plus,
  Search,
  Copy,
  Check,
  Building,
  Info,
  ArrowUpDown,
  Eye,
  EyeOff,
  Sparkles,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';
import { usePayment } from '../store/paymentContext';
import { SUPPORTED_CURRENCIES } from '../data/currencies';
import { CurrencyCode, Currency } from '../types';

export const WalletScreen: React.FC = () => {
  const {
    balances,
    baseCurrency,
    setBaseCurrency,
    totalPortfolioInBase,
    addCurrencyToWallet,
    toggleHideCurrency,
    openModal,
  } = usePayment();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCurrencyForDetails, setSelectedCurrencyForDetails] = useState<Currency | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showAddCurrencySheet, setShowAddCurrencySheet] = useState(false);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedField(label);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Filtered list of currencies based on search
  const allCurrenciesList = Object.values(SUPPORTED_CURRENCIES);
  const filteredCurrencies = allCurrenciesList.filter(
    (c) =>
      c.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.country.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 pb-24">
      {/* Header & Total Portfolio Card */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">Multi-Currency Wallet</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Hold, receive, and manage 11+ global currencies with local bank details
          </p>
        </div>

        <button
          onClick={() => setShowAddCurrencySheet(true)}
          className="px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-500/20 transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Add Currency</span>
        </button>
      </div>

      {/* Portfolio Summary Card */}
      <div className="rounded-3xl bg-slate-800/80 border border-slate-700/80 p-5 space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span className="font-semibold uppercase tracking-wider">Total Portfolio Valuation</span>
          <div className="flex items-center gap-1">
            <span>Base Currency:</span>
            <select
              value={baseCurrency}
              onChange={(e) => setBaseCurrency(e.target.value as CurrencyCode)}
              className="bg-slate-700 text-emerald-400 font-bold text-xs rounded-lg px-2 py-0.5 border border-slate-600 focus:outline-none cursor-pointer"
            >
              {Object.keys(SUPPORTED_CURRENCIES).map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-black text-white font-mono">
            {totalPortfolioInBase.symbol}
            {totalPortfolioInBase.amount.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
          <span className="text-sm font-bold text-slate-400">{totalPortfolioInBase.code}</span>
        </div>

        {/* Breakdown distinction: Available vs Pending vs Held (FR-03 requirement) */}
        <div className="pt-3 border-t border-slate-700/60 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="p-2 rounded-xl bg-slate-900/50">
            <div className="text-[10px] text-slate-400 font-medium">Available to Spend</div>
            <div className="font-mono font-bold text-emerald-400 mt-0.5">100% Liquid</div>
          </div>
          <div className="p-2 rounded-xl bg-slate-900/50">
            <div className="text-[10px] text-slate-400 font-medium">Pending Inflows</div>
            <div className="font-mono font-bold text-amber-400 mt-0.5">0 Pending</div>
          </div>
          <div className="p-2 rounded-xl bg-slate-900/50">
            <div className="text-[10px] text-slate-400 font-medium">Held / Blocked</div>
            <div className="font-mono font-bold text-slate-400 mt-0.5">$0.00</div>
          </div>
        </div>
      </div>

      {/* Currency Search Input */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
        <input
          type="text"
          placeholder="Search by currency code (USD, EUR), name, or country..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-slate-800/80 border border-slate-700/70 rounded-2xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
      </div>

      {/* List of Active Wallet Currencies */}
      <div className="space-y-3">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-400 px-1">
          Active Balances & Local Banking Details
        </div>

        <div className="space-y-3">
          {filteredCurrencies
            .filter((c) => !balances[c.code]?.hidden)
            .map((cur) => {
              const bal = balances[cur.code] || {
                currency: cur.code,
                available: 0,
                pending: 0,
                held: 0,
                hidden: false,
              };

              return (
                <div
                  key={cur.code}
                  className="rounded-2xl bg-slate-800/60 border border-slate-700/60 p-4 space-y-3 hover:border-slate-600 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-slate-700/60 flex items-center justify-center text-2xl shadow-inner">
                        {cur.flag}
                      </div>
                      <div>
                        <div className="font-bold text-slate-100 text-sm flex items-center gap-2">
                          <span>{cur.name}</span>
                          <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-200">
                            {cur.code}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {cur.accountDetails.systemName} · {cur.accountDetails.bankName}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="font-mono font-black text-slate-100 text-lg">
                        {cur.symbol}
                        {bal.available.toLocaleString(undefined, {
                          minimumFractionDigits: cur.decimals,
                          maximumFractionDigits: cur.decimals,
                        })}
                      </div>
                      <div className="text-[10px] text-slate-500 font-medium">Available Balance</div>
                    </div>
                  </div>

                  {/* Pending & Held distinction (FR-03 requirement) */}
                  {(bal.pending > 0 || bal.held > 0) && (
                    <div className="flex items-center gap-3 text-[11px] bg-slate-900/60 p-2 rounded-xl text-slate-300">
                      {bal.pending > 0 && (
                        <span className="text-amber-400 font-mono">
                          Pending: {cur.symbol}
                          {bal.pending.toFixed(cur.decimals)}
                        </span>
                      )}
                      {bal.held > 0 && (
                        <span className="text-slate-400 font-mono">
                          Held: {cur.symbol}
                          {bal.held.toFixed(cur.decimals)}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Actions for this currency: Account Details | Add Money | Swap | Hide */}
                  <div className="pt-2 border-t border-slate-700/50 flex items-center justify-between text-xs">
                    <button
                      onClick={() => setSelectedCurrencyForDetails(cur)}
                      className="text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1 transition-colors"
                    >
                      <Building className="w-3.5 h-3.5" />
                      <span>View Account Details</span>
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openModal('swap')}
                        className="px-2.5 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-medium transition-colors"
                      >
                        Swap
                      </button>
                      <button
                        onClick={() => openModal('add_money')}
                        className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 text-xs font-medium transition-colors"
                      >
                        + Add
                      </button>
                      <button
                        onClick={() => toggleHideCurrency(cur.code)}
                        className="p-1 text-slate-400 hover:text-slate-200 transition-colors"
                        title="Hide Currency"
                      >
                        <EyeOff className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* MODAL: LOCAL BANK ACCOUNT DETAILS (FR-03 requirement) */}
      {selectedCurrencyForDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-3xl p-6 shadow-2xl relative space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">{selectedCurrencyForDetails.flag}</span>
                <div>
                  <h3 className="font-bold text-white text-base">
                    {selectedCurrencyForDetails.name} Account Details
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Use these details to receive domestic bank payments
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedCurrencyForDetails(null)}
                className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-800/80 border border-slate-700 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Payment Network:</span>
                <span className="font-bold text-emerald-400">
                  {selectedCurrencyForDetails.accountDetails.systemName}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-400">Bank Partner:</span>
                <span className="font-semibold text-slate-200">
                  {selectedCurrencyForDetails.accountDetails.bankName}
                </span>
              </div>

              <div className="pt-2 border-t border-slate-700/60 space-y-1">
                <div className="flex justify-between items-center text-slate-400">
                  <span>{selectedCurrencyForDetails.accountDetails.identifierLabel}</span>
                  <button
                    onClick={() =>
                      copyToClipboard(
                        selectedCurrencyForDetails.accountDetails.accountNumber,
                        'account'
                      )
                    }
                    className="text-emerald-400 flex items-center gap-1 hover:underline"
                  >
                    {copiedField === 'account' ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{copiedField === 'account' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <div className="font-mono text-sm font-bold text-white bg-slate-900/80 p-2.5 rounded-xl border border-slate-700/80 select-all">
                  {selectedCurrencyForDetails.accountDetails.accountNumber}
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between items-center text-slate-400">
                  <span>Routing / Clearing Code / BIC:</span>
                  <button
                    onClick={() =>
                      copyToClipboard(
                        selectedCurrencyForDetails.accountDetails.routingCode,
                        'routing'
                      )
                    }
                    className="text-emerald-400 flex items-center gap-1 hover:underline"
                  >
                    {copiedField === 'routing' ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{copiedField === 'routing' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <div className="font-mono text-xs font-bold text-slate-200 bg-slate-900/80 p-2 rounded-xl border border-slate-700/80 select-all">
                  {selectedCurrencyForDetails.accountDetails.routingCode}
                </div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-cyan-950/40 border border-cyan-800/40 text-[11px] text-cyan-200 flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <span>
                Zero conversion fees when receiving payments domestically in {selectedCurrencyForDetails.code}.
                Funds are immediately credited to your multi-currency ledger.
              </span>
            </div>

            <button
              onClick={() => setSelectedCurrencyForDetails(null)}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-white font-bold text-xs border border-slate-700"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* MODAL: ADD / UNHIDE CURRENCY */}
      {showAddCurrencySheet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-3xl p-6 shadow-2xl relative space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
              <div>
                <h3 className="font-bold text-white text-base">Add a Currency</h3>
                <p className="text-[11px] text-slate-400">
                  Select a currency to enable wallet balance and account details
                </p>
              </div>
              <button
                onClick={() => setShowAddCurrencySheet(false)}
                className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 overflow-y-auto pr-1">
              {allCurrenciesList.map((cur) => {
                const isHidden = balances[cur.code]?.hidden ?? true;
                return (
                  <div
                    key={cur.code}
                    onClick={() => {
                      addCurrencyToWallet(cur.code);
                      setShowAddCurrencySheet(false);
                    }}
                    className="p-3 rounded-2xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 hover:border-emerald-500/50 flex items-center justify-between cursor-pointer transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{cur.flag}</span>
                      <div>
                        <div className="font-bold text-slate-100 text-xs">{cur.name}</div>
                        <div className="text-[10px] text-slate-400">
                          {cur.code} · 1 USD = {cur.rateToUSD} {cur.code}
                        </div>
                      </div>
                    </div>

                    <button className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500 text-emerald-400 hover:text-slate-950 font-bold text-xs transition-colors">
                      {isHidden ? '+ Add' : 'Active'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
