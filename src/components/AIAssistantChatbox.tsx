import React, { Component, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  CreditCard,
  Landmark,
  Lock,
  Mic,
  MicOff,
  Receipt,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { SUPPORTED_CURRENCIES } from '../data/currencies';
import {
  executeConfirmedSwap,
  executeConfirmedTopUp,
  executeConfirmedTransfer,
  fetchWalletStateFromBackend,
  sendAIMessage,
  transcribeAudioOnBackend,
  verifyTransactionOnBackend,
  type AIAssistantResponsePayload,
  type AIConfirmationProposal,
  type ChatTurnPayload,
} from '../services/aiWalletApi';
import { usePayment } from '../store/paymentContext';
import type { CurrencyCode, Recipient, Transaction } from '../types';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  isVoice?: boolean;
  responsePayload?: AIAssistantResponsePayload;
  proposalStatus?: 'pending' | 'executing' | 'confirmed' | 'cancelled' | 'error';
  proposalError?: string;
  executedTx?: Transaction;
}

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

const WELCOME_MESSAGE = `Hello! I'm GlobalPay AI.\nYour intelligent financial assistant.\nHow can I help you today?`;

const QUICK_SUGGESTIONS = [
  'Add $50 to my wallet',
  "What's my USD balance?",
  'Convert 100 USD to EUR',
  'Send $50 to Marco',
];

function formatCurrentTime(): string {
  try {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return 'Now';
  }
}

function createWelcomeMessage(): ChatMessage {
  return {
    id: 'msg-welcome',
    role: 'assistant',
    text: WELCOME_MESSAGE,
    timestamp: formatCurrentTime(),
  };
}

function getSpeechRecognitionCtor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Failed to read recorded audio.'));
    reader.readAsDataURL(blob);
  });
}

class SpeechRecognitionCtorProxy implements SpeechRecognitionLike {
  private instance: SpeechRecognitionLike;
  lang = 'en-US';
  interimResults = true;
  maxAlternatives = 1;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;

  constructor(Ctor: SpeechRecognitionConstructor) {
    this.instance = new Ctor();
    this.instance.lang = this.lang;
    this.instance.interimResults = this.interimResults;
    this.instance.maxAlternatives = this.maxAlternatives;
  }

  start() {
    this.instance.onresult = this.onresult;
    this.instance.onerror = this.onerror;
    this.instance.onend = this.onend;
    this.instance.start();
  }

  stop() {
    this.instance.stop();
  }
}

interface ChatboxErrorBoundaryProps {
  onClose: () => void;
  onReset: () => void;
  children: React.ReactNode;
}

interface ChatboxErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

class ChatboxErrorBoundary extends Component<ChatboxErrorBoundaryProps, ChatboxErrorBoundaryState> {
  declare props: Readonly<ChatboxErrorBoundaryProps>;
  declare state: ChatboxErrorBoundaryState;
  declare setState: (
    state:
      | ChatboxErrorBoundaryState
      | ((prevState: Readonly<ChatboxErrorBoundaryState>) => ChatboxErrorBoundaryState | null)
      | null
  ) => void;

  constructor(props: ChatboxErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, errorMessage: error?.message || 'Unexpected assistant render error.' };
  }

  componentDidCatch(error: Error) {
    console.error('GlobalPay AI Chatbox render error:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <section
          aria-label="GlobalPay AI Recovery"
          className="fixed inset-x-3 bottom-28 md:inset-x-auto md:right-4 md:bottom-20 md:w-[410px] z-[60] rounded-3xl bg-slate-900/95 backdrop-blur-2xl border border-red-500/40 p-5 shadow-2xl text-slate-100 space-y-3"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-red-300">
              <ShieldAlert className="w-4 h-4 text-red-400" />
              <span>GlobalPay AI encountered a display error</span>
            </div>
            <button
              type="button"
              onClick={this.props.onClose}
              className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white"
              aria-label="Close GlobalPay AI"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-slate-300">{this.state.errorMessage}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, errorMessage: '' });
                this.props.onReset();
              }}
              className="flex-1 py-2 rounded-xl bg-emerald-500 text-slate-950 font-bold text-xs"
            >
              Reset Assistant
            </button>
            <button
              type="button"
              onClick={this.props.onClose}
              className="flex-1 py-2 rounded-xl bg-slate-800 text-slate-200 font-semibold text-xs border border-slate-700"
            >
              Close
            </button>
          </div>
        </section>
      );
    }
    return this.props.children;
  }
}

const TypingText: React.FC<{ text?: string; animate: boolean }> = ({ text = '', animate }) => {
  const safeText = typeof text === 'string' ? text : '';
  const [displayed, setDisplayed] = useState(animate ? '' : safeText);

  useEffect(() => {
    if (!animate) {
      setDisplayed(safeText);
      return;
    }

    let prefersReducedMotion = false;
    try {
      prefersReducedMotion =
        typeof window !== 'undefined' &&
        Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    } catch {
      prefersReducedMotion = false;
    }

    if (prefersReducedMotion || safeText.length > 320) {
      setDisplayed(safeText);
      return;
    }

    let index = 0;
    setDisplayed('');
    const step = Math.max(2, Math.ceil(safeText.length / 26));
    const timer = window.setInterval(() => {
      index = Math.min(safeText.length, index + step);
      setDisplayed(safeText.slice(0, index));
      if (index >= safeText.length) {
        window.clearInterval(timer);
      }
    }, 16);

    return () => window.clearInterval(timer);
  }, [safeText, animate]);

  return <span className="whitespace-pre-line">{displayed}</span>;
};

