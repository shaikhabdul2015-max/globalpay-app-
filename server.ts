import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAuditLogsForUser, logAuditEvent } from './server/auditLogger.ts';
import {
  GeminiConfigurationError,
  buildVerifiedAssistantResponse,
  parseNaturalCommandFallback,
  processAIChatCommand,
  transcribeAudioCommand,
  type AIAssistantResponse,
} from './server/aiAssistant.ts';
import { parseLocalIntent } from './server/localIntentParser.ts';
import { SUPPORTED_CURRENCIES } from './server/currencies.ts';
import {
  attachRequestContext,
  checkIdempotency,
  createRateLimiter,
  requireAuth,
  sanitizeText,
  saveIdempotencyResult,
  signSessionToken,
  validateCurrencyCode,
  validatePositiveAmount,
  type AuthenticatedRequest,
} from './server/security.ts';
import type { WalletSnapshot } from './server/types.ts';
import {
  WalletOperationError,
  calculateSwapQuote,
  calculateTransferQuote,
  executeAuthorizedSwap,
  executeAuthorizedTopUp,
  executeAuthorizedTransfer,
  getExchangeRate,
  getTransactionById,
  getWalletSnapshot,
  syncWalletSnapshot,
} from './server/walletEngine.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(attachRequestContext);
  app.use(express.json({ limit: '5mb' }));

  const aiRateLimiter = createRateLimiter({
    windowMs: 60_000,
    maxRequests: 25,
    keyPrefix: 'ai',
  });

  const walletRateLimiter = createRateLimiter({
    windowMs: 60_000,
    maxRequests: 40,
    keyPrefix: 'wallet',
  });

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'globalpay-api',
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
      timestamp: new Date().toISOString(),
    });
  });

  // Issue signed session token & sync initial wallet snapshot
  app.post('/api/auth/session', (req: AuthenticatedRequest, res) => {
    const body = req.body as { snapshot?: WalletSnapshot } | undefined;
    const snapshot = body?.snapshot;

    if (
      !snapshot ||
      !snapshot.user ||
      typeof snapshot.user.id !== 'string' ||
      !snapshot.user.id.trim() ||
      !snapshot.balances
    ) {
      res.status(400).json({ error: 'Valid user wallet snapshot is required to initialize session.' });
      return;
    }

    const userId = sanitizeText(snapshot.user.id, 64);
    const persona = sanitizeText(snapshot.user.persona, 32) || 'tourist';
    const name = sanitizeText(snapshot.user.name, 80) || 'GlobalPay User';

    syncWalletSnapshot(userId, snapshot);
    const token = signSessionToken({ userId, persona, name });

    logAuditEvent({
      requestId: req.requestId || 'unknown',
      userId,
      action: 'SESSION_ISSUED',
      status: 'success',
      details: { persona },
      ip: req.ip,
    });

    res.json({ token, userId, expiresIn: 43200 });
  });

  // Sync wallet state from existing frontend actions
  app.post('/api/wallet/sync', requireAuth, walletRateLimiter, (req: AuthenticatedRequest, res) => {
    const userId = req.auth!.sub;
    const body = req.body as { snapshot?: WalletSnapshot } | undefined;
    if (!body?.snapshot || !body.snapshot.balances) {
      res.status(400).json({ error: 'Invalid wallet snapshot payload.' });
      return;
    }

    const updated = syncWalletSnapshot(userId, body.snapshot);
    res.json({ ok: true, userId: updated.user.id });
  });

  // Read authoritative wallet state
  app.get('/api/wallet/state', requireAuth, walletRateLimiter, (req: AuthenticatedRequest, res) => {
    const userId = req.auth!.sub;
    const snapshot = getWalletSnapshot(userId);
    if (!snapshot) {
      res.status(404).json({ error: 'Wallet state not found for current session.' });
      return;
    }

    res.json({
      user: {
        id: snapshot.user.id,
        name: snapshot.user.name,
        email: snapshot.user.email,
        persona: snapshot.user.persona,
        baseCurrency: snapshot.user.baseCurrency,
        isFrozen: snapshot.user.isFrozen,
        security: {
          dailyLimit: snapshot.user.security.dailyLimit,
          requirePinAboveAmount: snapshot.user.security.requirePinAboveAmount,
        },
      },
      balances: snapshot.balances,
      transactions: snapshot.transactions,
      recipients: snapshot.recipients,
    });
  });

  // FX / Transfer / Swap Quote
  app.post('/api/wallet/quote', requireAuth, walletRateLimiter, (req: AuthenticatedRequest, res) => {
    const body = req.body as {
      type?: 'transfer' | 'swap' | 'fx';
      fromCurrency?: unknown;
      toCurrency?: unknown;
      amount?: unknown;
    };

    const fromCurrency = validateCurrencyCode(body?.fromCurrency);
    const toCurrency = validateCurrencyCode(body?.toCurrency);
    const amount = validatePositiveAmount(body?.amount);

    if (!fromCurrency || !toCurrency || !amount) {
      res.status(400).json({ error: 'Valid fromCurrency, toCurrency, and positive amount are required.' });
      return;
    }

    if (body?.type === 'transfer') {
      res.json({ quote: calculateTransferQuote(fromCurrency, toCurrency, amount) });
      return;
    }

    if (body?.type === 'swap') {
      res.json({ quote: calculateSwapQuote(fromCurrency, toCurrency, amount) });
      return;
    }

    const rate = parseFloat(getExchangeRate(fromCurrency, toCurrency).toFixed(4));
    res.json({
      quote: {
        fromCurrency,
        toCurrency,
        amount,
        convertedAmount: parseFloat((amount * rate).toFixed(SUPPORTED_CURRENCIES[toCurrency].decimals)),
        rate,
      },
    });
  });

  // Verify transaction status
  app.get('/api/wallet/transactions/:id', requireAuth, walletRateLimiter, (req: AuthenticatedRequest, res) => {
    const userId = req.auth!.sub;
    const txId = sanitizeText(req.params.id, 64);
    const tx = getTransactionById(userId, txId);
    if (!tx) {
      res.status(404).json({ error: 'Transaction not found.' });
      return;
    }
    res.json({ transaction: tx, verified: true });
  });

  // Authorized + Idempotent Cross-Border Transfer
  app.post('/api/wallet/transfer', requireAuth, walletRateLimiter, (req: AuthenticatedRequest, res) => {
    const userId = req.auth!.sub;
    const idem = checkIdempotency(userId, req.header('idempotency-key'), req.body);
    if (idem.state === 'missing') {
      res.status(400).json({ error: 'Idempotency-Key header is required for financial transfers.' });
      return;
    }
    if (idem.state === 'conflict') {
      res.status(409).json({ error: 'Idempotency-Key conflict: payload does not match original request.' });
      return;
    }
    if (idem.state === 'replay') {
      res.status(idem.statusCode).json(idem.body);
      return;
    }

    const body = req.body as {
      recipientId?: unknown;
      newRecipient?: {
        name?: unknown;
        country?: unknown;
        currency?: unknown;
        type?: unknown;
        accountNumber?: unknown;
        routingOrBank?: unknown;
      };
      fromCurrency?: unknown;
      amount?: unknown;
      notes?: unknown;
      pin?: unknown;
    };

    const fromCurrency = validateCurrencyCode(body?.fromCurrency);
    const amount = validatePositiveAmount(body?.amount);
    if (!fromCurrency || !amount) {
      res.status(400).json({ error: 'Valid fromCurrency and positive amount are required.' });
      return;
    }

    let sanitizedNewRecipient:
      | {
          name: string;
          country: string;
          currency: ReturnType<typeof validateCurrencyCode> & string;
          type: 'bank' | 'wallet' | 'upi';
          accountNumber: string;
          routingOrBank: string;
          nickname: string;
        }
      | undefined;

    if (body?.newRecipient) {
      const recName = sanitizeText(body.newRecipient.name, 100);
      const recCountry = sanitizeText(body.newRecipient.country, 80) || 'International';
      const recCurrency = validateCurrencyCode(body.newRecipient.currency);
      const recAccount = sanitizeText(body.newRecipient.accountNumber, 120);
      const recBank = sanitizeText(body.newRecipient.routingOrBank, 120) || 'GlobalPay Partner Rail';
      const rawType = body.newRecipient.type;
      const recType: 'bank' | 'wallet' | 'upi' =
        rawType === 'upi' || rawType === 'wallet' ? rawType : 'bank';

      if (!recName || !recCurrency || !recAccount) {
        res.status(400).json({
          error: 'New recipient requires valid name, payout currency, and account/IBAN/UPI details.',
        });
        return;
      }

      sanitizedNewRecipient = {
        name: recName,
        country: recCountry,
        currency: recCurrency,
        type: recType,
        accountNumber: recAccount,
        routingOrBank: recBank,
        nickname: recName.split(' ')[0],
      };
    }

    try {
      const result = executeAuthorizedTransfer({
        userId,
        recipientId: typeof body.recipientId === 'string' ? sanitizeText(body.recipientId, 64) : undefined,
        newRecipient: sanitizedNewRecipient,
        fromCurrency,
        amount,
        notes: sanitizeText(body.notes, 240) || undefined,
        pin: typeof body.pin === 'string' ? body.pin.trim() : undefined,
      });

      const responseBody = {
        transaction: result.transaction,
        balances: result.balances,
        ledgerEntries: result.ledgerEntries,
        addedRecipient: result.addedRecipient,
      };

      saveIdempotencyResult(idem.key, idem.payloadHash, 200, responseBody);
      logAuditEvent({
        requestId: req.requestId || 'unknown',
        userId,
        action: 'WALLET_TRANSFER_EXECUTED',
        status: 'success',
        details: {
          txId: result.transaction.id,
          amount,
          fromCurrency,
          toCurrency: result.transaction.toCurrency,
          recipient: result.transaction.recipient.name,
        },
        ip: req.ip,
      });

      res.json(responseBody);
    } catch (err: unknown) {
      if (err instanceof WalletOperationError) {
        logAuditEvent({
          requestId: req.requestId || 'unknown',
          userId,
          action: 'WALLET_TRANSFER_REJECTED',
          status: 'denied',
          details: { reason: err.message, amount, fromCurrency },
          ip: req.ip,
        });
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  // Authorized + Idempotent Top-Up / Add Money
  app.post('/api/wallet/topup', requireAuth, walletRateLimiter, (req: AuthenticatedRequest, res) => {
    const userId = req.auth!.sub;
    const idem = checkIdempotency(userId, req.header('idempotency-key'), req.body);
    if (idem.state === 'missing') {
      res.status(400).json({ error: 'Idempotency-Key header is required for deposits.' });
      return;
    }
    if (idem.state === 'conflict') {
      res.status(409).json({ error: 'Idempotency-Key conflict: payload does not match original request.' });
      return;
    }
    if (idem.state === 'replay') {
      res.status(idem.statusCode).json(idem.body);
      return;
    }

    const body = req.body as { currency?: unknown; amount?: unknown; method?: unknown };
    const currency = validateCurrencyCode(body?.currency);
    const amount = validatePositiveAmount(body?.amount);
    const method = sanitizeText(body?.method, 100) || 'Linked Bank Transfer';

    if (!currency || !amount) {
      res.status(400).json({ error: 'Valid currency and positive deposit amount are required.' });
      return;
    }

    try {
      const result = executeAuthorizedTopUp({ userId, currency, amount, method });
      const responseBody = {
        transaction: result.transaction,
        balances: result.balances,
        ledgerEntries: result.ledgerEntries,
      };
      saveIdempotencyResult(idem.key, idem.payloadHash, 200, responseBody);
      logAuditEvent({
        requestId: req.requestId || 'unknown',
        userId,
        action: 'WALLET_TOPUP_EXECUTED',
        status: 'success',
        details: { txId: result.transaction.id, amount, currency, method },
        ip: req.ip,
      });
      res.json(responseBody);
    } catch (err: unknown) {
      if (err instanceof WalletOperationError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  // Authorized + Idempotent Currency Swap
  app.post('/api/wallet/swap', requireAuth, walletRateLimiter, (req: AuthenticatedRequest, res) => {
    const userId = req.auth!.sub;
    const idem = checkIdempotency(userId, req.header('idempotency-key'), req.body);
    if (idem.state === 'missing') {
      res.status(400).json({ error: 'Idempotency-Key header is required for currency swaps.' });
      return;
    }
    if (idem.state === 'conflict') {
      res.status(409).json({ error: 'Idempotency-Key conflict: payload does not match original request.' });
      return;
    }
    if (idem.state === 'replay') {
      res.status(idem.statusCode).json(idem.body);
      return;
    }

    const body = req.body as { fromCurrency?: unknown; toCurrency?: unknown; amount?: unknown };
    const fromCurrency = validateCurrencyCode(body?.fromCurrency);
    const toCurrency = validateCurrencyCode(body?.toCurrency);
    const amount = validatePositiveAmount(body?.amount);

    if (!fromCurrency || !toCurrency || !amount) {
      res.status(400).json({ error: 'Valid fromCurrency, toCurrency, and positive amount are required.' });
      return;
    }

    try {
      const result = executeAuthorizedSwap({ userId, fromCurrency, toCurrency, amount });
      const responseBody = {
        transaction: result.transaction,
        balances: result.balances,
        ledgerEntries: result.ledgerEntries,
      };
      saveIdempotencyResult(idem.key, idem.payloadHash, 200, responseBody);
      logAuditEvent({
        requestId: req.requestId || 'unknown',
        userId,
        action: 'WALLET_SWAP_EXECUTED',
        status: 'success',
        details: {
          txId: result.transaction.id,
          amount,
          fromCurrency,
          toCurrency,
          toAmount: result.transaction.toAmount,
        },
        ip: req.ip,
      });
      res.json(responseBody);
    } catch (err: unknown) {
      if (err instanceof WalletOperationError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  // Audit log query for current user
  app.get('/api/audit/logs', requireAuth, walletRateLimiter, (req: AuthenticatedRequest, res) => {
    const logs = getAuditLogsForUser(req.auth!.sub, 50);
    res.json({ logs });
  });

  // Fast Local Intent Recognition Endpoint (Ultra low latency: < 50ms)
  app.post('/api/ai/intent', requireAuth, aiRateLimiter, (req: AuthenticatedRequest, res) => {
    const t0 = Date.now();
    const userId = req.auth!.sub;
    const body = req.body as {
      message?: unknown;
      snapshot?: WalletSnapshot;
    };

    const message = sanitizeText(body?.message, 1000);
    if (!message) {
      res.status(400).json({ error: 'Message is required.' });
      return;
    }

    if (body?.snapshot && body.snapshot.balances) {
      syncWalletSnapshot(userId, body.snapshot);
    }

    const wallet = getWalletSnapshot(userId);
    const baseCurrency = wallet?.user.baseCurrency || 'USD';
    const intentResult = parseLocalIntent(message, baseCurrency);
    const latencyMs = Date.now() - t0;

    let assistantResponse: AIAssistantResponse | undefined;
    if (wallet && intentResult.confidence >= 0.8 && !intentResult.ambiguous) {
      assistantResponse = buildVerifiedAssistantResponse(
        {
          action: intentResult.action,
          amount: intentResult.amount,
          currency: intentResult.currency,
          fromCurrency: intentResult.fromCurrency,
          toCurrency: intentResult.toCurrency,
          recipient: intentResult.recipient,
          method: intentResult.method,
          limit: intentResult.limit,
          replyText: intentResult.replyText,
        },
        wallet
      );
      assistantResponse.intent = intentResult.intent;
      assistantResponse.source = 'local_intent_fast';
      assistantResponse.latencyMs = latencyMs;
    }

    logAuditEvent({
      requestId: req.requestId || 'unknown',
      userId,
      action: `LOCAL_INTENT_RECOGNIZED:${intentResult.intent}`,
      status: 'success',
      details: {
        intent: intentResult.intent,
        confidence: intentResult.confidence,
        latencyMs,
        requiresConfirmation: intentResult.requires_confirmation,
      },
      ip: req.ip,
    });

    res.json({
      intent: intentResult,
      latencyMs,
      response: assistantResponse,
    });
  });

  // Gemini AI Financial Assistant Endpoint (Parse + Authoritative Read Queries Only)
  app.post('/api/ai/chat', requireAuth, aiRateLimiter, async (req: AuthenticatedRequest, res) => {
    const t0 = Date.now();
    const userId = req.auth!.sub;
    const body = req.body as {
      message?: unknown;
      history?: Array<{ role?: unknown; text?: unknown }>;
      snapshot?: WalletSnapshot;
      preferLocal?: boolean;
    };

    const message = sanitizeText(body?.message, 1000);
    if (!message) {
      res.status(400).json({ error: 'Please enter a message for GlobalPay AI.' });
      return;
    }

    if (body?.snapshot && body.snapshot.balances) {
      syncWalletSnapshot(userId, body.snapshot);
    }

    const wallet = getWalletSnapshot(userId);
    if (!wallet) {
      res.status(404).json({ error: 'Wallet context not initialized for this session.' });
      return;
    }

    // Phase 2 & 3: Evaluate local intent immediately (low latency execution)
    const localIntent = parseLocalIntent(message, wallet.user.baseCurrency);
    const hasHighConfidenceLocal =
      localIntent.confidence >= 0.95 &&
      !localIntent.ambiguous &&
      localIntent.action !== 'general_chat';

    // If local intent is decisive for core commands (send, add_money, swap, check_balance, quote, tx_history)
    if (hasHighConfidenceLocal || body?.preferLocal) {
      const localResponse = buildVerifiedAssistantResponse(
        {
          action: localIntent.action,
          amount: localIntent.amount,
          currency: localIntent.currency,
          fromCurrency: localIntent.fromCurrency,
          toCurrency: localIntent.toCurrency,
          recipient: localIntent.recipient,
          method: localIntent.method,
          limit: localIntent.limit,
          replyText: localIntent.replyText,
        },
        wallet
      );
      localResponse.intent = localIntent.intent;
      localResponse.source = 'local_intent_fast';
      localResponse.latencyMs = Date.now() - t0;

      logAuditEvent({
        requestId: req.requestId || 'unknown',
        userId,
        action: `FAST_LOCAL_INTENT_SERVED:${localIntent.intent}`,
        status: 'success',
        details: {
          intent: localIntent.intent,
          latencyMs: localResponse.latencyMs,
          amount: localIntent.amount,
          currency: localIntent.currency,
        },
        ip: req.ip,
      });

      res.json(localResponse);
      return;
    }

    const sanitizedHistory = Array.isArray(body?.history)
      ? body.history
          .filter(
            (h): h is { role: 'user' | 'assistant'; text: string } =>
              (h?.role === 'user' || h?.role === 'assistant') && typeof h?.text === 'string'
          )
          .slice(-6)
          .map((h) => ({ role: h.role, text: sanitizeText(h.text, 500) }))
      : [];

    try {
      const assistantResponse = await processAIChatCommand({
        message,
        history: sanitizedHistory,
        wallet,
      });
      assistantResponse.intent = localIntent.intent;

      logAuditEvent({
        requestId: req.requestId || 'unknown',
        userId,
        action: `AI_COMMAND_PARSED:${assistantResponse.parsedCommand.action}`,
        status: 'success',
        details: {
          requiresConfirmation: assistantResponse.requiresConfirmation,
          currency: assistantResponse.parsedCommand.currency || assistantResponse.parsedCommand.fromCurrency,
          amount: assistantResponse.parsedCommand.amount,
          latencyMs: assistantResponse.latencyMs,
        },
        ip: req.ip,
      });

      res.json(assistantResponse);
    } catch (err: unknown) {
      if (err instanceof GeminiConfigurationError) {
        const fallbackParsed = parseNaturalCommandFallback(message, wallet.user.baseCurrency);
        const fallbackResponse = buildVerifiedAssistantResponse(fallbackParsed, wallet);
        fallbackResponse.intent = localIntent.intent;
        fallbackResponse.source = 'fallback_parser';
        fallbackResponse.latencyMs = Date.now() - t0;

        logAuditEvent({
          requestId: req.requestId || 'unknown',
          userId,
          action: `AI_COMMAND_FALLBACK:${fallbackResponse.parsedCommand.action}`,
          status: 'success',
          details: {
            reason: 'gemini_unconfigured_fallback',
            currency: fallbackResponse.parsedCommand.currency || fallbackResponse.parsedCommand.fromCurrency,
            amount: fallbackResponse.parsedCommand.amount,
            latencyMs: fallbackResponse.latencyMs,
          },
          ip: req.ip,
        });
        res.json(fallbackResponse);
        return;
      }

      // Phase 7: Model failure fallback to local intent parser for resilience
      const fallbackParsed = parseNaturalCommandFallback(message, wallet.user.baseCurrency);
      const fallbackResponse = buildVerifiedAssistantResponse(fallbackParsed, wallet);
      fallbackResponse.intent = localIntent.intent;
      fallbackResponse.source = 'fallback_parser';
      fallbackResponse.latencyMs = Date.now() - t0;

      const messageText = err instanceof Error ? err.message : 'AI service fallback engaged.';
      logAuditEvent({
        requestId: req.requestId || 'unknown',
        userId,
        action: 'AI_CHAT_ERROR_FALLBACK',
        status: 'error',
        details: { reason: messageText, fallbackAction: fallbackResponse.parsedCommand.action },
        ip: req.ip,
      });

      res.json(fallbackResponse);
    }
  });

  // Gemini Voice Audio Transcription fallback endpoint
  app.post('/api/ai/transcribe', requireAuth, aiRateLimiter, async (req: AuthenticatedRequest, res) => {
    const userId = req.auth!.sub;
    const body = req.body as { audioBase64?: unknown; mimeType?: unknown };

    if (typeof body?.audioBase64 !== 'string' || body.audioBase64.length < 16) {
      res.status(400).json({ error: 'Valid base64 audio payload is required.' });
      return;
    }

    const mimeType =
      typeof body?.mimeType === 'string' && body.mimeType.startsWith('audio/')
        ? body.mimeType.split(';')[0]
        : 'audio/webm';

    try {
      const transcript = await transcribeAudioCommand(body.audioBase64, mimeType);
      logAuditEvent({
        requestId: req.requestId || 'unknown',
        userId,
        action: 'AI_VOICE_TRANSCRIBED',
        status: 'success',
        details: { transcriptLength: transcript.length },
        ip: req.ip,
      });
      res.json({ transcript });
    } catch (err: unknown) {
      if (err instanceof GeminiConfigurationError) {
        res.status(503).json({ error: err.message });
        return;
      }
      res.status(502).json({ error: 'Could not transcribe audio command. Please try speaking again or type your message.' });
    }
  });

  // Return 404 JSON for unmatched /api/* routes
  app.all('/api/*splat', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  // Serve frontend (Vite middleware in dev, dist/ static files in production)
  const isProduction = process.env.NODE_ENV === 'production';
  const isTest = process.env.NODE_ENV === 'test';

  if (!isTest) {
    if (!isProduction) {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } else {
      const distDir = path.resolve(__dirname, 'dist');
      if (fs.existsSync(distDir)) {
        app.use(express.static(distDir));
        app.get('/*splat', (_req, res) => {
          res.sendFile(path.join(distDir, 'index.html'));
        });
      }
    }
  }

  return app;
}

const isEntrypoint = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isEntrypoint) {
  const PORT = Number(process.env.APP_PORT || 3000);
  createApp()
    .then((app) => {
      app.listen(PORT, '0.0.0.0', () => {
        console.log(`GlobalPay server listening on http://0.0.0.0:${PORT}`);
      });
    })
    .catch((err) => {
      console.error('Failed to start GlobalPay server:', err);
      process.exit(1);
    });
}
