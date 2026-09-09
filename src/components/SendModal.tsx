import React, { useState } from 'react';
import {
  X,
  Send,
  UserCheck,
  Plus,
  ArrowRight,
  ShieldCheck,
  Clock,
  Building,
  CheckCircle2,
  AlertCircle,
  Lock,
  RefreshCw,
} from 'lucide-react';
import { usePayment } from '../store/paymentContext';
import { SUPPORTED_CURRENCIES } from '../data/currencies';
import { CurrencyCode, Recipient } from '../types';

export const SendModal: React.FC = () => {
  const {
    currentUser,
    balances,
    recipients,
    addRecipient,
    calculateTransferQuote,
    executeTransfer,
    verifySecurityPin,
    closeModal,
    viewReceipt,
  } = usePayment();

  const [step, setStep] = useState<'select_recipient' | 'enter_amount' | 'security_pin' | 'success'>('select_recipient');
  const [selectedRecipient, setSelectedRecipient] = useState<Recipient>(recipients[0] || null);
  const [isAddingNew, setIsAddingNew] = useState<boolean>(false);
  const [fromCurrency, setFromCurrency] = useState<CurrencyCode>('USD');
  const [amountStr, setAmountStr] = useState<string>('250');
  const [notes, setNotes] = useState<string>('');
  const [enteredPin, setEnteredPin] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [completedTx, setCompletedTx] = useState<any | null>(null);

  // New recipient form state
  const [newName, setNewName] = useState('');
  const [newCountry, setNewCountry] = useState('Italy');
  const [newCurrency, setNewCurrency] = useState<CurrencyCode>('EUR');
  const [newType, setNewType] = useState<'bank' | 'wallet' | 'upi'>('bank');
  const [newAccount, setNewAccount] = useState('');
  const [newBank, setNewBank] = useState('');

  const numAmount = parseFloat(amountStr) || 0;
  const quote = selectedRecipient
    ? calculateTransferQuote(fromCurrency, selectedRecipient.currency, numAmount)
    : null;

  const availableInFrom = balances[fromCurrency]?.available || 0;
  const totalDebit = quote ? numAmount + quote.fee.totalFee : 0;
  const isInsufficient = availableInFrom < totalDebit;

  const handleAddNewRecipient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newAccount.trim()) {
      setErrorMsg('Please enter recipient name and account details.');
      return;
    }
    const created = addRecipient({
      name: newName.trim(),
      country: newCountry,
      currency: newCurrency,
      type: newType,
      accountNumber: newAccount.trim(),
      routingOrBank: newBank.trim() || 'Direct Local Rails',
      nickname: newName.split(' ')[0],
    });
    setSelectedRecipient(created);
    setIsAddingNew(false);
    setErrorMsg(null);
  };

  const handleProceedToReview = () => {
    setErrorMsg(null);
    if (!selectedRecipient) {
      setErrorMsg('Please select a recipient.');
      return;
    }
    if (numAmount <= 0) {
      setErrorMsg('Please enter a transfer amount.');
      return;
    }
    if (isInsufficient) {
      setErrorMsg(
        `Insufficient ${fromCurrency} balance. Needed: ${SUPPORTED_CURRENCIES[fromCurrency].symbol}${totalDebit.toFixed(
          2
        )}, Available: ${SUPPORTED_CURRENCIES[fromCurrency].symbol}${availableInFrom.toFixed(2)}`
      );
      return;
    }

    // High-risk security check: FR-10 requires authentication for large transfers (> $250)
    if (numAmount >= currentUser.security.requirePinAboveAmount) {
      setStep('security_pin');
    } else {
      executeSendDirectly();
    }
  };

  const executeSendDirectly = async () => {
    try {
      setIsProcessing(true);
      const tx = await executeTransfer(selectedRecipient, fromCurrency, numAmount, notes);
      setCompletedTx(tx);
      setStep('success');
    } catch (err: any) {
      setErrorMsg(err.message || 'Transfer failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!verifySecurityPin(enteredPin)) {
      setErrorMsg('Incorrect Security PIN. Demo PIN is: 1234');
      return;
    }
    await executeSendDirectly();
  };

  const fromCurDef = SUPPORTED_CURRENCIES[fromCurrency];
  const toCurDef = selectedRecipient ? SUPPORTED_CURRENCIES[selectedRecipient.currency] : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-3xl p-6 shadow-2xl relative overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <span>Cross-Border Transfer</span>
              <span className="text-[10px] bg-indigo-950 text-indigo-400 border border-indigo-800/50 px-2 py-0.5 rounded-full font-mono">
                FR-06
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Send directly to international bank accounts, wallets, or UPI
            </p>
          </div>
          <button
            onClick={closeModal}
            className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="mt-3 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* STEP 1: SELECT OR ADD RECIPIENT */}
        {step === 'select_recipient' && !isAddingNew && (
          <div className="space-y-4 pt-4 overflow-y-auto pr-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Select Recipient
              </span>
              <button
                onClick={() => setIsAddingNew(true)}
                className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-emerald-400 border border-emerald-500/30 text-xs font-bold flex items-center gap-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add New</span>
              </button>
            </div>

            <div className="space-y-2">
              {recipients.map((rec) => {
                const recCur = SUPPORTED_CURRENCIES[rec.currency];
                const isSelected = selectedRecipient?.id === rec.id;
                return (
                  <div
                    key={rec.id}
                    onClick={() => setSelectedRecipient(rec)}
                    className={`p-3.5 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-slate-800 border-emerald-500/80 ring-1 ring-emerald-500/30'
                        : 'bg-slate-800/40 hover:bg-slate-800/80 border-slate-700/60'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-700/70 flex items-center justify-center text-xl shrink-0">
                        {recCur.flag}
                      </div>
                      <div>
                        <div className="font-bold text-slate-100 text-xs flex items-center gap-1.5">
                          <span>{rec.name}</span>
                          <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {rec.routingOrBank} · {rec.accountNumber}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[11px] font-mono font-bold text-slate-200">
                        Receives in {rec.currency}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              disabled={!selectedRecipient}
              onClick={() => setStep('enter_amount')}
              className="w-full mt-4 py-3.5 rounded-2xl font-bold text-sm bg-gradient-to-r from-emerald-500 to-teal-400 hover:brightness-105 text-slate-950 shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
            >
              <span>Continue to Transfer Amount</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ADD NEW RECIPIENT FORM */}
        {step === 'select_recipient' && isAddingNew && (
          <form onSubmit={handleAddNewRecipient} className="space-y-3.5 pt-4 overflow-y-auto pr-1">
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs font-bold text-slate-200">New International Recipient</span>
              <button
                type="button"
                onClick={() => setIsAddingNew(false)}
                className="text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1">Full Legal Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Maria Gonzalez"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Destination Country</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Spain"
                  value={newCountry}
                  onChange={(e) => setNewCountry(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Payout Currency</label>
                <select
                  value={newCurrency}
                  onChange={(e) => setNewCurrency(e.target.value as CurrencyCode)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  {Object.values(SUPPORTED_CURRENCIES).map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.code} ({c.name})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1">Payout Method</label>
              <div className="grid grid-cols-3 gap-2">
                {(['bank', 'wallet', 'upi'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setNewType(m)}
                    className={`py-2 rounded-xl text-xs font-semibold uppercase border transition-all ${
                      newType === m
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/60'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                  >
                    {m === 'bank' ? 'Bank (IBAN)' : m === 'upi' ? 'UPI / VPA' : 'Wallet'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1">
                {newType === 'bank'
                  ? 'IBAN / Account Number'
                  : newType === 'upi'
                  ? 'UPI ID / VPA'
                  : 'Wallet ID'}
              </label>
              <input
                type="text"
                required
                placeholder={
                  newType === 'bank'
                    ? 'e.g. ES91 2100 0418 4502 0005 1332'
                    : newType === 'upi'
                    ? 'username@bank'
                    : 'globalpay.tag'
                }
                value={newAccount}
                onChange={(e) => setNewAccount(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1">Bank Name / BIC / Branch</label>
              <input
                type="text"
                placeholder="e.g. Santander Spain / BSCHESMMXXX"
                value={newBank}
                onChange={(e) => setNewBank(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-2xl font-bold text-sm bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-colors"
            >
              Save & Select Recipient
            </button>
          </form>
        )}

        {/* STEP 2: ENTER AMOUNT & REVIEW TRANSPARENT FEES */}
        {step === 'enter_amount' && selectedRecipient && quote && (
          <div className="space-y-4 pt-4 overflow-y-auto pr-1">
            {/* Recipient summary card */}
            <div className="p-3 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-700 flex items-center justify-center text-xl">
                  {toCurDef?.flag}
                </div>
                <div>
                  <div className="font-bold text-slate-100 text-xs">{selectedRecipient.name}</div>
                  <div className="text-[11px] text-slate-400">
                    {selectedRecipient.routingOrBank} ({selectedRecipient.currency})
                  </div>
                </div>
              </div>
              <button
                onClick={() => setStep('select_recipient')}
                className="text-xs text-emerald-400 hover:underline"
              >
                Change
              </button>
            </div>

            {/* SEND AMOUNT CARD */}
            <div className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>You Send</span>
                <span className="text-[11px]">
                  Available:{' '}
                  <button
                    type="button"
                    onClick={() => setAmountStr(availableInFrom.toString())}
                    className="font-mono text-emerald-400 font-bold hover:underline"
                  >
                    {fromCurDef.symbol}
                    {availableInFrom.toFixed(fromCurDef.decimals)} {fromCurrency}
                  </button>
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
                  value={fromCurrency}
                  onChange={(e) => setFromCurrency(e.target.value as CurrencyCode)}
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

            {/* RECIPIENT RECEIVES */}
            <div className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700 space-y-1">
              <div className="text-xs text-slate-400">Recipient Receives</div>
              <div className="text-2xl font-mono font-bold text-emerald-400">
                {toCurDef?.symbol}
                {quote.receiveAmount.toLocaleString(undefined, {
                  minimumFractionDigits: toCurDef?.decimals,
                  maximumFractionDigits: toCurDef?.decimals,
                })}{' '}
                <span className="text-sm font-sans font-semibold text-slate-300">
                  {selectedRecipient.currency}
                </span>
              </div>
              <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-1">
                <Clock className="w-3.5 h-3.5 text-cyan-400" />
                <span>Estimated arrival: {quote.estimatedArrival}</span>
              </div>
            </div>

            {/* Note / Reference */}
            <div>
              <label className="text-xs text-slate-400 block mb-1">Transfer Note / Reference</label>
              <input
                type="text"
                placeholder="e.g. Invoice #1042 / Family support"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            {/* Transparent Fee Engine (FR-07: NO SURPRISE FEES) */}
            <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-2 text-xs">
              <div className="flex items-center justify-between font-bold text-slate-200">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  Transparent Fee Engine (FR-07)
                </span>
                <span className="text-[10px] text-emerald-400 font-mono">No hidden spread</span>
              </div>

              <div className="flex justify-between text-slate-400">
                <span>Guaranteed FX Rate:</span>
                <span className="font-mono text-slate-200">
                  1 {fromCurrency} = {quote.rate} {selectedRecipient.currency}
                </span>
              </div>

              <div className="flex justify-between text-slate-400">
                <span>Transfer Base Fee:</span>
                <span className="font-mono text-slate-300">
                  {fromCurDef.symbol}
                  {quote.fee.transferFee.toFixed(2)} {fromCurrency}
                </span>
              </div>

              <div className="flex justify-between text-slate-400">
                <span>FX Conversion Fee (0.3%):</span>
                <span className="font-mono text-slate-300">
                  {fromCurDef.symbol}
                  {quote.fee.currencyConversionFee.toFixed(2)} {fromCurrency}
                </span>
              </div>

              <div className="flex justify-between text-slate-400">
                <span>Partner/Network Settlement Fee:</span>
                <span className="font-mono text-slate-300">
                  {fromCurDef.symbol}
                  {quote.fee.networkFee.toFixed(2)} {fromCurrency}
                </span>
              </div>

              <div className="pt-2 border-t border-slate-800 flex justify-between items-baseline font-bold">
                <span className="text-slate-100 text-sm">Total Paid by You:</span>
                <span className="text-emerald-400 font-mono text-base">
                  {fromCurDef.symbol}
                  {totalDebit.toFixed(2)} {fromCurrency}
                </span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStep('select_recipient')}
                className="py-3 px-4 rounded-2xl bg-slate-800 text-slate-300 font-semibold text-xs border border-slate-700 hover:bg-slate-750"
              >
                Back
              </button>
              <button
                type="button"
                disabled={isInsufficient || numAmount <= 0}
                onClick={handleProceedToReview}
                className={`flex-1 py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
                  isInsufficient
                    ? 'bg-slate-800 text-red-400 border border-red-500/30 cursor-not-allowed'
                    : 'bg-gradient-to-r from-emerald-500 to-teal-400 hover:brightness-105 text-slate-950 shadow-lg shadow-emerald-500/25 active:scale-[0.98]'
                }`}
              >
                <span>Continue to Confirmation</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: SECURITY AUTHENTICATION (FR-10: High-risk action verification) */}
        {step === 'security_pin' && (
          <form onSubmit={handlePinSubmit} className="py-6 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto ring-8 ring-indigo-500/10">
              <Lock className="w-7 h-7" />
            </div>

            <div>
              <h3 className="text-lg font-extrabold text-white">Security Verification</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                Transfers over $250 require your 4-digit security PIN or biometric passkey (FR-10).
              </p>
            </div>

            <div className="py-2">
              <input
                type="password"
                maxLength={4}
                autoFocus
                value={enteredPin}
                onChange={(e) => setEnteredPin(e.target.value)}
                placeholder="••••"
                className="w-36 mx-auto text-center font-mono text-3xl tracking-widest bg-slate-800 border border-slate-700 rounded-2xl py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <div className="text-[11px] text-slate-500 mt-2">
                Demo Security PIN: <span className="font-mono text-emerald-400 font-bold">1234</span>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStep('enter_amount')}
                className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-300 font-semibold text-xs border border-slate-700"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={isProcessing || enteredPin.length !== 4}
                className="flex-1 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Authorizing...</span>
                  </>
                ) : (
                  <span>Authorize Transfer</span>
                )}
              </button>
            </div>
          </form>
        )}

        {/* STEP 4: SUCCESS & TRACKER */}
        {step === 'success' && completedTx && (
          <div className="py-6 text-center space-y-4 pt-4 overflow-y-auto">
            <div className="w-14 h-14 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto ring-8 ring-emerald-500/10">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div>
              <h3 className="text-xl font-extrabold text-white">Transfer Initiated!</h3>
              <p className="text-xs text-slate-400 mt-1">
                Transaction ID:{' '}
                <span className="font-mono text-emerald-400 font-semibold">{completedTx.id}</span>
              </p>
            </div>

            {/* Live Progress Stepper (FR-06: Draft -> Pending -> Processing -> Completed) */}
            <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60 text-xs space-y-3">
              <div className="text-left font-bold text-slate-300">Transfer Rails Status:</div>
              <div className="grid grid-cols-4 gap-1 text-[10px] text-center">
                <div className="space-y-1">
                  <div className="w-3 h-3 rounded-full bg-emerald-400 mx-auto ring-4 ring-emerald-500/20"></div>
                  <span className="text-emerald-400 font-medium">Initiated</span>
                </div>
                <div className="space-y-1">
                  <div className="w-3 h-3 rounded-full bg-emerald-400 mx-auto ring-4 ring-emerald-500/20"></div>
                  <span className="text-emerald-400 font-medium">FX Locked</span>
                </div>
                <div className="space-y-1">
                  <div className="w-3 h-3 rounded-full bg-emerald-400 mx-auto ring-4 ring-emerald-500/20"></div>
                  <span className="text-emerald-400 font-medium">Banking Rail</span>
                </div>
                <div className="space-y-1">
                  <div className="w-3 h-3 rounded-full bg-emerald-400 mx-auto ring-4 ring-emerald-500/20"></div>
                  <span className="text-emerald-400 font-bold">Delivered</span>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-800/40 border border-slate-700/50 text-xs space-y-2 text-left">
              <div className="flex justify-between">
                <span className="text-slate-400">Recipient:</span>
                <span className="text-slate-200 font-medium">{completedTx.recipient.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Delivered Amount:</span>
                <span className="text-emerald-400 font-mono font-bold">
                  {toCurDef?.symbol}
                  {completedTx.toAmount.toFixed(toCurDef?.decimals)} {completedTx.toCurrency}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Debit from Wallet:</span>
                <span className="font-mono text-slate-200 font-semibold">
                  {fromCurDef.symbol}
                  {(completedTx.fromAmount + completedTx.fees.totalFee).toFixed(2)}{' '}
                  {completedTx.fromCurrency}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Estimated Delivery:</span>
                <span className="text-cyan-400">
                  {completedTx.transferDetails?.estimatedArrival}
                </span>
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
        )}
      </div>
    </div>
  );
};
