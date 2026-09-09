import React, { useState } from 'react';
import {
  User,
  Shield,
  Smartphone,
  KeyRound,
  Fingerprint,
  Bell,
  Sliders,
  LogOut,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Laptop,
  Trash2,
  Lock,
} from 'lucide-react';
import { usePayment } from '../store/paymentContext';
import { DEMO_PERSONAS } from '../data/currencies';

export const ProfileSecurityScreen: React.FC<{
  onOpenKYC: () => void;
  onOpenAuth: () => void;
}> = ({ onOpenKYC, onOpenAuth }) => {
  const { currentUser, updateUser, switchPersona } = usePayment();

  const [dailyLimit, setDailyLimit] = useState(currentUser.security.dailyLimit.toString());
  const [requirePinAbove, setRequirePinAbove] = useState(
    currentUser.security.requirePinAboveAmount.toString()
  );
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleToggleBiometrics = () => {
    updateUser({
      security: {
        ...currentUser.security,
        biometricEnabled: !currentUser.security.biometricEnabled,
      },
    });
  };

  const handleToggle2FA = () => {
    updateUser({
      security: {
        ...currentUser.security,
        twoFactorEnabled: !currentUser.security.twoFactorEnabled,
      },
    });
  };

  const handleTogglePasskey = () => {
    updateUser({
      security: {
        ...currentUser.security,
        passkeyActive: !currentUser.security.passkeyActive,
      },
    });
  };

  const handleSaveLimits = (e: React.FormEvent) => {
    e.preventDefault();
    updateUser({
      security: {
        ...currentUser.security,
        dailyLimit: parseFloat(dailyLimit) || 5000,
        requirePinAboveAmount: parseFloat(requirePinAbove) || 250,
      },
    });
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  return (
    <div className="space-y-6 pb-24 max-w-xl mx-auto">
      {/* User Card */}
      <div className="p-6 rounded-3xl bg-slate-800/80 border border-slate-700/80 flex items-center gap-4">
        <img
          src={currentUser.avatar}
          alt={currentUser.name}
          className="w-16 h-16 rounded-full object-cover ring-2 ring-emerald-500/50"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-white truncate">{currentUser.name}</h2>
            <span className="text-[10px] bg-emerald-500/15 text-emerald-400 font-bold px-2 py-0.5 rounded-full border border-emerald-500/30">
              {currentUser.personaTitle}
            </span>
          </div>
          <div className="text-xs text-slate-400 mt-0.5">{currentUser.email}</div>
          <div className="text-[11px] text-slate-500 font-mono mt-0.5">{currentUser.phone}</div>
        </div>

        <button
          onClick={onOpenAuth}
          className="p-2 rounded-xl bg-slate-700/60 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
          title="Switch Account / Auth Flow"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>

      {/* KYC Tier Status Card */}
      <div
        onClick={onOpenKYC}
        className="p-4 rounded-2xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 flex items-center justify-between cursor-pointer transition-all"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-slate-200 text-xs">KYC & Identity Verification</div>
            <div className="text-[11px] text-slate-400 capitalize">
              Status: {currentUser.kyc.status.replace('_', ' ')}
            </div>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-slate-500" />
      </div>

      {/* Switch Persona Playground (Testing all 4 personas from FRD) */}
      <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60 space-y-2.5">
        <div className="text-xs font-bold text-slate-300 uppercase tracking-wider">
          Switch User Persona (FRD Personas A–D)
        </div>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(DEMO_PERSONAS).map(([key, p]) => (
            <button
              key={key}
              onClick={() => switchPersona(key)}
              className={`p-2.5 rounded-xl text-left border text-xs transition-all ${
                currentUser.persona === key
                  ? 'bg-emerald-500/15 border-emerald-500/60 text-emerald-300 font-bold'
                  : 'bg-slate-900/60 border-slate-700/60 text-slate-300 hover:bg-slate-900'
              }`}
            >
              <div className="truncate">{p.name}</div>
              <div className="text-[10px] text-slate-400 font-normal truncate">{p.personaTitle}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Security & Authentication Settings (FR-10) */}
      <div className="p-5 rounded-3xl bg-slate-800/60 border border-slate-700/60 space-y-4">
        <div className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
          <Lock className="w-3.5 h-3.5 text-emerald-400" />
          <span>Security & Authentication (FR-10)</span>
        </div>

        {/* Biometrics */}
        <div className="flex items-center justify-between py-1">
          <div className="flex items-center gap-3">
            <Fingerprint className="w-5 h-5 text-emerald-400" />
            <div>
              <div className="text-xs font-semibold text-white">Biometric Unlock</div>
              <div className="text-[11px] text-slate-400">TouchID / FaceID for quick access</div>
            </div>
          </div>
          <button
            onClick={handleToggleBiometrics}
            className={`w-11 h-6 rounded-full transition-colors relative ${
              currentUser.security.biometricEnabled ? 'bg-emerald-500' : 'bg-slate-700'
            }`}
          >
            <span
              className={`w-4 h-4 rounded-full bg-slate-950 absolute top-1 transition-transform ${
                currentUser.security.biometricEnabled ? 'left-6' : 'left-1'
              }`}
            ></span>
          </button>
        </div>

        {/* 2FA */}
        <div className="flex items-center justify-between py-1 border-t border-slate-700/50 pt-3">
          <div className="flex items-center gap-3">
            <Smartphone className="w-5 h-5 text-cyan-400" />
            <div>
              <div className="text-xs font-semibold text-white">Two-Factor Authentication (OTP)</div>
              <div className="text-[11px] text-slate-400">SMS / Authenticator app codes</div>
            </div>
          </div>
          <button
            onClick={handleToggle2FA}
            className={`w-11 h-6 rounded-full transition-colors relative ${
              currentUser.security.twoFactorEnabled ? 'bg-emerald-500' : 'bg-slate-700'
            }`}
          >
            <span
              className={`w-4 h-4 rounded-full bg-slate-950 absolute top-1 transition-transform ${
                currentUser.security.twoFactorEnabled ? 'left-6' : 'left-1'
              }`}
            ></span>
          </button>
        </div>

        {/* Passkey */}
        <div className="flex items-center justify-between py-1 border-t border-slate-700/50 pt-3">
          <div className="flex items-center gap-3">
            <KeyRound className="w-5 h-5 text-amber-400" />
            <div>
              <div className="text-xs font-semibold text-white">FIDO2 Passkey Support</div>
              <div className="text-[11px] text-slate-400">Passwordless cryptographic key</div>
            </div>
          </div>
          <button
            onClick={handleTogglePasskey}
            className={`w-11 h-6 rounded-full transition-colors relative ${
              currentUser.security.passkeyActive ? 'bg-emerald-500' : 'bg-slate-700'
            }`}
          >
            <span
              className={`w-4 h-4 rounded-full bg-slate-950 absolute top-1 transition-transform ${
                currentUser.security.passkeyActive ? 'left-6' : 'left-1'
              }`}
            ></span>
          </button>
        </div>
      </div>

      {/* Safety & Transfer Limits Form */}
      <form
        onSubmit={handleSaveLimits}
        className="p-5 rounded-3xl bg-slate-800/60 border border-slate-700/60 space-y-3"
      >
        <div className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
          <span>Safety & Transaction Limits</span>
          {saveSuccess && <span className="text-emerald-400 text-xs">Saved!</span>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-400 block mb-1">Daily Safety Limit ($)</label>
            <input
              type="number"
              value={dailyLimit}
              onChange={(e) => setDailyLimit(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
            />
          </div>

          <div>
            <label className="text-xs text-slate-400 block mb-1">PIN Required Above ($)</label>
            <input
              type="number"
              value={requirePinAbove}
              onChange={(e) => setRequirePinAbove(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
            />
          </div>
        </div>

        <button
          type="submit"
          className="w-full py-2.5 rounded-xl bg-slate-700 hover:bg-slate-650 text-slate-200 font-bold text-xs transition-colors"
        >
          Update Limits
        </button>
      </form>

      {/* Trusted Devices & Sessions (FR-10) */}
      <div className="p-5 rounded-3xl bg-slate-800/60 border border-slate-700/60 space-y-3">
        <div className="text-xs font-bold text-slate-300 uppercase tracking-wider">
          Active Devices & Sessions (FR-10)
        </div>

        <div className="space-y-2">
          {currentUser.sessions.map((sess) => (
            <div
              key={sess.id}
              className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-center justify-between text-xs"
            >
              <div className="flex items-center gap-3">
                {sess.deviceType === 'mobile' ? (
                  <Smartphone className="w-5 h-5 text-slate-400" />
                ) : (
                  <Laptop className="w-5 h-5 text-slate-400" />
                )}
                <div>
                  <div className="font-semibold text-slate-200 flex items-center gap-2">
                    <span>{sess.deviceName}</span>
                    {sess.isCurrent && (
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.2 rounded font-bold">
                        Current
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {sess.location} · {sess.lastActive}
                  </div>
                </div>
              </div>

              {!sess.isCurrent && (
                <button
                  onClick={() => {
                    updateUser({
                      sessions: currentUser.sessions.filter((s) => s.id !== sess.id),
                    });
                  }}
                  className="p-1.5 text-slate-500 hover:text-red-400"
                  title="Revoke session"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
