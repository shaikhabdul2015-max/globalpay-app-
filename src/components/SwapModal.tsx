import React, { useState, useEffect } from 'react';
import { X, ArrowUpDown, RefreshCw, AlertCircle, CheckCircle2, ShieldCheck, ArrowRight } from 'lucide-react';
import { usePayment } from '../store/paymentContext';
import { SUPPORTED_CURRENCIES } from '../data/currencies';
import { CurrencyCode } from '../types';

export const SwapModal: React.FC = () => {
  const {
    balances,
    calculateSwapQuote,
    executeSwap,
    closeModal,
    viewReceipt,
  } = usePayment();

  const [fromCurrency, setFromCurrency] = useState<CurrencyCode>('USD');
  const [toCurrency, setToCurrency] = useState<CurrencyCode>('EUR');
  const [amountStr, setAmountStr] = useState<string>('100');
  const [rateCountdown, setRateCountdown] = useState<number>(30);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successTx, setSuccessTx] = useState<any | null>(null);

  // Rate lock timer (30s)
  useEffect(() => {
    const timer = setInterval(() => {
      setRateCountdown((prev) => (prev <= 1 ? 30 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const numAmount = parseFloat(amountStr) || 0;
  const quote = calculateSwapQuote(fromCurrency, toCurrency, numAmount);
  const availableBal = balances[fromCurrency]?.available || 0;
  const isInsufficient = numAmount + quote.fee.totalFee > availableBal;

  const handleSwapCurrencies = () => {
    const temp = fromCurrency;
    setFromCurrency(toCurrency);
    setToCurrency(temp);
    setErrorMsg(null);
  };

  const handleExecute = async () => {
    setErrorMsg(null);
    if (numAmount <= 0) {
      setErrorMsg('Please enter a valid swap amount.');
      return;
    }
    if (fromCurrency === toCurrency) {
      setErrorMsg('Please select two different currencies.');
      return;
    }
    if (isInsufficient) {
      setErrorMsg(
        `Insufficient funds in ${fromCurrency}. Total needed with fee is ${SUPPORTED_CURRENCIES[fromCurrency].symbol}${(
          numAmount + quote.fee.totalFee
        ).toFixed(2)}.`
      );
      return;
    }

    try {
      setIsExecuting(true);
      const tx = await executeSwap(fromCurrency, toCurrency, numAmount);
      setSuccessTx(tx);
    } catch (err: any) {
      setErrorMsg(err.message || 'Swap execution failed.');
    } finally {
      setIsExecuting(false);
    }
  };

  const fromCurDef = SUPPORTED_CURRENCIES[fromCurrency];
  const toCurDef = SUPPORTED_CURRENCIES[toCurrency];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <span>Instant Currency Swap</span>
              <span className="text-[10px] bg-cyan-950 text-cyan-400 border border-cyan-800/50 px-2 py-0.5 rounded-full font-mono font-medium">
                FR-04
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Guaranteed mid-market FX with fully transparent fees
            </p>
          </div>
          <button
            onClick={closeModal}
            className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* If successfully swapped */}
        {successTx ? (
          <div className="py-6 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto ring-8 ring-emerald-500/10">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-xl font-extrabold text-white">Swap Executed!</h3>
              <p className="text-xs text-slate-400 mt-1">
                Transaction ID:{' '}
                <span className="font-mono text-emerald-400 font-semibold">{successTx.id}</span>
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60 text-sm space-y-2">
              <div className="flex justify-between text-slate-400 text-xs">
                <span>You converted</span>
                <span className="font-mono text-slate-200 font-medium">
                  {fromCurDef.symbol}
                  {successTx.fromAmount.toFixed(2)} {fromCurrency}
                </span>
              </div>
              <div className="flex justify-between text-slate-400 text-xs">
                <span>Transparent Fee</span>
                <span className="font-mono text-slate-300">
                  {fromCurDef.symbol}
                  {successTx.fees.totalFee.toFixed(2)} {fromCurrency}
                </span>
              </div>
              <div className="pt-2 border-t border-slate-700/60 flex justify-between font-bold">
                <span className="text-emerald-400">You Received</span>
                <span className="text-emerald-400 font-mono text-base">
                  +{toCurDef.symbol}
                  {successTx.toAmount.toFixed(2)} {toCurrency}
                </span>
              </div>
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                onClick={() => {
                  closeModal();
                  viewReceipt(successTx);
                }}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 font-semibold text-xs border border-slate-700 transition-colors"
              >
                View Full Receipt
              </button>
              <button
                onClick={closeModal}
                className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-colors"
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

            {/* FROM Input Card */}
            <div className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700/80 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>You Convert (From)</span>
                <span className="text-[11px]">
                  Available:{' '}
                  <button
                    type="button"
                    onClick={() => setAmountStr(availableBal.toString())}
                    className="font-mono text-emerald-400 font-semibold hover:underline"
                  >
                    {fromCurDef.symbol}
                    {availableBal.toFixed(fromCurDef.decimals)} {fromCurrency}
                  </button>
                </span>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-transparent text-2xl font-mono font-bold text-white focus:outline-none placeholder-slate-600"
                />

                <select
                  value={fromCurrency}
                  onChange={(e) => {
                    const newFrom = e.target.value as CurrencyCode;
                    setFromCurrency(newFrom);
                    if (newFrom === toCurrency) {
                      setToCurrency(newFrom === 'USD' ? 'EUR' : 'USD');
                    }
                  }}
                  className="bg-slate-700/90 border border-slate-600 text-white font-bold text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                >
                  {Object.values(SUPPORTED_CURRENCIES).map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.code}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Switch Currency Button */}
            <div className="flex items-center justify-center -my-1">
              <button
                type="button"
                onClick={handleSwapCurrencies}
                className="p-2 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-600 text-cyan-400 hover:text-cyan-300 transition-all shadow-md active:scale-95"
                title="Invert Currencies"
              >
                <ArrowUpDown className="w-4 h-4" />
              </button>
            </div>

            {/* TO Input Card */}
            <div className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700/80 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>You Receive (To)</span>
                <span className="text-[11px] font-mono text-cyan-400">
                  Rate guaranteed for {rateCountdown}s
                </span>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-full text-2xl font-mono font-bold text-emerald-400 truncate">
                  {toCurDef.symbol}
                  {quote.toAmount.toLocaleString(undefined, {
                    minimumFractionDigits: toCurDef.decimals,
                    maximumFractionDigits: toCurDef.decimals,
                  })}
                </div>

                <select
                  value={toCurrency}
                  onChange={(e) => {
                    const newTo = e.target.value as CurrencyCode;
                    setToCurrency(newTo);
                    if (newTo === fromCurrency) {
                      setFromCurrency(newTo === 'EUR' ? 'USD' : 'EUR');
                    }
                  }}
                  className="bg-slate-700/90 border border-slate-600 text-white font-bold text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                >
                  {Object.values(SUPPORTED_CURRENCIES).map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.code}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Transparent Fee Disclosure (FR-04 & FR-07 principle: NEVER HIDE THE FEE) */}
            <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2 text-xs">
              <div className="flex items-center justify-between font-semibold text-slate-300">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  Transparent Fee Breakdown
                </span>
                <span className="text-[11px] text-emerald-400 font-mono">No hidden spread</span>
              </div>

              <div className="flex justify-between text-slate-400">
                <span>Exchange Rate:</span>
                <span className="font-mono text-slate-200">
                  1 {fromCurrency} = {quote.rate} {toCurrency}
                </span>
              </div>

              <div className="flex justify-between text-slate-400">
                <span>GlobalPay FX Fee (0.45%):</span>
                <span className="font-mono text-amber-300">
                  {fromCurDef.symbol}
                  {quote.fee.currencyConversionFee.toFixed(2)} {fromCurrency}
                </span>
              </div>

              <div className="flex justify-between text-slate-400">
                <span>Total Cost to Wallet:</span>
                <span className="font-mono text-slate-200">
                  {fromCurDef.symbol}
                  {(numAmount + quote.fee.totalFee).toFixed(2)} {fromCurrency}
                </span>
              </div>

              <div className="pt-2 border-t border-slate-800 flex justify-between font-bold text-slate-100">
                <span>Net Credited to {toCurrency}:</span>
                <span className="font-mono text-emerald-400 text-sm">
                  {toCurDef.symbol}
                  {quote.toAmount.toFixed(toCurDef.decimals)}
                </span>
              </div>
            </div>

            {/* Submit Action */}
            <button
              disabled={isExecuting || numAmount <= 0 || isInsufficient}
              onClick={handleExecute}
              className={`w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
                isInsufficient
                  ? 'bg-slate-800 text-red-400 cursor-not-allowed border border-red-500/30'
                  : 'bg-gradient-to-r from-emerald-500 to-teal-400 hover:brightness-105 text-slate-950 shadow-lg shadow-emerald-500/25 active:scale-[0.98]'
              }`}
            >
              {isExecuting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Locking Rate & Settling Ledger...</span>
                </>
              ) : isInsufficient ? (
                <span>Insufficient {fromCurrency} Balance</span>
              ) : (
                <>
                  <span>Confirm Currency Swap</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
