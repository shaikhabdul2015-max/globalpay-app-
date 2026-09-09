import React, { useState } from 'react';
import {
  X,
  Bell,
  CheckCircle2,
  AlertCircle,
  Clock,
  ShieldAlert,
  ArrowRight,
  TrendingUp,
  Check,
  Sparkles,
} from 'lucide-react';
import { usePayment } from '../store/paymentContext';
import { AppNotification } from '../types';

interface NotificationsModalProps {
  onClose: () => void;
}

export const NotificationsModal: React.FC<NotificationsModalProps> = ({ onClose }) => {
  const { notifications, markNotificationAsRead, clearAllNotifications } = usePayment();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const filtered = notifications.filter((n) => (filter === 'unread' ? !n.read : true));

  const getNotificationIcon = (n: AppNotification) => {
    switch (n.type) {
      case 'transaction':
        return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
      case 'security':
        return <ShieldAlert className="w-4 h-4 text-rose-400" />;
      case 'kyc':
        return <Clock className="w-4 h-4 text-amber-400" />;
      case 'rate_alert':
        return <TrendingUp className="w-4 h-4 text-cyan-400" />;
      default:
        return <Bell className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-3xl p-6 shadow-2xl relative overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <span>Notifications & Alerts</span>
              <span className="text-[10px] bg-slate-800 text-cyan-400 border border-slate-700 px-2 py-0.5 rounded-full font-mono">
                FR-09
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Instant alerts for transactions, exchange rates, and security
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter & Clear Actions */}
        <div className="flex items-center justify-between pt-3 pb-2 text-xs">
          <div className="flex gap-1.5">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1 rounded-xl font-semibold transition-colors ${
                filter === 'all'
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All ({notifications.length})
            </button>
            <button
              onClick={() => setFilter('unread')}
              className={`px-3 py-1 rounded-xl font-semibold transition-colors ${
                filter === 'unread'
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Unread ({notifications.filter((n) => !n.read).length})
            </button>
          </div>

          <button
            onClick={clearAllNotifications}
            className="text-slate-500 hover:text-slate-300 text-[11px]"
          >
            Clear All
          </button>
        </div>

        {/* Notification List */}
        <div className="space-y-2.5 overflow-y-auto pr-1 flex-1 py-1">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-xs">
              <Bell className="w-8 h-8 mx-auto mb-2 opacity-40" />
              No notifications at this time
            </div>
          ) : (
            filtered.map((n) => (
              <div
                key={n.id}
                onClick={() => markNotificationAsRead(n.id)}
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                  n.read
                    ? 'bg-slate-800/30 border-slate-800/80 text-slate-400'
                    : 'bg-slate-800/80 border-slate-700 text-slate-200 ring-1 ring-emerald-500/20'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-slate-700/80 flex items-center justify-center shrink-0 mt-0.5">
                    {getNotificationIcon(n)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-xs text-white truncate">{n.title}</div>
                      {!n.read && (
                        <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"></span>
                      )}
                    </div>
                    <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">{n.message}</p>
                    <div className="text-[10px] text-slate-500 mt-1 font-mono">
                      {new Date(n.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
