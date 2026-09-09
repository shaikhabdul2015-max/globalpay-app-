import React, { useState } from 'react';
import {
  X,
  Lock,
  Mail,
  Smartphone,
  Fingerprint,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
  KeyRound,
  User,
} from 'lucide-react';
import { usePayment } from '../store/paymentContext';
import { DEMO_PERSONAS } from '../data/currencies';

interface AuthModalProps {
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ onClose }) => {
  const { switchPersona, currentUser } = usePayment();

  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [emailOrPhone, setEmailOrPhone] = useState('alex.rivera@nomadtravel.io');
  const [password, setPassword] = useState('••••••••••••');
  const [isProcessing, setIsProcessing] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      setSuccessMsg(
        mode === 'forgot'
          ? 'Password recovery link sent to your registered email/phone!'
          : 'Authentication successful! Session credentials refreshed.'
      );
      setTimeout(() => {
        setSuccessMsg(null);
        onClose();
      }, 1500);
    }, 900);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-3xl p-6 shadow-2xl relative overflow-hidden space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-slate-950 font-black text-sm">
              G
            </div>
            <div>
              <h3 className="font-bold text-white text-base">
                {mode === 'login'
                  ? 'Sign In to GlobalPay'
                  : mode === 'signup'
                  ? 'Create Global Account'
                  : 'Account Recovery'}
              </h3>
              <p className="text-[11px] text-slate-400">Secure banking access & authentication (FR-01)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {successMsg ? (
          <div className="py-8 text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
            <div className="text-sm font-bold text-white">{successMsg}</div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3.5 pt-1">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Email or Mobile Number</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  required
                  value={emailOrPhone}
                  onChange={(e) => setEmailOrPhone(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>

            {mode !== 'forgot' && (
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs text-slate-400">Password / Master Passkey</label>
                  <button
                    type="button"
                    onClick={() => setMode('forgot')}
                    className="text-[11px] text-emerald-400 hover:underline"
                  >
                    Forgot?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isProcessing}
              className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-lg shadow-emerald-500/20"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Verifying Credentials...</span>
                </>
              ) : (
                <>
                  <span>{mode === 'login' ? 'Sign In Securely' : 'Continue'}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            {/* Quick Demo Persona Switcher */}
            <div className="pt-3 border-t border-slate-800 space-y-2">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider text-center">
                Or Instant Sign-In as Demo Persona:
              </div>

              <div className="grid grid-cols-2 gap-2">
                {Object.entries(DEMO_PERSONAS).map(([key, p]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      switchPersona(key);
                      onClose();
                    }}
                    className={`p-2 rounded-xl text-left border text-xs transition-all ${
                      currentUser.persona === key
                        ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300 font-bold'
                        : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <div className="truncate font-semibold">{p.name}</div>
                    <div className="text-[10px] text-slate-400 truncate">{p.personaTitle}</div>
                  </button>
                ))}
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
