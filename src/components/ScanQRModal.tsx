import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Camera,
  Flashlight,
  Upload,
  QrCode,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  MapPin,
  RefreshCw,
  Info,
  ArrowRight,
} from 'lucide-react';
import { usePayment } from '../store/paymentContext';
import { SAMPLE_MERCHANT_QRS, SUPPORTED_CURRENCIES, SampleMerchantQR } from '../data/currencies';
import { CurrencyCode } from '../types';

export const ScanQRModal: React.FC = () => {
  const {
    currentUser,
    balances,
    calculateQRQuote,
    executeQRPayment,
    closeModal,
    viewReceipt,
  } = usePayment();

  const [step, setStep] = useState<'scanning' | 'confirming' | 'success'>('scanning');
  const [selectedMerchant, setSelectedMerchant] = useState<SampleMerchantQR>(SAMPLE_MERCHANT_QRS[0]);
  const [customAmountStr, setCustomAmountStr] = useState<string>(
    SAMPLE_MERCHANT_QRS[0].requestedAmount.toString()
  );
  const [payFromCurrency, setPayFromCurrency] = useState<CurrencyCode>('USD');
  const [flashlightOn, setFlashlightOn] = useState<boolean>(false);
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [completedTx, setCompletedTx] = useState<any | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Attempt real camera access if supported, with graceful fallback
  useEffect(() => {
    let active = true;

    async function startCamera() {
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' },
          });
          if (active && videoRef.current) {
            videoRef.current.srcObject = stream;
            streamRef.current = stream;
            setCameraActive(true);
          }
        }
      } catch (err: any) {
        if (active) {
          setCameraError('Camera preview in sandbox mode. Select a test tourist merchant QR below.');
          setCameraActive(false);
        }
      }
    }

    startCamera();

    return () => {
      active = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const handleSelectPreset = (merchant: SampleMerchantQR) => {
    setSelectedMerchant(merchant);
    setCustomAmountStr(merchant.requestedAmount.toString());
    setErrorMsg(null);
    setStep('confirming');
  };

  const handleSimulateScan = () => {
    // Select the current merchant and proceed to confirmation
    setStep('confirming');
  };

  const merchantAmount = parseFloat(customAmountStr) || selectedMerchant.requestedAmount;
  const quote = calculateQRQuote(payFromCurrency, selectedMerchant.currency, merchantAmount);
  const availableInPayFrom = balances[payFromCurrency]?.available || 0;
  const isInsufficient = availableInPayFrom < quote.userDebitAmount;

  const handleConfirmPayment = async () => {
    setErrorMsg(null);
    if (isInsufficient) {
      setErrorMsg(
        `Insufficient ${payFromCurrency} balance. Needed: ${SUPPORTED_CURRENCIES[payFromCurrency].symbol}${quote.userDebitAmount.toFixed(
          2
        )}, Available: ${SUPPORTED_CURRENCIES[payFromCurrency].symbol}${availableInPayFrom.toFixed(2)}`
      );
      return;
    }

    try {
      setIsProcessing(true);
      const tx = await executeQRPayment(selectedMerchant, payFromCurrency, merchantAmount);
      setCompletedTx(tx);
      setStep('success');
    } catch (err: any) {
      setErrorMsg(err.message || 'QR Payment failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const merchantCurDef = SUPPORTED_CURRENCIES[selectedMerchant.currency];
  const userCurDef = SUPPORTED_CURRENCIES[payFromCurrency];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-3xl p-6 shadow-2xl relative overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <span>International QR Payment</span>
              <span className="text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800/50 px-2 py-0.5 rounded-full font-mono">
                FR-05
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Pay local merchants seamlessly in your preferred currency
            </p>
          </div>
          <button
            onClick={closeModal}
            className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* STEP 1: SCANNING VIEW */}
        {step === 'scanning' && (
          <div className="space-y-4 pt-4 overflow-y-auto pr-1">
            {/* Camera Viewport */}
            <div className="relative aspect-square max-h-60 w-full rounded-2xl bg-slate-950 overflow-hidden border-2 border-dashed border-emerald-500/40 flex flex-col items-center justify-center text-center p-4 group">
              {cameraActive ? (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <div className="space-y-2 z-10">
                  <div className="w-12 h-12 rounded-2xl bg-slate-800 text-emerald-400 flex items-center justify-center mx-auto border border-slate-700">
                    <QrCode className="w-6 h-6 animate-pulse" />
                  </div>
                  <div className="text-xs font-semibold text-slate-200">
                    Live Camera Scanner Active
                  </div>
                  <div className="text-[11px] text-slate-400 max-w-xs">
                    Point camera at merchant EMVCo, UPI, PromptPay, or SGQR code
                  </div>
                </div>
              )}

              {/* Viewfinder Overlay Targeting Corners */}
              <div className="absolute inset-8 pointer-events-none border-2 border-emerald-400/80 rounded-xl">
                <div className="absolute -top-1 -left-1 w-4 h-4 border-t-4 border-l-4 border-emerald-400"></div>
                <div className="absolute -top-1 -right-1 w-4 h-4 border-t-4 border-r-4 border-emerald-400"></div>
                <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-4 border-l-4 border-emerald-400"></div>
                <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-4 border-r-4 border-emerald-400"></div>
                <div className="w-full h-0.5 bg-emerald-400/60 shadow-sm shadow-emerald-400 animate-[bounce_2s_infinite]"></div>
              </div>

              {/* Controls bar inside scanner */}
              <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between z-20">
                <button
                  type="button"
                  onClick={() => setFlashlightOn(!flashlightOn)}
                  className={`p-2 rounded-xl text-xs font-semibold backdrop-blur-md flex items-center gap-1.5 transition-colors ${
                    flashlightOn
                      ? 'bg-amber-400 text-slate-950 font-bold'
                      : 'bg-slate-900/80 text-slate-200 border border-slate-700'
                  }`}
                >
                  <Flashlight className="w-4 h-4" />
                  <span>{flashlightOn ? 'Torch On' : 'Flash'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleSimulateScan}
                  className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold shadow-md flex items-center gap-1.5 transition-transform active:scale-95"
                >
                  <Camera className="w-4 h-4" />
                  <span>Scan Active Target</span>
                </button>
              </div>
            </div>

            {/* Tourist Preset Merchants (Simulate scanning real tourist merchants) */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                  Sample International Merchant QRs
                </span>
                <span className="text-[11px] text-slate-500">Tap to test scan</span>
              </div>

              <div className="space-y-2">
                {SAMPLE_MERCHANT_QRS.map((merchant) => (
                  <div
                    key={merchant.id}
                    onClick={() => handleSelectPreset(merchant)}
                    className="p-3 rounded-2xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 hover:border-emerald-500/50 flex items-center justify-between cursor-pointer transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-700/50 flex items-center justify-center text-xl shrink-0 group-hover:scale-105 transition-transform">
                        {merchant.flag}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-200 text-xs truncate group-hover:text-emerald-300">
                          {merchant.name}
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                          <MapPin className="w-3 h-3 text-slate-500" />
                          <span className="truncate">{merchant.location}</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0 pl-2">
                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-700 text-emerald-400 border border-slate-600">
                        {merchant.standard}
                      </span>
                      <div className="font-mono font-bold text-xs text-slate-100 mt-1">
                        {SUPPORTED_CURRENCIES[merchant.currency].symbol}
                        {merchant.requestedAmount.toLocaleString()} {merchant.currency}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: CONFIRMING PAYMENT (FR-05 Security: NEVER SEND AUTOMATICALLY) */}
        {step === 'confirming' && (
          <div className="space-y-4 pt-4 overflow-y-auto pr-1">
            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Merchant Identity Card */}
            <div className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-700 flex items-center justify-center text-2xl">
                  {selectedMerchant.flag}
                </div>
                <div>
                  <div className="font-bold text-slate-100 text-sm">{selectedMerchant.name}</div>
                  <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5">
                    <span>{selectedMerchant.category}</span>
                    <span>•</span>
                    <span className="font-mono text-emerald-400 text-[11px]">
                      {selectedMerchant.standard} Standard
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Terminal: {selectedMerchant.terminalId}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setStep('scanning')}
                className="text-xs text-slate-400 hover:text-white underline shrink-0"
              >
                Rescan
              </button>
            </div>

            {/* Merchant Requested Amount */}
            <div className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700/80 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Merchant Requests</span>
                <span className="text-[11px] font-mono text-slate-400">
                  Currency: {selectedMerchant.currency}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold font-mono text-white">
                  {merchantCurDef.symbol}
                </span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={customAmountStr}
                  onChange={(e) => setCustomAmountStr(e.target.value)}
                  className="w-full bg-transparent text-2xl font-mono font-bold text-white focus:outline-none"
                />
                <span className="px-2.5 py-1 rounded-lg bg-slate-700 text-slate-200 text-xs font-bold font-mono">
                  {selectedMerchant.currency}
                </span>
              </div>
            </div>

            {/* Choose Which Wallet to Pay From */}
            <div className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700/80 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Pay Using Your Available Balance</span>
                <span className="text-[11px]">
                  Avail:{' '}
                  <span className="font-mono text-emerald-400 font-semibold">
                    {userCurDef.symbol}
                    {availableInPayFrom.toFixed(2)}
                  </span>
                </span>
              </div>

              <select
                value={payFromCurrency}
                onChange={(e) => setPayFromCurrency(e.target.value as CurrencyCode)}
                className="w-full bg-slate-700/90 border border-slate-600 text-white font-bold text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
              >
                {Object.values(SUPPORTED_CURRENCIES)
                  .filter((c) => !balances[c.code]?.hidden)
                  .map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.code} Wallet — Available: {c.symbol}
                      {(balances[c.code]?.available || 0).toFixed(c.decimals)}
                    </option>
                  ))}
              </select>
            </div>

            {/* Transparent Conversion & Fee Disclosure (FR-05 & FR-07) */}
            <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-2.5 text-xs">
              <div className="flex items-center justify-between font-semibold text-slate-200">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  Transparent FX & Fee Disclosure
                </span>
                <span className="text-[10px] text-emerald-400 font-mono">Guaranteed Rate</span>
              </div>

              <div className="flex justify-between text-slate-400">
                <span>Direct Exchange Rate:</span>
                <span className="font-mono text-slate-200">
                  1 {payFromCurrency} ≈ {quote.rate} {selectedMerchant.currency}
                </span>
              </div>

              <div className="flex justify-between text-slate-400">
                <span>Converted Subtotal:</span>
                <span className="font-mono text-slate-200">
                  {userCurDef.symbol}
                  {(quote.userDebitAmount - quote.fee.totalFee).toFixed(2)} {payFromCurrency}
                </span>
              </div>

              <div className="flex justify-between text-slate-400">
                <span>Transparent Payment Fee:</span>
                <span className="font-mono text-amber-300">
                  +{userCurDef.symbol}
                  {quote.fee.totalFee.toFixed(2)} {payFromCurrency}
                </span>
              </div>

              <div className="pt-2 border-t border-slate-800 flex justify-between items-baseline font-bold">
                <span className="text-slate-100 text-sm">Total Debit from Your Wallet:</span>
                <span className="text-emerald-400 font-mono text-lg">
                  {userCurDef.symbol}
                  {quote.userDebitAmount.toFixed(2)} {payFromCurrency}
                </span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStep('scanning')}
                className="py-3 px-4 rounded-2xl bg-slate-800 text-slate-300 font-semibold text-xs border border-slate-700 hover:bg-slate-750 transition-colors"
              >
                Back
              </button>
              <button
                type="button"
                disabled={isProcessing || isInsufficient || merchantAmount <= 0}
                onClick={handleConfirmPayment}
                className={`flex-1 py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
                  isInsufficient
                    ? 'bg-slate-800 text-red-400 border border-red-500/30 cursor-not-allowed'
                    : 'bg-gradient-to-r from-emerald-500 to-teal-400 hover:brightness-105 text-slate-950 shadow-lg shadow-emerald-500/25 active:scale-[0.98]'
                }`}
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Processing Payment...</span>
                  </>
                ) : isInsufficient ? (
                  <span>Insufficient {payFromCurrency}</span>
                ) : (
                  <>
                    <span>Confirm & Pay {userCurDef.symbol}{quote.userDebitAmount.toFixed(2)}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: SUCCESS & RECEIPT */}
        {step === 'success' && completedTx && (
          <div className="py-6 text-center space-y-4 pt-4">
            <div className="w-14 h-14 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto ring-8 ring-emerald-500/10">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-xl font-extrabold text-white">Payment Successful!</h3>
              <p className="text-xs text-slate-400 mt-1">
                Merchant received{' '}
                <span className="font-mono text-emerald-400 font-bold">
                  {merchantCurDef.symbol}
                  {completedTx.toAmount.toLocaleString()} {completedTx.toCurrency}
                </span>
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60 text-xs space-y-2.5 text-left">
              <div className="flex justify-between">
                <span className="text-slate-400">Transaction ID:</span>
                <span className="font-mono text-slate-200 font-semibold">{completedTx.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Merchant:</span>
                <span className="text-slate-200 font-medium">{completedTx.recipient.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">QR Standard:</span>
                <span className="text-emerald-400 font-mono font-bold">
                  {completedTx.qrData?.standard}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Total Paid by You:</span>
                <span className="font-mono text-slate-200 font-bold">
                  {userCurDef.symbol}
                  {(completedTx.fromAmount + completedTx.fees.totalFee).toFixed(2)}{' '}
                  {completedTx.fromCurrency}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Transparent Fee:</span>
                <span className="font-mono text-slate-300">
                  {userCurDef.symbol}
                  {completedTx.fees.totalFee.toFixed(2)}
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