export const AIAssistantChatbox: React.FC = () => {
  const {
    currentUser,
    balances,
    recipients,
    getWalletSnapshot,
    applyBackendExecution,
    executeTopUp,
    viewReceipt,
    isAIChatOpen: isOpen,
    setIsAIChatOpen: setIsOpen,
    toggleAIChat,
  } = usePayment();

  const [messages, setMessages] = useState<ChatMessage[]>(() => [createWelcomeMessage()]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [latestAnimatedId, setLatestAnimatedId] = useState<string | null>(null);

  // PayPal Sandbox Checkout overlay state (triggered automatically on add_money commands)
  const [payPalCheckout, setPayPalCheckout] = useState<{
    msgId: string;
    proposal: AIConfirmationProposal;
    buyerEmail: string;
    fundingSource: 'paypal_balance' | 'paypal_card';
    phase: 'ready' | 'processing' | 'approved' | 'error';
    paypalOrderId?: string;
    executedTx?: Transaction;
    error?: string;
  } | null>(null);

  // Voice recording state
  const [isListening, setIsListening] = useState(false);
  const [voicePreview, setVoicePreview] = useState('');
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);

  // Per-proposal confirmation inputs (PIN, new recipient details)
  const [pinInputs, setPinInputs] = useState<Record<string, string>>({});
  const [selectedRecipientMap, setSelectedRecipientMap] = useState<Record<string, string>>({});
  const [newRecipientForms, setNewRecipientForms] = useState<
    Record<
      string,
      {
        name: string;
        country: string;
        currency: CurrencyCode;
        type: 'bank' | 'wallet' | 'upi';
        accountNumber: string;
        routingOrBank: string;
      }
    >
  >({});

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    try {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    } catch {
      // ignore scroll errors in restricted viewports
    }
  }, [messages, isLoading, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => {
      try {
        inputRef.current?.focus();
      } catch {
        // ignore focus errors
      }
    }, 120);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    setMessages([createWelcomeMessage()]);
    setErrorBanner(null);
    setPinInputs({});
    setSelectedRecipientMap({});
    setNewRecipientForms({});
    setPayPalCheckout(null);
  }, [currentUser?.id]);

  const openPayPalOverlayForProposal = (msgId: string, proposal: AIConfirmationProposal) => {
    setPayPalCheckout({
      msgId,
      proposal,
      buyerEmail: currentUser?.email || 'sb-buyer@globalpay-hackathon.paypal.com',
      fundingSource: proposal.method === 'card' ? 'paypal_card' : 'paypal_balance',
      phase: 'ready',
    });
  };

  const handleSendMessage = async (rawText: string, isVoice = false) => {
    const trimmed = rawText.trim();
    if (!trimmed || isLoading) return;

    setErrorBanner(null);
    setInputValue('');

    const userMsg: ChatMessage = {
      id: `msg-u-${Date.now()}`,
      role: 'user',
      text: trimmed,
      timestamp: formatCurrentTime(),
      isVoice,
    };

    const currentMessages = Array.isArray(messages) ? messages : [];
    const nextHistory: ChatTurnPayload[] = [...currentMessages, userMsg]
      .filter((m) => m && m.id !== 'msg-welcome')
      .slice(-8)
      .map((m) => ({ role: m.role, text: typeof m.text === 'string' ? m.text : '' }));

    setMessages((prev) => [...(Array.isArray(prev) ? prev : []), userMsg]);
    setIsLoading(true);

    try {
      const snapshot = getWalletSnapshot();
      const aiResponse = await sendAIMessage(trimmed, nextHistory, snapshot);

      const assistantMsgId = `msg-a-${Date.now()}`;
      const proposal = aiResponse?.confirmationProposal;
      const safeReplyText =
        typeof aiResponse?.replyText === 'string' && aiResponse.replyText.length > 0
          ? aiResponse.replyText
          : 'Here are the details from your GlobalPay wallet.';

      if (proposal?.action === 'send' && proposal.recipientNeedsSetup) {
        setNewRecipientForms((prev) => ({
          ...prev,
          [assistantMsgId]: {
            name: proposal.recipientName || '',
            country: 'United States',
            currency: proposal.fromCurrency,
            type: 'bank',
            accountNumber: '',
            routingOrBank: '',
          },
        }));
      }

      const assistantMsg: ChatMessage = {
        id: assistantMsgId,
        role: 'assistant',
        text: safeReplyText,
        timestamp: formatCurrentTime(),
        responsePayload: aiResponse,
        proposalStatus: aiResponse?.requiresConfirmation ? 'pending' : undefined,
      };

      setLatestAnimatedId(assistantMsgId);
      setMessages((prev) => [...(Array.isArray(prev) ? prev : []), assistantMsg]);

      // Automatically trigger PayPal Sandbox Checkout overlay inside chat for add_money commands
      if (proposal?.action === 'add_money' && !proposal.validationError) {
        openPayPalOverlayForProposal(assistantMsgId, proposal);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to reach GlobalPay AI right now.';
      setErrorBanner(msg);
      const errMsgId = `msg-err-${Date.now()}`;
      setMessages((prev) => [
        ...(Array.isArray(prev) ? prev : []),
        {
          id: errMsgId,
          role: 'assistant',
          text: msg,
          timestamp: formatCurrentTime(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const stopVoiceCapture = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    setIsListening(false);
  };

  const handleToggleVoice = async () => {
    setErrorBanner(null);

    if (isListening) {
      stopVoiceCapture();
      return;
    }

    const SpeechCtor = getSpeechRecognitionCtor();
    if (SpeechCtor) {
      try {
        const recognition = new SpeechRecognitionCtorProxy(SpeechCtor);
        let finalTranscript = '';

        recognition.onresult = (event) => {
          let interim = '';
          const results = event?.results;
          const resultsCount = results?.length ?? 0;
          for (let i = 0; i < resultsCount; i++) {
            const res = results[i];
            const txt = res?.[0]?.transcript || '';
            if (res?.isFinal) {
              finalTranscript += `${txt} `;
            } else {
              interim += txt;
            }
          }
          setVoicePreview((finalTranscript + interim).trim());
        };

        recognition.onerror = (event) => {
          setIsListening(false);
          setVoicePreview('');
          if (event.error !== 'aborted') {
            setErrorBanner(`Voice recognition error: ${event.error}. Please try typing or speaking again.`);
          }
        };

        recognition.onend = () => {
          setIsListening(false);
          recognitionRef.current = null;
          const spoken = finalTranscript.trim();
          setVoicePreview('');
          if (spoken) {
            handleSendMessage(spoken, true);
          }
        };

        recognitionRef.current = recognition;
        setVoicePreview('');
        setIsListening(true);
        recognition.start();
        return;
      } catch {
        // Fall through to MediaRecorder + Gemini transcribe fallback
      }
    }

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      setErrorBanner('Voice input is not supported in this browser. Please type your command.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaChunksRef.current = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) {
          mediaChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setIsListening(false);
        setVoicePreview('');
        const blob = new Blob(mediaChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size < 256) return;

        setIsLoading(true);
        try {
          const base64 = await blobToBase64(blob);
          const snapshot = getWalletSnapshot();
          const { transcript } = await transcribeAudioOnBackend(
            base64,
            recorder.mimeType || 'audio/webm',
            snapshot
          );
          setIsLoading(false);
          if (transcript) {
            await handleSendMessage(transcript, true);
          } else {
            setErrorBanner('Could not detect speech. Please try speaking again.');
          }
        } catch (err: unknown) {
          setIsLoading(false);
          setErrorBanner(err instanceof Error ? err.message : 'Voice transcription failed.');
        }
      };

      mediaRecorderRef.current = recorder;
      setVoicePreview('Recording voice command... Tap mic to send.');
      setIsListening(true);
      recorder.start();
    } catch {
      setIsListening(false);
      setErrorBanner('Microphone access was denied or unavailable.');
    }
  };

  const handleConfirmProposal = async (msgId: string, proposal: AIConfirmationProposal) => {
    setErrorBanner(null);

    const updateMessageState = (patch: Partial<ChatMessage>) => {
      setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, ...patch } : m)));
    };

    const pin = pinInputs[msgId]?.trim();
    if (proposal.requiresPin && (!pin || pin.length < 4)) {
      updateMessageState({ proposalError: 'Enter your 4-digit security PIN to authorize this transfer.' });
      return;
    }

    const chosenExistingId = selectedRecipientMap[msgId] || proposal.recipientId;
    const newRecForm = newRecipientForms[msgId];

    if (proposal.action === 'send' && !chosenExistingId) {
      if (!newRecForm || !newRecForm.name.trim() || !newRecForm.accountNumber.trim()) {
        updateMessageState({
          proposalError: 'Select a saved recipient or enter valid account / IBAN / UPI details before confirming.',
        });
        return;
      }
    }

    updateMessageState({ proposalStatus: 'executing', proposalError: undefined });

    const idempotencyKey =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `idem-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    try {
      const snapshot = getWalletSnapshot();
      let result;

      if (proposal.action === 'send') {
        result = await executeConfirmedTransfer(
          {
            recipientId: chosenExistingId,
            newRecipient: chosenExistingId
              ? undefined
              : {
                  name: newRecForm.name.trim(),
                  country: newRecForm.country.trim() || 'International',
                  currency: newRecForm.currency,
                  type: newRecForm.type,
                  accountNumber: newRecForm.accountNumber.trim(),
                  routingOrBank: newRecForm.routingOrBank.trim() || 'GlobalPay Partner Rail',
                },
            fromCurrency: proposal.fromCurrency,
            amount: proposal.amount,
            notes: proposal.notes,
            pin,
            idempotencyKey,
          },
          snapshot
        );
      } else if (proposal.action === 'add_money') {
        const curInfo = SUPPORTED_CURRENCIES[proposal.currency];
        const methodLabel =
          proposal.method === 'paypal'
            ? 'PayPal Sandbox Checkout'
            : proposal.method === 'card'
            ? 'Visa / Mastercard Debit (0% promo)'
            : `${curInfo?.accountDetails?.systemName || proposal.currency} Local Transfer`;
        result = await executeConfirmedTopUp(
          {
            currency: proposal.currency,
            amount: proposal.amount,
            method: methodLabel,
            idempotencyKey,
          },
          snapshot
        );
      } else {
        result = await executeConfirmedSwap(
          {
            fromCurrency: proposal.fromCurrency,
            toCurrency: proposal.toCurrency,
            amount: proposal.amount,
            idempotencyKey,
          },
          snapshot
        );
      }

      const verifiedCheck = await verifyTransactionOnBackend(result.transaction.id, snapshot);
      await fetchWalletStateFromBackend(snapshot);
      applyBackendExecution(result);

      updateMessageState({
        proposalStatus: 'confirmed',
        executedTx: verifiedCheck.transaction,
        proposalError: undefined,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Transaction authorization failed.';
      updateMessageState({
        proposalStatus: 'pending',
        proposalError: message,
      });
    }
  };

  const handleApprovePayPalCheckout = async (source: 'paypal_balance' | 'paypal_card') => {
    if (!payPalCheckout || payPalCheckout.phase === 'processing') return;

    const { msgId, proposal } = payPalCheckout;
    setPayPalCheckout((prev) =>
      prev ? { ...prev, fundingSource: source, phase: 'processing', error: undefined } : prev
    );
    setMessages((prev) =>
      (Array.isArray(prev) ? prev : []).map((m) =>
        m.id === msgId ? { ...m, proposalStatus: 'executing', proposalError: undefined } : m
      )
    );

    const paypalOrderId = `PAYPAL-SB-${Date.now().toString(36).toUpperCase()}`;
    const methodLabel =
      source === 'paypal_card'
        ? `PayPal Sandbox Card (${paypalOrderId})`
        : `PayPal Sandbox Checkout (${paypalOrderId})`;

    const idempotencyKey =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `pp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    try {
      await new Promise((resolve) => window.setTimeout(resolve, 450));
      const snapshot = getWalletSnapshot();
      let completedTx: Transaction;

      try {
        const result = await executeConfirmedTopUp(
          {
            currency: proposal.currency,
            amount: proposal.amount,
            method: methodLabel,
            idempotencyKey,
          },
          snapshot
        );
        const verifiedCheck = await verifyTransactionOnBackend(result.transaction.id, snapshot);
        await fetchWalletStateFromBackend(snapshot);
        applyBackendExecution(result);
        completedTx = verifiedCheck.transaction;
      } catch {
        // Fallback to direct context top-up if backend route is unreachable in static mode
        completedTx = await executeTopUp(proposal.currency, proposal.amount, methodLabel);
      }

      setMessages((prev) =>
        (Array.isArray(prev) ? prev : []).map((m) =>
          m.id === msgId
            ? {
                ...m,
                proposalStatus: 'confirmed',
                executedTx: completedTx,
                proposalError: undefined,
              }
            : m
        )
      );

      setPayPalCheckout((prev) =>
        prev
          ? {
              ...prev,
              phase: 'approved',
              paypalOrderId,
              executedTx: completedTx,
            }
          : prev
      );
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'PayPal Sandbox authorization failed.';
      setMessages((prev) =>
        (Array.isArray(prev) ? prev : []).map((m) =>
          m.id === msgId ? { ...m, proposalStatus: 'pending', proposalError: errorMessage } : m
        )
      );
      setPayPalCheckout((prev) =>
        prev ? { ...prev, phase: 'error', error: errorMessage } : prev
      );
    }
  };

  const handleCancelProposal = (msgId: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, proposalStatus: 'cancelled', proposalError: undefined } : m))
    );
  };

  const handleSelectExistingRecipient = (msgId: string, recipient: Recipient) => {
    setSelectedRecipientMap((prev) => ({ ...prev, [msgId]: recipient.id }));
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId || !m.responsePayload?.confirmationProposal) return m;
        return {
          ...m,
          proposalError: undefined,
          responsePayload: {
            ...m.responsePayload,
            confirmationProposal: {
              ...m.responsePayload.confirmationProposal,
              recipientId: recipient.id,
              recipientName: recipient.name,
              recipientCountry: recipient.country,
              recipientBank: recipient.routingOrBank,
              recipientAccount: recipient.accountNumber,
              recipientNeedsSetup: false,
            },
          },
        };
      })
    );
  };

  const renderModalContent = () => {
    try {
      const safeUserName = currentUser?.name || 'GlobalPay User';
      const safeRecipients = Array.isArray(recipients) ? recipients : [];
      const safeMessages = Array.isArray(messages) ? messages : [];

      return (
        <section
          aria-label="GlobalPay AI Financial Assistant"
          className="fixed inset-x-3 bottom-28 md:inset-x-auto md:right-4 md:bottom-20 md:w-[410px] z-[60] h-[min(66vh,560px)] flex flex-col rounded-3xl bg-slate-900/95 backdrop-blur-2xl border border-slate-700/80 shadow-2xl shadow-black/60 overflow-hidden transition-all duration-200 ease-out"
        >
          {/* Header */}
          <header className="px-4 py-3.5 border-b border-slate-800/90 bg-slate-950/60 flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-slate-950 shadow-md shadow-emerald-500/20 shrink-0">
                <Sparkles className="w-4 h-4 stroke-[2.3]" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-slate-100 tracking-tight truncate">
                  GlobalPay AI
                </h2>
                <p className="text-[11px] text-emerald-400/90 truncate">
                  Financial Assistant · {safeUserName}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setMessages([createWelcomeMessage()]);
                  setErrorBanner(null);
                }}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800/80 transition-colors"
                title="Clear chat history"
                aria-label="Clear chat history"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  stopVoiceCapture();
                  setIsOpen(false);
                }}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800/80 transition-colors"
                title="Close GlobalPay AI"
                aria-label="Close GlobalPay AI"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </header>

          {/* Error Banner */}
          {errorBanner && (
            <div className="mx-3 mt-2.5 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/30 text-red-200 text-xs flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
                <span className="truncate">{errorBanner}</span>
              </div>
              <button
                type="button"
                onClick={() => setErrorBanner(null)}
                className="text-red-300 hover:text-white shrink-0"
                aria-label="Dismiss error"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Chat History */}
          <div className="flex-1 overflow-y-auto px-4 py-3.5 space-y-3.5">
            {safeMessages.map((msg) => {
              const isUser = msg.role === 'user';
              const payload = msg.responsePayload;
              const proposal = payload?.confirmationProposal;

              return (
                <div key={msg.id} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                      isUser
                        ? 'bg-gradient-to-tr from-emerald-500 to-teal-400 text-slate-950 font-semibold rounded-br-md shadow-md shadow-emerald-500/15'
                        : 'bg-slate-800/85 border border-slate-700/70 text-slate-100 rounded-bl-md'
                    }`}
                  >
                    {msg.isVoice && (
                      <div className="flex items-center gap-1 text-[10px] font-semibold opacity-80 mb-1">
                        <Mic className="w-3 h-3" />
                        <span>Voice command</span>
                      </div>
                    )}
                    {isUser ? (
                      <span>{msg.text ?? ''}</span>
                    ) : (
                      <TypingText text={msg.text ?? ''} animate={msg.id === latestAnimatedId} />
                    )}
                  </div>

                  {/* Real Wallet Balances Card */}
                  {Array.isArray(payload?.balanceSummary) && payload.balanceSummary.length > 0 && (
                    <div className="mt-2 w-full max-w-[94%] rounded-2xl bg-slate-950/80 border border-slate-800 p-3 space-y-2">
                      <div className="text-[11px] font-semibold text-slate-400">
                        Verified Wallet Balances
                      </div>
                      <div className="space-y-1.5">
                        {payload.balanceSummary.map((item) => {
                          const curDef = SUPPORTED_CURRENCIES[item.currency] || SUPPORTED_CURRENCIES.USD;
                          return (
                            <div
                              key={item.currency}
                              className="flex items-center justify-between text-xs py-1 border-b border-slate-800/80 last:border-b-0"
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-base">{item.flag}</span>
                                <span className="font-semibold text-slate-200">{item.currency}</span>
                                <span className="text-[11px] text-slate-400">{item.name}</span>
                              </div>
                              <div className="font-mono tabular-nums font-bold text-emerald-400">
                                {item.symbol}
                                {Number(item.available || 0).toLocaleString(undefined, {
                                  minimumFractionDigits: curDef.decimals,
                                  maximumFractionDigits: curDef.decimals,
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Real FX Conversion Quote Card */}
                  {payload?.conversionQuote && (
                    <div className="mt-2 w-full max-w-[94%] rounded-2xl bg-slate-950/80 border border-slate-800 p-3 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">Live Mid-Market Quote</span>
                        <span className="font-mono tabular-nums text-emerald-400 font-semibold">
                          1 {payload.conversionQuote.fromCurrency} = {payload.conversionQuote.rate}{' '}
                          {payload.conversionQuote.toCurrency}
                        </span>
                      </div>
                      <div className="flex items-center justify-between bg-slate-900/90 rounded-xl px-3 py-2 border border-slate-800">
                        <span className="font-mono tabular-nums text-sm font-bold text-slate-200">
                          {payload.conversionQuote.fromSymbol}
                          {payload.conversionQuote.fromAmount.toFixed(
                            (SUPPORTED_CURRENCIES[payload.conversionQuote.fromCurrency] || SUPPORTED_CURRENCIES.USD)
                              .decimals
                          )}{' '}
                          {payload.conversionQuote.fromCurrency}
                        </span>
                        <ArrowRight className="w-4 h-4 text-emerald-400" />
                        <span className="font-mono tabular-nums text-sm font-bold text-emerald-400">
                          {payload.conversionQuote.toSymbol}
                          {payload.conversionQuote.toAmount.toLocaleString(undefined, {
                            minimumFractionDigits: (
                              SUPPORTED_CURRENCIES[payload.conversionQuote.toCurrency] || SUPPORTED_CURRENCIES.USD
                            ).decimals,
                            maximumFractionDigits: (
                              SUPPORTED_CURRENCIES[payload.conversionQuote.toCurrency] || SUPPORTED_CURRENCIES.USD
                            ).decimals,
                          })}{' '}
                          {payload.conversionQuote.toCurrency}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 flex justify-between">
                        <span>Estimated Swap Fee (0.45%)</span>
                        <span className="font-mono tabular-nums text-slate-300">
                          {payload.conversionQuote.fromSymbol}
                          {payload.conversionQuote.swapFee.toFixed(2)}{' '}
                          {payload.conversionQuote.fromCurrency}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Real Recent Transactions Card */}
                  {Array.isArray(payload?.recentTransactions) && payload.recentTransactions.length > 0 && (
                    <div className="mt-2 w-full max-w-[94%] rounded-2xl bg-slate-950/80 border border-slate-800 p-3 space-y-2">
                      <div className="text-[11px] font-semibold text-slate-400">
                        Recent Ledger Activity
                      </div>
                      <div className="space-y-1.5">
                        {payload.recentTransactions.map((tx) => {
                          const fromDef = SUPPORTED_CURRENCIES[tx.fromCurrency] || SUPPORTED_CURRENCIES.USD;
                          const isCredit = tx.type === 'deposit' || tx.type === 'refund';
                          return (
                            <button
                              key={tx.id}
                              type="button"
                              onClick={() => viewReceipt(tx)}
                              className="w-full text-left flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-900/70 hover:bg-slate-800/80 border border-slate-800/80 transition-colors"
                            >
                              <div className="min-w-0">
                                <div className="text-xs font-semibold text-slate-200 truncate">
                                  {tx.title}
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono">
                                  {tx.id} · {tx.status}
                                </div>
                              </div>
                              <div
                                className={`font-mono tabular-nums text-xs font-bold shrink-0 ${
                                  isCredit ? 'text-emerald-400' : 'text-slate-100'
                                }`}
                              >
                                {isCredit ? '+' : '-'}
                                {fromDef.symbol}
                                {tx.fromAmount.toFixed(fromDef.decimals)}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Security-Gated Confirmation Card */}
                  {proposal && (() => {
                    const fromCurDef = SUPPORTED_CURRENCIES[proposal.fromCurrency] || SUPPORTED_CURRENCIES.USD;
                    const toCurDef = SUPPORTED_CURRENCIES[proposal.toCurrency] || SUPPORTED_CURRENCIES.USD;

                    return (
                      <div className="mt-2 w-full max-w-[96%] rounded-2xl bg-slate-950/90 border border-emerald-500/35 p-3.5 space-y-3 shadow-lg">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-100">
                            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                            <span>
                              {proposal.action === 'send'
                                ? 'Confirm Transfer'
                                : proposal.action === 'add_money'
                                ? 'Confirm Wallet Deposit'
                                : 'Confirm Currency Swap'}
                            </span>
                          </div>
                          <span className="text-[11px] font-mono text-emerald-400">
                            {msg.proposalStatus === 'confirmed'
                              ? 'Verified'
                              : msg.proposalStatus === 'cancelled'
                              ? 'Cancelled'
                              : 'Authorization Required'}
                          </span>
                        </div>

                        <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-2.5 space-y-1.5 text-xs">
                          {proposal.action === 'send' && (
                            <div className="flex justify-between gap-2">
                              <span className="text-slate-400">Recipient</span>
                              <span className="font-semibold text-slate-100 text-right truncate">
                                {proposal.recipientName}
                                {proposal.recipientCountry ? ` (${proposal.recipientCountry})` : ''}
                              </span>
                            </div>
                          )}

                          {proposal.action === 'add_money' && (
                            <div className="flex justify-between gap-2">
                              <span className="text-slate-400">Funding Method</span>
                              <span className="font-semibold text-slate-100 flex items-center gap-1">
                                {proposal.method === 'paypal' ? (
                                  <span className="text-sky-400 font-extrabold">PayPal Sandbox</span>
                                ) : proposal.method === 'card' ? (
                                  <>
                                    <CreditCard className="w-3.5 h-3.5 text-emerald-400" />
                                    <span>Debit / Credit Card</span>
                                  </>
                                ) : (
                                  <>
                                    <Landmark className="w-3.5 h-3.5 text-emerald-400" />
                                    <span>Local Bank Transfer</span>
                                  </>
                                )}
                              </span>
                            </div>
                          )}

                          <div className="flex justify-between gap-2">
                            <span className="text-slate-400">
                              {proposal.action === 'add_money' ? 'Deposit Amount' : 'Amount'}
                            </span>
                            <span className="font-mono tabular-nums font-bold text-slate-100">
                              {fromCurDef.symbol}
                              {proposal.amount.toFixed(fromCurDef.decimals)} {proposal.fromCurrency}
                            </span>
                          </div>

                          {proposal.action !== 'add_money' && (
                            <>
                              <div className="flex justify-between gap-2">
                                <span className="text-slate-400">FX Rate</span>
                                <span className="font-mono tabular-nums text-slate-300">
                                  1 {proposal.fromCurrency} = {proposal.rate} {proposal.toCurrency}
                                </span>
                              </div>
                              <div className="flex justify-between gap-2">
                                <span className="text-slate-400">Transparent Fee</span>
                                <span className="font-mono tabular-nums text-slate-300">
                                  {fromCurDef.symbol}
                                  {proposal.feeTotal.toFixed(2)} {proposal.fromCurrency}
                                </span>
                              </div>
                              <div className="flex justify-between gap-2 pt-1 border-t border-slate-800 font-bold">
                                <span className="text-slate-200">Total Wallet Debit</span>
                                <span className="font-mono tabular-nums text-emerald-400">
                                  {fromCurDef.symbol}
                                  {proposal.totalDebit.toFixed(2)} {proposal.fromCurrency}
                                </span>
                              </div>
                              <div className="flex justify-between gap-2 text-[11px]">
                                <span className="text-slate-400">
                                  {proposal.action === 'swap' ? 'Credited' : 'Recipient Receives'}
                                </span>
                                <span className="font-mono tabular-nums text-emerald-300 font-semibold">
                                  {toCurDef.symbol}
                                  {proposal.receiveAmount.toFixed(toCurDef.decimals)} {proposal.toCurrency}
                                </span>
                              </div>
                            </>
                          )}
                        </div>

                        {msg.proposalStatus === 'pending' &&
                          proposal.action === 'send' &&
                          proposal.recipientNeedsSetup && (
                            <div className="rounded-xl bg-slate-900/95 border border-amber-500/30 p-2.5 space-y-2 text-xs">
                              <div className="text-[11px] font-semibold text-amber-300">
                                Verify recipient "{proposal.recipientName}" before sending:
                              </div>

                              {safeRecipients.length > 0 && (
                                <div className="space-y-1">
                                  <div className="text-[10px] text-slate-400">
                                    Or select a saved recipient:
                                  </div>
                                  <div className="flex flex-wrap gap-1.5">
                                    {safeRecipients.slice(0, 4).map((rec) => (
                                      <button
                                        key={rec.id}
                                        type="button"
                                        onClick={() => handleSelectExistingRecipient(msg.id, rec)}
                                        className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-medium transition-colors"
                                      >
                                        {rec.name} ({rec.currency})
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {newRecipientForms[msg.id] && (
                                <div className="space-y-1.5 pt-1 border-t border-slate-800">
                                  <div className="text-[10px] text-slate-400">
                                    Or add payout details for {proposal.recipientName}:
                                  </div>
                                  <div className="grid grid-cols-2 gap-1.5">
                                    <input
                                      type="text"
                                      placeholder="Full Name"
                                      value={newRecipientForms[msg.id].name}
                                      onChange={(e) =>
                                        setNewRecipientForms((prev) => ({
                                          ...prev,
                                          [msg.id]: { ...prev[msg.id], name: e.target.value },
                                        }))
                                      }
                                      className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-[11px] text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                    />
                                    <select
                                      value={newRecipientForms[msg.id].currency}
                                      onChange={(e) =>
                                        setNewRecipientForms((prev) => ({
                                          ...prev,
                                          [msg.id]: {
                                            ...prev[msg.id],
                                            currency: e.target.value as CurrencyCode,
                                          },
                                        }))
                                      }
                                      className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-[11px] text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                    >
                                      {Object.values(SUPPORTED_CURRENCIES).map((c) => (
                                        <option key={c.code} value={c.code}>
                                          {c.code}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <input
                                    type="text"
                                    placeholder="Account / IBAN / UPI ID (e.g. john@okbank)"
                                    value={newRecipientForms[msg.id].accountNumber}
                                    onChange={(e) =>
                                      setNewRecipientForms((prev) => ({
                                        ...prev,
                                        [msg.id]: { ...prev[msg.id], accountNumber: e.target.value },
                                      }))
                                    }
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-[11px] text-white font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                  />
                                </div>
                              )}
                            </div>
                          )}

                        {msg.proposalStatus === 'pending' &&
                          proposal.requiresPin &&
                          !proposal.validationError && (
                            <div className="rounded-xl bg-slate-900 border border-slate-800 p-2.5 space-y-1.5">
                              <label className="text-[11px] text-slate-300 flex items-center gap-1.5 font-medium">
                                <Lock className="w-3.5 h-3.5 text-emerald-400" />
                                <span>Security PIN required (transfers ≥ ${proposal.pinThreshold})</span>
                              </label>
                              <input
                                type="password"
                                maxLength={4}
                                placeholder="Enter 4-digit PIN (demo: 1234)"
                                value={pinInputs[msg.id] || ''}
                                onChange={(e) =>
                                  setPinInputs((prev) => ({ ...prev, [msg.id]: e.target.value }))
                                }
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-mono tracking-widest text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                              />
                            </div>
                          )}

                        {(proposal.validationError || msg.proposalError) && (
                          <div className="p-2 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-[11px]">
                            {msg.proposalError || proposal.validationError}
                          </div>
                        )}

                        {msg.proposalStatus === 'pending' && (
                          <div className="flex items-center gap-2 pt-0.5">
                            <button
                              type="button"
                              onClick={() => handleCancelProposal(msg.id)}
                              className="flex-1 min-h-[40px] py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-colors"
                            >
                              Cancel
                            </button>
                            {proposal.action === 'add_money' ? (
                              <button
                                type="button"
                                disabled={Boolean(proposal.validationError)}
                                onClick={() => openPayPalOverlayForProposal(msg.id, proposal)}
                                className="flex-[1.5] min-h-[40px] py-2 px-3 rounded-xl bg-[#FFC439] hover:bg-[#f7b924] disabled:opacity-40 disabled:cursor-not-allowed text-[#003087] text-xs font-extrabold transition-all shadow-md"
                              >
                                Pay with PayPal
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={Boolean(proposal.validationError)}
                                onClick={() => handleConfirmProposal(msg.id, proposal)}
                                className="flex-1 min-h-[40px] py-2 px-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:brightness-105 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 text-xs font-bold transition-all"
                              >
                                Confirm
                              </button>
                            )}
                          </div>
                        )}

                        {msg.proposalStatus === 'executing' && (
                          <div className="flex items-center justify-center gap-2 py-2 text-xs text-emerald-400 font-semibold">
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span>Authorizing & verifying ledger settlement...</span>
                          </div>
                        )}

                        {msg.proposalStatus === 'confirmed' && msg.executedTx && (
                          <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-2.5 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                              <div className="min-w-0">
                                <div className="text-xs font-bold text-emerald-300">
                                  Completed · {msg.executedTx.id}
                                </div>
                                <div className="text-[10px] text-slate-300 truncate">
                                  Balances refreshed & verified
                                </div>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => viewReceipt(msg.executedTx!)}
                              className="px-2.5 py-1.5 rounded-lg bg-emerald-500 text-slate-950 font-bold text-[11px] flex items-center gap-1 shrink-0 hover:bg-emerald-400 transition-colors"
                            >
                              <Receipt className="w-3.5 h-3.5" />
                              <span>Receipt</span>
                            </button>
                          </div>
                        )}

                        {msg.proposalStatus === 'cancelled' && (
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                            <XCircle className="w-3.5 h-3.5 text-slate-500" />
                            <span>Cancelled. No funds were moved.</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  <span className="text-[10px] text-slate-500 mt-1 px-1">{msg.timestamp}</span>
                </div>
              );
            })}

            {/* Quick Suggestions on Welcome */}
            {(safeMessages?.length ?? 0) <= 1 && !isLoading && (
              <div className="pt-1 flex flex-wrap gap-1.5">
                {QUICK_SUGGESTIONS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => handleSendMessage(prompt)}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 hover:border-emerald-500/40 text-[11px] text-slate-200 transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}

            {/* Typing Animation / Loading Indicator */}
            {isLoading && (
              <div className="flex items-start">
                <div className="rounded-2xl rounded-bl-md px-3.5 py-2.5 bg-slate-800/85 border border-slate-700/70 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce [animation-delay:-0.2s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce [animation-delay:-0.1s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce" />
                  <span className="text-[11px] text-slate-400 ml-1">Thinking...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Live Voice Listening Bar */}
          {isListening && (
            <div className="mx-3 mb-2 px-3 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-between gap-2 text-xs text-emerald-200 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Mic className="w-4 h-4 text-emerald-400 animate-pulse shrink-0" />
                <span className="truncate">
                  {voicePreview || 'Listening... Say e.g. "Send fifty dollars to Marco"'}
                </span>
              </div>
              <button
                type="button"
                onClick={stopVoiceCapture}
                className="text-[11px] font-bold text-emerald-400 hover:underline shrink-0"
              >
                Stop
              </button>
            </div>
          )}

          {/* Input Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage(inputValue);
            }}
            className="p-3 border-t border-slate-800/90 bg-slate-950/70 flex items-center gap-2 shrink-0"
          >
            <button
              type="button"
              onClick={handleToggleVoice}
              disabled={isLoading}
              className={`min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center border transition-all shrink-0 ${
                isListening
                  ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md shadow-emerald-500/30'
                  : 'bg-slate-800/90 hover:bg-slate-800 text-slate-300 hover:text-emerald-400 border-slate-700'
              }`}
              title={isListening ? 'Stop voice input' : 'Speak voice command'}
              aria-label={isListening ? 'Stop voice input' : 'Speak voice command'}
            >
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>

            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              disabled={isLoading}
              placeholder="Ask GlobalPay AI..."
              aria-label="Message GlobalPay AI"
              className="flex-1 min-h-[44px] bg-slate-800/90 border border-slate-700/80 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />

            <button
              type="submit"
              disabled={isLoading || !inputValue.trim()}
              className="min-h-[44px] min-w-[44px] rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-slate-950 flex items-center justify-center shadow-md shadow-emerald-500/20 hover:brightness-105 disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0"
              title="Send message"
              aria-label="Send message"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>

          {/* PayPal Sandbox Checkout Modal Overlay Inside Chat Window */}
          {payPalCheckout && (() => {
            const ppProposal = payPalCheckout.proposal;
            const ppCur = SUPPORTED_CURRENCIES[ppProposal.currency] || SUPPORTED_CURRENCIES.USD;
            const currentBal = balances?.[ppProposal.currency]?.available || 0;
            const projectedBal =
              payPalCheckout.phase === 'approved'
                ? currentBal
                : parseFloat((currentBal + ppProposal.amount).toFixed(ppCur.decimals));

            return (
              <div
                role="dialog"
                aria-label="PayPal Sandbox Checkout"
                className="absolute inset-0 z-30 flex flex-col bg-slate-950/98 backdrop-blur-2xl text-slate-100"
              >
                {/* PayPal Sandbox Header */}
                <div className="px-4 py-3 border-b border-slate-800 bg-[#003087]/35 flex items-center justify-between gap-2 shrink-0">
                  <div className="flex items-center gap-2">
                    <div className="text-base font-black tracking-tight">
                      <span className="text-white">Pay</span>
                      <span className="text-sky-400">Pal</span>
                    </div>
                    <span className="px-2 py-0.5 rounded-md bg-sky-500/15 border border-sky-400/35 text-[10px] font-mono font-bold text-sky-300 uppercase">
                      Sandbox
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPayPalCheckout(null)}
                    className="p-1.5 rounded-xl bg-slate-800/80 text-slate-300 hover:text-white transition-colors"
                    aria-label="Close PayPal Checkout"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Overlay Body */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
                  {payPalCheckout.phase === 'approved' ? (
                    <div className="py-4 text-center space-y-3.5">
                      <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto ring-4 ring-emerald-500/15">
                        <CheckCircle2 className="w-7 h-7" />
                      </div>
                      <div>
                        <h3 className="text-base font-extrabold text-white">
                          PayPal Payment Approved!
                        </h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Your {ppProposal.currency} wallet balance on the dashboard has been updated.
                        </p>
                      </div>

                      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-3 text-xs space-y-2 text-left">
                        <div className="flex justify-between">
                          <span className="text-slate-400">PayPal Order ID</span>
                          <span className="font-mono text-sky-300 font-semibold">
                            {payPalCheckout.paypalOrderId}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Added to {ppProposal.currency}</span>
                          <span className="font-mono font-bold text-emerald-400">
                            +{ppCur.symbol}
                            {ppProposal.amount.toFixed(ppCur.decimals)} {ppProposal.currency}
                          </span>
                        </div>
                        <div className="flex justify-between pt-1.5 border-t border-slate-800">
                          <span className="text-slate-300 font-semibold">Updated Balance</span>
                          <span className="font-mono font-bold text-white">
                            {ppCur.flag} {ppCur.symbol}
                            {currentBal.toLocaleString(undefined, {
                              minimumFractionDigits: ppCur.decimals,
                              maximumFractionDigits: ppCur.decimals,
                            })}{' '}
                            {ppProposal.currency}
                          </span>
                        </div>
                      </div>

                      <div className="flex gap-2 pt-1">
                        {payPalCheckout.executedTx && (
                          <button
                            type="button"
                            onClick={() => {
                              const tx = payPalCheckout.executedTx!;
                              setPayPalCheckout(null);
                              viewReceipt(tx);
                            }}
                            className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 flex items-center justify-center gap-1.5"
                          >
                            <Receipt className="w-3.5 h-3.5" />
                            <span>Receipt</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setPayPalCheckout(null)}
                          className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs"
                        >
                          Done
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Order Summary */}
                      <div className="rounded-2xl bg-slate-900/95 border border-slate-800 p-3.5 space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Merchant</span>
                          <span className="font-bold text-slate-100">GlobalPay Wallet</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Target Wallet</span>
                          <span className="font-semibold text-slate-100">
                            {ppCur.flag} {ppCur.name} ({ppProposal.currency})
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Current → After Top-Up</span>
                          <span className="font-mono tabular-nums text-slate-200">
                            {ppCur.symbol}
                            {currentBal.toFixed(ppCur.decimals)} →{' '}
                            <span className="text-emerald-400 font-bold">
                              {ppCur.symbol}
                              {projectedBal.toFixed(ppCur.decimals)}
                            </span>
                          </span>
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                          <span className="font-bold text-slate-200">PayPal Checkout Total</span>
                          <span className="font-mono tabular-nums text-base font-extrabold text-[#FFC439]">
                            {ppCur.symbol}
                            {ppProposal.amount.toFixed(ppCur.decimals)} {ppProposal.currency}
                          </span>
                        </div>
                      </div>

                      {/* Sandbox Payer & Funding Method */}
                      <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-3 space-y-2.5 text-xs">
                        <div>
                          <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">
                            PayPal Sandbox Account
                          </label>
                          <input
                            type="email"
                            value={payPalCheckout.buyerEmail}
                            onChange={(e) =>
                              setPayPalCheckout((prev) =>
                                prev ? { ...prev, buyerEmail: e.target.value } : prev
                              )
                            }
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-400"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                            Funding Source
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setPayPalCheckout((prev) =>
                                prev ? { ...prev, fundingSource: 'paypal_balance' } : prev
                              )
                            }
                            className={`w-full text-left px-3 py-2 rounded-xl border flex items-center justify-between transition-colors ${
                              payPalCheckout.fundingSource === 'paypal_balance'
                                ? 'bg-sky-500/15 border-sky-400/60 text-white'
                                : 'bg-slate-800/60 border-slate-700/70 text-slate-300'
                            }`}
                          >
                            <span className="font-semibold">PayPal Balance (Sandbox)</span>
                            <span className="text-[10px] text-emerald-400 font-mono">Instant · $0 Fee</span>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setPayPalCheckout((prev) =>
                                prev ? { ...prev, fundingSource: 'paypal_card' } : prev
                              )
                            }
                            className={`w-full text-left px-3 py-2 rounded-xl border flex items-center justify-between transition-colors ${
                              payPalCheckout.fundingSource === 'paypal_card'
                                ? 'bg-sky-500/15 border-sky-400/60 text-white'
                                : 'bg-slate-800/60 border-slate-700/70 text-slate-300'
                            }`}
                          >
                            <span className="font-semibold">Visa Sandbox •••• 4242</span>
                            <span className="text-[10px] text-slate-400 font-mono">Instant</span>
                          </button>
                        </div>
                      </div>

                      {payPalCheckout.error && (
                        <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
                          {payPalCheckout.error}
                        </div>
                      )}

                      {/* Official-Style PayPal Sandbox Buttons */}
                      <div className="space-y-2 pt-1">
                        <button
                          type="button"
                          disabled={payPalCheckout.phase === 'processing'}
                          onClick={() => handleApprovePayPalCheckout('paypal_balance')}
                          className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-[#FFC439] hover:bg-[#f7b924] disabled:opacity-60 text-[#003087] font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.99]"
                        >
                          {payPalCheckout.phase === 'processing' ? (
                            <>
                              <RefreshCw className="w-4 h-4 animate-spin" />
                              <span>Authorizing PayPal Sandbox...</span>
                            </>
                          ) : (
                            <span>
                              Pay with <span className="italic">PayPal</span> · {ppCur.symbol}
                              {ppProposal.amount.toFixed(ppCur.decimals)}
                            </span>
                          )}
                        </button>

                        <button
                          type="button"
                          disabled={payPalCheckout.phase === 'processing'}
                          onClick={() => handleApprovePayPalCheckout('paypal_card')}
                          className="w-full min-h-[42px] py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-100 border border-slate-700 font-bold text-xs flex items-center justify-center gap-2 transition-colors"
                        >
                          <CreditCard className="w-4 h-4 text-sky-400" />
                          <span>Debit or Credit Card (PayPal Sandbox)</span>
                        </button>

                        <button
                          type="button"
                          disabled={payPalCheckout.phase === 'processing'}
                          onClick={() => setPayPalCheckout(null)}
                          className="w-full py-1.5 text-[11px] font-semibold text-slate-400 hover:text-slate-200 transition-colors"
                        >
                          Cancel and return to chat
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })()}
        </section>
      );
    } catch (err) {
      const fallbackMsg = err instanceof Error ? err.message : 'Unable to render GlobalPay AI.';
      return (
        <section
          aria-label="GlobalPay AI Fallback"
          className="fixed inset-x-3 bottom-28 md:inset-x-auto md:right-4 md:bottom-20 md:w-[410px] z-[60] rounded-3xl bg-slate-900/95 border border-red-500/40 p-5 shadow-2xl text-slate-100 space-y-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-red-300">Assistant Unavailable</span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-slate-300">{fallbackMsg}</p>
        </section>
      );
    }
  };

  return (
    <>
      {isOpen && (
        <ChatboxErrorBoundary
          onClose={() => {
            stopVoiceCapture();
            setIsOpen(false);
          }}
          onReset={() => {
            setMessages([createWelcomeMessage()]);
            setErrorBanner(null);
          }}
        >
          {renderModalContent()}
        </ChatboxErrorBoundary>
      )}

      {/* Desktop Floating Trigger Button fixed at very bottom-right corner (16px, 16px) */}
      <button
        type="button"
        onClick={toggleAIChat}
        aria-expanded={isOpen}
        aria-label="Ask GlobalPay AI"
        className="hidden md:flex fixed bottom-4 right-4 z-[60] min-h-[44px] px-4 py-2.5 rounded-2xl bg-slate-900/90 hover:bg-slate-800/95 backdrop-blur-xl border border-emerald-500/45 text-slate-100 shadow-xl shadow-black/50 items-center gap-2 transition-all hover:border-emerald-400 active:scale-95"
      >
        <span className="w-6 h-6 rounded-lg bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-slate-950 shrink-0">
          <Sparkles className="w-3.5 h-3.5 stroke-[2.5]" />
        </span>
        <span className="text-xs font-bold tracking-tight whitespace-nowrap shrink-0">
          Ask GlobalPay AI
        </span>
      </button>
    </>
  );
};

