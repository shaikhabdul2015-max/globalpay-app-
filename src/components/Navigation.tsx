import React from 'react';
import { Home, Wallet, QrCode, Clock, User, ShieldAlert, Bell, Sparkles } from 'lucide-react';
import { usePayment } from '../store/paymentContext';

interface NavigationProps {
  currentTab?: 'home' | 'wallet' | 'scan' | 'activity' | 'profile' | 'admin' | 'kyc';
  setCurrentTab?: (tab: any) => void;
  onOpenNotifications?: () => void;
  onOpenAuth?: () => void;
}

export const TopBar: React.FC<NavigationProps> = ({
  currentTab: propTab,
  setCurrentTab: propSetTab,
  onOpenNotifications,
  onOpenAuth,
}) => {
  const {
    currentUser,
    currentTab: ctxTab,
    setCurrentTab: ctxSetTab,
    unreadNotificationCount,
    baseCurrency,
    setBaseCurrency,
    switchPersona,
    openModal,
  } = usePayment();

  const currentTab = propTab || ctxTab;
  const setCurrentTab = propSetTab || ctxSetTab;

  return (
    <header className="sticky top-0 z-40 w-full bg-slate-900/90 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
        {/* Brand & Persona */}
        <div className="flex items-center gap-3">
          <div
            onClick={() => setCurrentTab('home')}
            className="flex items-center gap-2 cursor-pointer group"
          >
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-slate-950 font-black text-sm shadow-md shadow-emerald-500/20">
              G
            </div>
            <div>
              <div className="font-bold text-slate-100 text-sm tracking-tight leading-none group-hover:text-emerald-400 transition-colors">
                GlobalPay
              </div>
              <div className="text-[10px] text-emerald-400 font-medium tracking-wide flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                LIVE FX
              </div>
            </div>
          </div>

          {/* Quick Persona Switcher Chip */}
          <div className="hidden sm:flex items-center ml-3 pl-3 border-l border-slate-800">
            <span className="text-xs text-slate-400 mr-2">Persona:</span>
            <select
              value={currentUser.persona}
              onChange={(e) => switchPersona(e.target.value)}
              className="bg-slate-800/80 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
            >
              <option value="tourist">Alex (Tourist - USD, EUR, INR)</option>
              <option value="freelancer">Elena (Freelancer - EUR, USD, GBP)</option>
              <option value="student">Kenji (Student - CAD, JPY)</option>
              <option value="business">Marcus (Business - USD, AED, SGD)</option>
            </select>
          </div>
        </div>

        {/* Right side controls: Admin / Notifications / Profile */}
        <div className="flex items-center gap-2">
          {/* Admin Operations Hub Button (FR-18) */}
          <button
            onClick={() => setCurrentTab(currentTab === 'admin' ? 'home' : 'admin')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
              currentTab === 'admin'
                ? 'bg-amber-500 text-slate-950 shadow-sm shadow-amber-500/30 font-semibold'
                : 'bg-slate-800/80 text-amber-300 hover:bg-slate-800 border border-amber-500/20'
            }`}
            title="Ops & Admin Dashboard (FR-18)"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden md:inline">Admin Hub</span>
          </button>

          {/* Notifications Bell */}
          <button
            onClick={() => (onOpenNotifications ? onOpenNotifications() : openModal('notifications'))}
            className="relative p-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/60 transition-colors"
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
            {unreadNotificationCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-emerald-500 text-slate-950 text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center animate-pulse">
                {unreadNotificationCount}
              </span>
            )}
          </button>

          {/* User Profile Avatar */}
          <button
            onClick={() => setCurrentTab('profile')}
            className="flex items-center gap-2 pl-1 py-0.5 rounded-full hover:ring-2 hover:ring-emerald-500/40 transition-all"
          >
            <img
              src={currentUser.avatar}
              alt={currentUser.name}
              className="w-7 h-7 rounded-full object-cover ring-1 ring-slate-700"
            />
          </button>
        </div>
      </div>
    </header>
  );
};

export const BottomNav: React.FC<NavigationProps> = ({
  currentTab: propTab,
  setCurrentTab: propSetTab,
}) => {
  const {
    currentTab: ctxTab,
    setCurrentTab: ctxSetTab,
    openModal,
    isAIChatOpen,
    toggleAIChat,
  } = usePayment();
  const currentTab = propTab || ctxTab;
  const setCurrentTab = propSetTab || ctxSetTab;

  const navItems: Array<{
    id: 'home' | 'wallet' | 'scan' | 'activity' | 'profile';
    label: string;
    icon: any;
    isPrimary?: boolean;
  }> = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'wallet', label: 'Wallet', icon: Wallet },
    { id: 'scan', label: 'Scan', icon: QrCode, isPrimary: true },
    { id: 'activity', label: 'Activity', icon: Clock },
    { id: 'profile', label: 'Profile', icon: User },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-lg border-t border-slate-800">
      {/* Mobile AI Assistant Trigger docked inside BottomNav bar area (never overlaps currency cards) */}
      <div className="md:hidden flex items-center justify-end px-3 pt-2 pb-1.5 border-b border-slate-800/70">
        <button
          type="button"
          onClick={toggleAIChat}
          aria-expanded={isAIChatOpen}
          aria-label="Ask GlobalPay AI"
          className={`min-h-[38px] px-3 py-1.5 rounded-xl border text-slate-100 flex items-center gap-2 transition-all active:scale-95 ${
            isAIChatOpen
              ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
              : 'bg-slate-800/90 hover:bg-slate-800 border-emerald-500/40'
          }`}
        >
          <span className="w-5 h-5 rounded-md bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-slate-950 shrink-0">
            <Sparkles className="w-3 h-3 stroke-[2.5]" />
          </span>
          <span className="text-xs font-bold tracking-tight whitespace-nowrap shrink-0">
            Ask GlobalPay AI
          </span>
        </button>
      </div>

      <div className="max-w-md mx-auto px-4 py-2 sm:py-2.5 flex items-center justify-between">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;

          if (item.isPrimary) {
            return (
              <button
                key={item.id}
                onClick={() => {
                  openModal('scan_qr');
                }}
                className="group relative top-0 md:-top-3 flex flex-col items-center focus:outline-none"
                aria-label="Scan QR Code"
              >
                <div className="w-11 h-11 md:w-13 md:h-13 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-slate-950 shadow-lg shadow-emerald-500/30 group-hover:scale-105 group-active:scale-95 transition-transform">
                  <QrCode className="w-5 h-5 md:w-6 md:h-6 stroke-[2.5]" />
                </div>
                <span className="text-[11px] font-bold text-emerald-400 mt-1">Scan QR</span>
              </button>
            );
          }

          return (
            <button
              key={item.id}
              onClick={() => setCurrentTab(item.id)}
              className={`flex flex-col items-center py-1 px-3 rounded-xl transition-all ${
                isActive
                  ? 'text-emerald-400 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className={`w-5 h-5 mb-0.5 ${isActive ? 'stroke-[2.2]' : 'stroke-1.5'}`} />
              <span className="text-[10px] tracking-tight">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
