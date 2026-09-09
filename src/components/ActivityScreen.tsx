import React, { useState } from 'react';
import {
  Search,
  Filter,
  ArrowUpDown,
  ArrowUpRight,
  ArrowDownLeft,
  QrCode,
  ArrowLeftRight,
  Sparkles,
  Download,
  Calendar,
  ChevronRight,
} from 'lucide-react';
import { usePayment } from '../store/paymentContext';
import { SUPPORTED_CURRENCIES } from '../data/currencies';
import { Transaction, TransactionType, CurrencyCode } from '../types';

export const ActivityScreen: React.FC = () => {
  const { transactions, viewReceipt } = usePayment();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedCurrency, setSelectedCurrency] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  // Filter transactions
  const filtered = transactions.filter((tx) => {
    // Search query
    const query = searchQuery.toLowerCase();
    const matchesSearch =
      !searchQuery ||
      tx.id.toLowerCase().includes(query) ||
      tx.title.toLowerCase().includes(query) ||
      tx.recipient.name.toLowerCase().includes(query) ||
      (tx.description && tx.description.toLowerCase().includes(query));

    // Type filter
    const matchesType = selectedType === 'all' || tx.type === selectedType;

    // Currency filter
    const matchesCurrency =
      selectedCurrency === 'all' ||
      tx.fromCurrency === selectedCurrency ||
      tx.toCurrency === selectedCurrency;

    // Status filter
    const matchesStatus = selectedStatus === 'all' || tx.status === selectedStatus;

    return matchesSearch && matchesType && matchesCurrency && matchesStatus;
  });

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
      {/* Header */}
      <div className="pt-1">
        <h1 className="text-2xl font-extrabold text-white tracking-tight">Transaction History</h1>
        <p className="text-xs text-slate-400 mt-0.5">
          Unified timeline of all swaps, QR payments, transfers, and deposits (FR-08)
        </p>
      </div>

      {/* Search and Filters */}
      <div className="space-y-3">
        {/* Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Search by merchant, recipient, title, or TX ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-800/80 border border-slate-700/70 rounded-2xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        {/* Filter Dropdowns Grid */}
        <div className="grid grid-cols-3 gap-2">
          {/* Type Filter */}
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-slate-300 text-xs rounded-xl px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
          >
            <option value="all">All Types</option>
            <option value="qr_payment">QR Payments</option>
            <option value="swap">Currency Swaps</option>
            <option value="transfer">Transfers</option>
            <option value="deposit">Deposits</option>
            <option value="refund">Refunds</option>
          </select>

          {/* Currency Filter */}
          <select
            value={selectedCurrency}
            onChange={(e) => setSelectedCurrency(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-slate-300 text-xs rounded-xl px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
          >
            <option value="all">All Currencies</option>
            {Object.keys(SUPPORTED_CURRENCIES).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-slate-300 text-xs rounded-xl px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
          >
            <option value="all">All Statuses</option>
            <option value="completed">Completed</option>
            <option value="processing">Processing</option>
            <option value="refunded">Refunded</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>

      {/* Transaction List */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between text-xs text-slate-400 px-1">
          <span>Showing {filtered.length} Transactions</span>
          {(selectedType !== 'all' || selectedCurrency !== 'all' || searchQuery) && (
            <button
              onClick={() => {
                setSelectedType('all');
                setSelectedCurrency('all');
                setSelectedStatus('all');
                setSearchQuery('');
              }}
              className="text-emerald-400 hover:underline"
            >
              Reset Filters
            </button>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="p-8 text-center rounded-3xl bg-slate-800/40 border border-slate-800 space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-slate-800 text-slate-500 flex items-center justify-center mx-auto">
              <Filter className="w-6 h-6" />
            </div>
            <div className="text-sm font-semibold text-slate-300">No transactions found</div>
            <div className="text-xs text-slate-500">
              Try adjusting your search query or filter options.
            </div>
          </div>
        ) : (
          filtered.map((tx) => {
            const isNegative = tx.type !== 'deposit' && tx.type !== 'refund';
            const fromCur = SUPPORTED_CURRENCIES[tx.fromCurrency];
            const toCur = SUPPORTED_CURRENCIES[tx.toCurrency];

            return (
              <div
                key={tx.id}
                onClick={() => viewReceipt(tx)}
                className="p-4 rounded-2xl bg-slate-800/50 hover:bg-slate-800 border border-slate-700/60 flex items-center justify-between cursor-pointer transition-all hover:border-slate-600 group"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-11 h-11 rounded-2xl bg-slate-700/60 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    {getTransactionIcon(tx)}
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-slate-100 text-sm truncate flex items-center gap-2">
                      <span className="truncate">{tx.title}</span>
                      {tx.status === 'refunded' && (
                        <span className="text-[10px] font-bold text-amber-400 bg-amber-950/80 px-1.5 py-0.5 rounded border border-amber-800/50">
                          Refunded
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
                      <span className="font-mono text-slate-500">{tx.id}</span>
                      <span>•</span>
                      <span>
                        {new Date(tx.timestamp).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0 pl-3">
                  <div
                    className={`font-mono font-bold text-base ${
                      isNegative ? 'text-slate-100' : 'text-emerald-400'
                    }`}
                  >
                    {isNegative ? '-' : '+'}
                    {fromCur.symbol}
                    {tx.fromAmount.toFixed(fromCur.decimals)}
                  </div>

                  {tx.type === 'swap' ? (
                    <div className="text-xs font-mono text-cyan-400">
                      +{toCur.symbol}
                      {tx.toAmount.toFixed(toCur.decimals)}
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-500 capitalize">
                      {tx.status === 'completed' ? 'Delivered' : tx.status}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
