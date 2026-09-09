import React, { useState } from 'react';
import { X, Plus, CreditCard, Building2, Smartphone, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { usePayment } from '../store/paymentContext';
import { SUPPORTED_CURRENCIES } from '../data/currencies';
import { CurrencyCode } from '../types';

export const AddMoneyModal: React.FC = () => {
  const { balances, executeTopUp, closeModal, viewReceipt } = usePayment();

  const [selectedCurrency, setSelectedCurrency] = useState<CurrencyCode>('USD');
  const [amountStr, setAmountStr] = useState<string>('500');
  const [method, setMethod] = useState<'bank' | 'card' | 'instant'>('bank');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [completedTx, setCompletedTx] = useState<any | null>(null);

  const numAmount = parseFloat(amountStr) || 0;
  const curDef = SUPPORTED_CURRENCIES[selectedCurrency];

  const handleDeposit = async () => {
    setErrorMsg(null);
    if (numAmount <= 0) {
      setErrorMsg('Please enter a valid deposit amount.');
      return;
    }

    try {
      setIsProcessing(true);
      const methodName =
        method === 'bank'
          ? `${curDef.accountDetails.systemName} Local Transfer`
          : method === 'card'
          ? 'Visa / Mastercard Debit (0% promo)'
          : 'Instant Linked Bank Account';

      const tx = await executeTopUp(selectedCurrency, numAmount, methodName);
      setCompletedTx(tx);
    } catch (err: any) {
      setErrorMsg(err.message || 'Deposit failed');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <span>Add Money to Wallet</span>
              <span className="text-[10px] bg-teal-950 text-teal-400 border border-teal-800/50 px-2 py-0.5 rounded-full font-mono">
                Top-Up
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Deposit funds directly into any supported currency balance
            </p>
          </div>
          <button
            onClick={closeModal}
            className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {completedTx ? (
          <div className="py-6 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto ring-8 ring-emerald-500/10">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-xl font-extrabold text-white">Funds Added!</h3>
              <p className="text-xs text-slate-400 mt-1">
                Transaction ID:{' '}
                <span className="font-mono text-emerald-400 font-semibold">{completedTx.id}</span>
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60 text-xs space-y-2 text-left">
              <div className="flex justify-between">
                <span className="text-slate-400">Currency Credited:</span>
                <span className="font-bold text-slate-100">
                  {curDef.flag} {selectedCurrency}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Amount Credited:</span>
                <span className="font-mono text-emerald-400 font-bold text-sm">
                  +{curDef.symbol}
                  {numAmount.toFixed(curDef.decimals)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Funding Method:</span>
                <span className="text-slate-200">{completedTx.sender.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Deposit Fee:</span>
                <span className="font-mono text-emerald-400 font-semibold">$0.00 (Free)</span>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => {
                  closeModal();
                  viewReceipt(completedTx);
                }}
                className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 font-semibold text-xs border border-slate-700 transition-colors"
              >
                View Full Receipt
              </button>
              <button
                onClick={closeModal}
                className="flex-1 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 pt-4">
            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Select Currency & Amount */}
            <div className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700/80 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Select Currency to Add</span>
                <span className="text-[11px] font-mono text-slate-400">
                  Current: {curDef.symbol}
                  {(balances[selectedCurrency]?.available || 0).toFixed(curDef.decimals)}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="1"
                  step="any"
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-transparent text-2xl font-mono font-bold text-white focus:outline-none"
                />

                <select
                  value={selectedCurrency}
                  onChange={(e) => setSelectedCurrency(e.target.value as CurrencyCode)}
                  className="bg-slate-700/90 border border-slate-600 text-white font-bold text-sm rounded-xl px-3 py-2 cursor-pointer"
                >
                  {Object.values(SUPPORTED_CURRENCIES).map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.code}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Quick Amount Pills */}
            <div className="flex gap-2">
              {[100, 250, 500, 1000].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setAmountStr(amt.toString())}
                  className="flex-1 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 font-mono text-xs border border-slate-700"
                >
                  +{amt}
                </button>
              ))}
            </div>

            {/* Deposit Method Options */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                Deposit Method
              </span>

              <div
                onClick={() => setMethod('bank')}
                className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${
                  method === 'bank'
                    ? 'bg-slate-800 border-emerald-500/80 ring-1 ring-emerald-500/30'
                    : 'bg-slate-800/40 hover:bg-slate-800/80 border-slate-700/60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-bold text-slate-100 text-xs">
                      {curDef.accountDetails.systemName}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Zero fee · Arrives within seconds
                    </div>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded-full border border-emerald-800/50">
                  FREE
                </span>
              </div>

              <div
                onClick={() => setMethod('card')}
                className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${
                  method === 'card'
                    ? 'bg-slate-800 border-emerald-500/80 ring-1 ring-emerald-500/30'
                    : 'bg-slate-800/40 hover:bg-slate-800/80 border-slate-700/60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-cyan-500/15 text-cyan-400 flex items-center justify-center">
                    <CreditCard className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-bold text-slate-100 text-xs">Debit / Credit Card</div>
                    <div className="text-[11px] text-slate-400">Instant funding via Visa / MC</div>
                  </div>
                </div>
                <span className="text-[10px] font-mono text-slate-400">Instant</span>
              </div>
            </div>

            <button
              type="button"
              disabled={isProcessing || numAmount <= 0}
              onClick={handleDeposit}
              className="w-full py-3.5 rounded-2xl font-bold text-sm bg-gradient-to-r from-emerald-500 to-teal-400 hover:brightness-105 text-slate-950 shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Processing Top-up...</span>
                </>
              ) : (
                <span>
                  Confirm Deposit of {curDef.symbol}
                  {numAmount.toFixed(curDef.decimals)}
                </span>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
