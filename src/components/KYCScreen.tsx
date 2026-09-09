import React, { useState } from 'react';
import {
  ShieldCheck,
  FileText,
  Camera,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Upload,
  User,
  MapPin,
  Calendar,
  X,
  RefreshCw,
  Info,
} from 'lucide-react';
import { usePayment } from '../store/paymentContext';
import { KYCStatus } from '../types';

interface KYCScreenProps {
  onClose?: () => void;
}

export const KYCScreen: React.FC<KYCScreenProps> = ({ onClose }) => {
  const { currentUser, submitKYC } = usePayment();
  const kyc = currentUser.kyc;

  const [step, setStep] = useState<number>(1);
  const [fullName, setFullName] = useState(kyc.fullName || currentUser.name);
  const [dob, setDob] = useState(kyc.dateOfBirth || '1995-06-14');
  const [country, setCountry] = useState(kyc.country || 'United States');
  const [address, setAddress] = useState(
    kyc.address || '742 Evergreen Terrace, San Francisco, CA 94107'
  );
  const [idType, setIdType] = useState<'passport' | 'national_id' | 'drivers_license'>(
    kyc.idType || 'passport'
  );
  const [idNumber, setIdNumber] = useState(kyc.idNumber || 'P884920193');
  const [docUploaded, setDocUploaded] = useState<boolean>(kyc.idDocumentUploaded);
  const [selfieVerified, setSelfieVerified] = useState<boolean>(kyc.selfieVerified);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const getStatusBadge = (status: KYCStatus) => {
    switch (status) {
      case 'verified':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Verified</span>
          </span>
        );
      case 'pending':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            <span>Under Review</span>
          </span>
        );
      case 'additional_review':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-400 border border-indigo-500/40 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5" />
            <span>Additional Info Required</span>
          </span>
        );
      case 'rejected':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/40 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Rejected</span>
          </span>
        );
      default:
        return (
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-700 text-slate-300 flex items-center gap-1.5">
            <span>Not Started</span>
          </span>
        );
    }
  };

  const handleFinalSubmit = () => {
    setIsSubmitting(true);
    setTimeout(() => {
      submitKYC({
        fullName,
        dateOfBirth: dob,
        country,
        address,
        idType,
        idNumber,
        idDocumentUploaded: true,
        selfieVerified: true,
      });
      setIsSubmitting(false);
      setShowSuccess(true);
    }, 1200);
  };

  return (
    <div className="space-y-6 pb-24 max-w-xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <span>Identity & KYC Verification</span>
            <span className="text-[10px] bg-slate-800 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-mono">
              FR-02
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Required for cross-border financial transactions and high-volume limits
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Current Status Card */}
      <div className="p-5 rounded-3xl bg-slate-800/80 border border-slate-700/80 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Current Tier Status
          </div>
          {getStatusBadge(kyc.status)}
        </div>

        {kyc.status === 'verified' ? (
          <div className="space-y-2">
            <div className="text-sm font-semibold text-slate-200">
              Full International Access Active
            </div>
            <p className="text-xs text-slate-400">
              Your identity has been verified via {kyc.idType?.toUpperCase()} #{kyc.idNumber}. You
              can hold unlimited multi-currency balances and send up to $50,000/day.
            </p>
            {kyc.reviewerNotes && (
              <div className="p-2.5 rounded-xl bg-slate-900/60 text-[11px] font-mono text-emerald-400 border border-slate-700/60">
                Compliance Note: {kyc.reviewerNotes}
              </div>
            )}
          </div>
        ) : kyc.status === 'additional_review' ? (
          <div className="p-3 rounded-2xl bg-indigo-950/40 border border-indigo-800/40 text-xs text-indigo-200 space-y-1">
            <div className="font-bold text-indigo-300">Why additional information is required:</div>
            <div>{kyc.requiredInfoReason || 'Please re-verify your proof of residency address.'}</div>
          </div>
        ) : kyc.status === 'rejected' ? (
          <div className="p-3 rounded-2xl bg-red-950/40 border border-red-800/40 text-xs text-red-200 space-y-1">
            <div className="font-bold text-red-400">Verification Declined:</div>
            <div>
              {kyc.reviewerNotes || 'Documents could not be verified against official databases.'}
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-400">
            Submit your government-issued ID and a quick liveness selfie to unlock global cross-border payments.
          </p>
        )}
      </div>

      {/* Guided Verification Stepper if not verified or updating */}
      {kyc.status !== 'verified' && !showSuccess && (
        <div className="p-6 rounded-3xl bg-slate-800/50 border border-slate-700/60 space-y-5">
          {/* Steps Indicator */}
          <div className="flex items-center justify-between border-b border-slate-700/60 pb-3 text-xs">
            <div
              className={`font-semibold flex items-center gap-1.5 ${
                step >= 1 ? 'text-emerald-400' : 'text-slate-500'
              }`}
            >
              <span className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-[10px]">
                1
              </span>
              <span>Personal Info</span>
            </div>
            <div
              className={`font-semibold flex items-center gap-1.5 ${
                step >= 2 ? 'text-emerald-400' : 'text-slate-500'
              }`}
            >
              <span className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-[10px]">
                2
              </span>
              <span>Gov ID</span>
            </div>
            <div
              className={`font-semibold flex items-center gap-1.5 ${
                step >= 3 ? 'text-emerald-400' : 'text-slate-500'
              }`}
            >
              <span className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-[10px]">
                3
              </span>
              <span>Selfie Liveness</span>
            </div>
          </div>

          {/* STEP 1: Personal Info */}
          {step === 1 && (
            <div className="space-y-3.5">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Full Legal Name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Date of Birth</label>
                  <input
                    type="date"
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                    className="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">Country of Residence</label>
                  <input
                    type="text"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Residential Address</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <button
                type="button"
                onClick={() => setStep(2)}
                className="w-full py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-colors"
              >
                Continue to ID Verification
              </button>
            </div>
          )}

          {/* STEP 2: ID Document Upload */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Select Document Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'passport', label: 'Passport' },
                    { id: 'national_id', label: 'National ID' },
                    { id: 'drivers_license', label: 'Driver License' },
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setIdType(t.id as any)}
                      className={`py-2 px-1 rounded-xl text-xs font-semibold border transition-all ${
                        idType === t.id
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/60'
                          : 'bg-slate-900/60 text-slate-400 border-slate-700'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Document Number</label>
                <input
                  type="text"
                  value={idNumber}
                  onChange={(e) => setIdNumber(e.target.value)}
                  className="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              {/* Upload Box Simulation */}
              <div
                onClick={() => setDocUploaded(true)}
                className={`p-6 border-2 border-dashed rounded-2xl text-center cursor-pointer transition-colors ${
                  docUploaded
                    ? 'border-emerald-500/60 bg-emerald-950/20'
                    : 'border-slate-700 hover:border-slate-500 bg-slate-900/40'
                }`}
              >
                <Upload className="w-8 h-8 mx-auto text-emerald-400 mb-2" />
                <div className="text-xs font-bold text-slate-200">
                  {docUploaded ? 'Document Uploaded (passport_front.jpg)' : 'Upload Document Photo'}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Drag and drop or tap to upload high-resolution scan
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="py-2.5 px-4 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-colors"
                >
                  Continue to Liveness Check
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Liveness Selfie */}
          {step === 3 && (
            <div className="space-y-4 text-center">
              <div className="w-28 h-28 rounded-full border-4 border-emerald-500/40 bg-slate-950 flex items-center justify-center mx-auto overflow-hidden relative">
                {selfieVerified ? (
                  <CheckCircle2 className="w-12 h-12 text-emerald-400" />
                ) : (
                  <Camera className="w-10 h-10 text-slate-500 animate-pulse" />
                )}
              </div>

              <div>
                <h4 className="text-sm font-bold text-white">Biometric Liveness Match</h4>
                <p className="text-xs text-slate-400 max-w-xs mx-auto mt-1">
                  Position your face in the oval. Instant facial anti-spoofing algorithm validates
                  photo ID match.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelfieVerified(true)}
                className={`px-4 py-2 rounded-xl text-xs font-bold border transition-colors ${
                  selfieVerified
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                }`}
              >
                {selfieVerified ? '✓ Selfie Captured & Verified' : 'Simulate Camera Capture'}
              </button>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="py-2.5 px-4 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleFinalSubmit}
                  className="flex-1 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Submitting to Verification Engine...</span>
                    </>
                  ) : (
                    <span>Submit Identity Documents</span>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {showSuccess && (
        <div className="p-6 rounded-3xl bg-slate-800/80 border border-slate-700 text-center space-y-3">
          <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
          <h3 className="text-lg font-bold text-white">Documents Received!</h3>
          <p className="text-xs text-slate-400">
            Our automated compliance system is reviewing your submission. You can track verification
            status or approve it via the Admin Hub.
          </p>
          <button
            onClick={() => setShowSuccess(false)}
            className="px-4 py-2 rounded-xl bg-slate-700 text-white text-xs font-semibold"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
};
