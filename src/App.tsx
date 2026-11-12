/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { PaymentProvider, usePayment } from './store/paymentContext';
import { TopBar, BottomNav } from './components/Navigation';
import { HomeScreen } from './components/HomeScreen';
import { WalletScreen } from './components/WalletScreen';
import { ActivityScreen } from './components/ActivityScreen';
import { KYCScreen } from './components/KYCScreen';
import { ProfileSecurityScreen } from './components/ProfileSecurityScreen';
import { AdminDashboard } from './components/AdminDashboard';
import { SwapModal } from './components/SwapModal';
import { ScanQRModal } from './components/ScanQRModal';
import { SendModal } from './components/SendModal';
import { AddMoneyModal } from './components/AddMoneyModal';
import { NotificationsModal } from './components/NotificationsModal';
import { AuthModal } from './components/AuthModal';
import { ReceiptModal } from './components/ReceiptModal';
import { AIAssistantChatbox } from './components/AIAssistantChatbox';

const AppContent: React.FC = () => {
  const { currentTab, setCurrentTab, activeModal, closeModal, activeReceipt, closeReceipt } =
    usePayment();

  const [showNotifications, setShowNotifications] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-slate-950">
      {/* Fixed Top Bar */}
      <TopBar
        onOpenNotifications={() => setShowNotifications(true)}
        onOpenAuth={() => setShowAuthModal(true)}
      />

      {/* Main Content Viewport */}
      <main className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 pt-20 pb-28 md:pb-16">
        {currentTab === 'home' && <HomeScreen />}
        {currentTab === 'wallet' && <WalletScreen />}
        {currentTab === 'activity' && <ActivityScreen />}
        {currentTab === 'kyc' && <KYCScreen />}
        {currentTab === 'profile' && (
          <ProfileSecurityScreen
            onOpenKYC={() => setCurrentTab('kyc')}
            onOpenAuth={() => setShowAuthModal(true)}
          />
        )}
        {currentTab === 'admin' && <AdminDashboard />}
      </main>

      {/* Bottom Nav on Mobile / Secondary Nav */}
      <BottomNav />

      {/* Floating GlobalPay AI Financial Assistant */}
      <AIAssistantChatbox />

      {/* Modals triggered by state */}
      {activeModal === 'swap' && <SwapModal />}
      {activeModal === 'scan_qr' && <ScanQRModal />}
      {activeModal === 'send' && <SendModal />}
      {activeModal === 'add_money' && <AddMoneyModal />}

      {/* Auxiliary Modals */}
      {(showNotifications || activeModal === 'notifications') && (
        <NotificationsModal
          onClose={() => {
            setShowNotifications(false);
            closeModal();
          }}
        />
      )}
      {(showAuthModal || activeModal === 'auth') && (
        <AuthModal
          onClose={() => {
            setShowAuthModal(false);
            closeModal();
          }}
        />
      )}
      {(activeReceipt || activeModal === 'receipt') && (
        <ReceiptModal transaction={activeReceipt} onClose={closeReceipt} />
      )}
    </div>
  );
};

export default function App() {
  return (
    <PaymentProvider>
      <AppContent />
    </PaymentProvider>
  );
}
