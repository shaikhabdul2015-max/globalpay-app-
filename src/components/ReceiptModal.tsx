import React from 'react';
import {
  X,
  Printer,
  Share2,
  CheckCircle2,
  ShieldCheck,
  Building,
  QrCode,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { usePayment } from '../store/paymentContext';
import { SUPPORTED_CURRENCIES } from '../data/currencies';
import { Transaction } from '../types';

interface ReceiptModalProps {
  transaction: Transaction | null;
  onClose: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({ transaction, onClose }) => {
  if (!transaction) return null;

  const fromCur = SUPPORTED_CURRENCIES[transaction.fromCurrency];
  const toCur = SUPPORTED_CURRENCIES[transaction.toCurrency];

  const handlePrint = () => {
    window.print();
  };

  const formattedDate = new Date(transaction.timestamp).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Top Actions */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-900">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
            <span className="font-mono text-xs font-bold text-slate-300">
              OFFICIAL PAYMENT RECEIPT
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
              title="Print Receipt"
            >
              <Printer className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Receipt Paper Container */}
        <div className="p-6 overflow-y-auto space-y-5 bg-gradient-to-b from-slate-900 to-slate-950">
          {/* Branded Watermark & Header */}
          <div className="text-center space-y-1">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-slate-950 font-black text-xl mx-auto shadow-md shadow-emerald-500/20">
              G
            </div>
            <h2 className="text-base font-extrabold text-white tracking-tight">GlobalPay International</h2>
            <div className="text-[11px] text-slate-400">Cross-Border Payment & Settlement Voucher</div>
            <div className="text-[10px] font-mono text-emerald-400 font-bold tracking-wider">
              {transaction.id}
            </div>
          </div>

          {/* Amount Badge */}
          <div className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700/80 text-center space-y-1">
            <div className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">
              {transaction.type === 'swap'
                ? 'Total Converted'
                : transaction.type === 'deposit'
                ? 'Amount Credited'
                : 'Payment Amount'}
            </div>
            <div className="text-2xl sm:text-3xl font-black font-mono text-white">
              {toCur.symbol}
              {transaction.toAmount.toLocaleString(undefined, {
                minimumFractionDigits: toCur.decimals,
                maximumFractionDigits: toCur.decimals,
              })}{' '}
              <span className="text-sm font-sans font-bold text-slate-400">
                {transaction.toCurrency}
              </span>
            </div>
            <div className="text-[11px] text-emerald-400 font-medium flex items-center justify-center gap-1.5 pt-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span className="capitalize">{transaction.status} on Settlement Rails</span>
            </div>
          </div>

          {/* Detailed Financial Breakdown (Transparent fee engine) */}
          <div className="rounded-2xl bg-slate-800/50 border border-slate-800 p-4 space-y-2.5 text-xs">
            <div className="flex justify-between text-slate-400">
              <span>Date & Time:</span>
              <span className="text-slate-200 font-mono">{formattedDate}</span>
            </div>

            <div className="flex justify-between text-slate-400">
              <span>Transaction Type:</span>
              <span className="text-slate-200 uppercase font-semibold text-[11px]">
                {transaction.type.replace('_', ' ')}
              </span>
            </div>

            <div className="flex justify-between text-slate-400">
              <span>Sender Account:</span>
              <span className="text-slate-200 font-medium">
                {transaction.sender.name} ({transaction.fromCurrency})
              </span>
            </div>

            <div className="flex justify-between text-slate-400">
              <span>Recipient / Merchant:</span>
              <span className="text-slate-200 font-semibold">
                {transaction.recipient.name}
              </span>
            </div>

            {transaction.qrData && (
              <div className="flex justify-between text-slate-400">
                <span>QR Standard:</span>
                <span className="text-emerald-400 font-mono font-bold">
                  {transaction.qrData.standard}
                </span>
              </div>
            )}

            <div className="pt-2 border-t border-slate-700/60 flex justify-between text-slate-400">
              <span>Debited from Wallet:</span>
              <span className="font-mono text-slate-200 font-medium">
                {fromCur.symbol}
                {transaction.fromAmount.toFixed(fromCur.decimals)} {transaction.fromCurrency}
              </span>
            </div>

            <div className="flex justify-between text-slate-400">
              <span>Applied Exchange Rate:</span>
              <span className="font-mono text-slate-200">
                1 {transaction.fromCurrency} = {transaction.exchangeRate} {transaction.toCurrency}
              </span>
            </div>

            <div className="flex justify-between text-slate-400">
              <span>Transparent Service Fee:</span>
              <span className="font-mono text-amber-300">
                {fromCur.symbol}
                {transaction.fees.totalFee.toFixed(2)} {transaction.fromCurrency}
              </span>
            </div>

            <div className="pt-2 border-t border-slate-700/60 flex justify-between items-baseline font-bold text-sm">
              <span className="text-slate-200">Total Charged:</span>
              <span className="font-mono text-emerald-400">
                {fromCur.symbol}
                {(transaction.fromAmount + transaction.fees.totalFee).toFixed(fromCur.decimals)}{' '}
                {transaction.fromCurrency}
              </span>
            </div>
          </div>

          {/* Audit Trail Log */}
          <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-1.5 text-[11px]">
            <div className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">
              System Audit Trail & Signatures
            </div>
            {transaction.auditTrail.map((trail, idx) => (
              <div key={idx} className="flex justify-between text-slate-500 font-mono text-[10px]">
                <span>{trail.action}</span>
                <span>{trail.actor}</span>
              </div>
            ))}
          </div>

          <div className="text-center pt-1">
            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
