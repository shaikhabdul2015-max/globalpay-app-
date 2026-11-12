import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToString } from 'react-dom/server';
import App from '../src/App.tsx';
import { AIAssistantChatbox } from '../src/components/AIAssistantChatbox.tsx';
import { PaymentProvider } from '../src/store/paymentContext.tsx';
import { createApp } from '../server.ts';
import {
  buildVerifiedAssistantResponse,
  parseNaturalCommandFallback,
  validateAndNormalizeParsedCommand,
} from '../server/aiAssistant.ts';
import { parseLocalIntent } from '../server/localIntentParser.ts';
import { getCachedExchangeRate } from '../server/walletEngine.ts';
import type { WalletSnapshot } from '../server/types.ts';

function makeTestSnapshot(): WalletSnapshot {
  return {
    user: {
      id: 'usr-test-alex',
      name: 'Alex Rivera',
      email: 'alex@globalpay.test',
      persona: 'tourist',
      baseCurrency: 'USD',
      isFrozen: false,
      security: {
        biometricEnabled: true,
        twoFactorEnabled: true,
        passkeyActive: true,
        dailyLimit: 5000,
        requirePinAboveAmount: 250,
        pinCode: '1234',
      },
    },
    balances: {
      USD: { currency: 'USD', available: 1250, pending: 0, held: 0, hidden: false },
      EUR: { currency: 'EUR', available: 620.4, pending: 0, held: 0, hidden: false },
      GBP: { currency: 'GBP', available: 350, pending: 0, held: 0, hidden: false },
      INR: { currency: 'INR', available: 25000, pending: 0, held: 0, hidden: false },
      AED: { currency: 'AED', available: 1500, pending: 0, held: 0, hidden: false },
      JPY: { currency: 'JPY', available: 0, pending: 0, held: 0, hidden: true },
      CAD: { currency: 'CAD', available: 0, pending: 0, held: 0, hidden: true },
      AUD: { currency: 'AUD', available: 0, pending: 0, held: 0, hidden: true },
      SGD: { currency: 'SGD', available: 0, pending: 0, held: 0, hidden: true },
      THB: { currency: 'THB', available: 0, pending: 0, held: 0, hidden: true },
      CHF: { currency: 'CHF', available: 0, pending: 0, held: 0, hidden: true },
    },
    transactions: [
      {
        id: 'TX-100001',
        timestamp: new Date().toISOString(),
        type: 'deposit',
        status: 'completed',
        title: 'Wallet Deposit: USD Bank Transfer',
        fromAmount: 500,
        fromCurrency: 'USD',
        toAmount: 500,
        toCurrency: 'USD',
        exchangeRate: 1,
        fees: {
          currencyConversionFee: 0,
          transferFee: 0,
          paymentFee: 0,
          networkFee: 0,
          totalFee: 0,
          feeCurrency: 'USD',
        },
        sender: { name: 'Chase Bank' },
        recipient: { name: 'Alex Rivera', type: 'wallet' },
        auditTrail: [],
      },
    ],
    ledger: [],
    recipients: [
      {
        id: 'rec-1',
        name: 'Marco Rossi',
        country: 'Italy',
        currency: 'EUR',
        type: 'bank',
        accountNumber: 'IT60X0542811101000000123456',
        routingOrBank: 'UniCredit Banca',
        nickname: 'Marco',
        verified: true,
      },
      {
        id: 'rec-4',
        name: 'David Miller',
        country: 'United Kingdom',
        currency: 'GBP',
        type: 'bank',
        accountNumber: '88204912',
        routingOrBank: 'Barclays Bank UK',
        nickname: 'David',
        verified: true,
      },
    ],
  };
}

test('AI Command Parser: validates structured send command and resolves saved recipient without executing', () => {
  const parsed = validateAndNormalizeParsedCommand(
    {
      action: 'send',
      amount: 50,
      currency: 'usd',
      recipient: 'Marco',
      replyText: 'Preparing transfer.',
    },
    'USD'
  );

  assert.equal(parsed.action, 'send');
  assert.equal(parsed.amount, 50);
  assert.equal(parsed.currency, 'USD');
  assert.equal(parsed.recipient, 'Marco');

  const snapshot = makeTestSnapshot();
  const response = buildVerifiedAssistantResponse(parsed, snapshot);

  assert.equal(response.requiresConfirmation, true);
  assert.ok(response.confirmationProposal);
  assert.equal(response.confirmationProposal.recipientId, 'rec-1');
  assert.equal(response.confirmationProposal.recipientNeedsSetup, false);
  assert.equal(response.confirmationProposal.toCurrency, 'EUR');
  assert.equal(response.confirmationProposal.requiresPin, false);
  assert.equal(snapshot.balances.USD.available, 1250);
});

test('AI Command Parser: marks unknown recipient (e.g. John) as needing verification before confirmation', () => {
  const parsed = validateAndNormalizeParsedCommand(
    {
      action: 'send',
      amount: 50,
      currency: 'USD',
      recipient: 'John',
      replyText: 'Preparing transfer to John.',
    },
    'USD'
  );

  const response = buildVerifiedAssistantResponse(parsed, makeTestSnapshot());
  assert.equal(response.requiresConfirmation, true);
  assert.ok(response.confirmationProposal);
  assert.equal(response.confirmationProposal.recipientName, 'John');
  assert.equal(response.confirmationProposal.recipientNeedsSetup, true);
  assert.equal(response.confirmationProposal.recipientId, undefined);
});

test('AI Command Parser: rejects invalid/negative amounts and unknown actions safely', () => {
  const neg = validateAndNormalizeParsedCommand(
    { action: 'send', amount: -100, currency: 'USD', recipient: 'Marco', replyText: 'Bad' },
    'USD'
  );
  assert.equal(neg.action, 'general_chat');
  assert.equal(neg.clarificationNeeded, true);

  const invalidAction = validateAndNormalizeParsedCommand(
    { action: 'delete_all_funds', amount: 100, replyText: 'Oops' },
    'USD'
  );
  assert.equal(invalidAction.action, 'general_chat');
});

test('AI Command Parser: returns real wallet balances and conversion quotes', () => {
  const snapshot = makeTestSnapshot();

  const balCmd = validateAndNormalizeParsedCommand(
    { action: 'check_balance', currency: 'EUR', replyText: 'Checking.' },
    'USD'
  );
  const balRes = buildVerifiedAssistantResponse(balCmd, snapshot);
  assert.equal(balRes.requiresConfirmation, false);
  assert.equal(balRes.balanceSummary?.[0].currency, 'EUR');
  assert.equal(balRes.balanceSummary?.[0].available, 620.4);

  const convCmd = validateAndNormalizeParsedCommand(
    { action: 'convert_quote', amount: 100, fromCurrency: 'USD', toCurrency: 'EUR', replyText: 'Converting.' },
    'USD'
  );
  const convRes = buildVerifiedAssistantResponse(convCmd, snapshot);
  assert.equal(convRes.requiresConfirmation, false);
  assert.equal(convRes.conversionQuote?.fromAmount, 100);
  assert.equal(convRes.conversionQuote?.toAmount, 91.2);
});

test('API Integration: auth, wallet sync, idempotency, PIN security, topup, swap, and audit logs', async () => {
  const app = await createApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Invalid server address');
    const baseUrl = `http://127.0.0.1:${address.port}`;

    // 1. Health check
    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.equal(healthRes.status, 200);
    const healthJson = (await healthRes.json()) as { status: string };
    assert.equal(healthJson.status, 'ok');

    // 2. Protected route rejects unauthenticated access
    const unauthRes = await fetch(`${baseUrl}/api/wallet/state`);
    assert.equal(unauthRes.status, 401);

    // 3. Issue session token
    const snapshot = makeTestSnapshot();
    const sessionRes = await fetch(`${baseUrl}/api/auth/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snapshot }),
    });
    assert.equal(sessionRes.status, 200);
    const { token } = (await sessionRes.json()) as { token: string };
    assert.ok(token);

    // 4. Reject transfer >= $250 without valid PIN
    const noPinRes = await fetch(`${baseUrl}/api/wallet/transfer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'Idempotency-Key': 'idem-pin-check-001',
      },
      body: JSON.stringify({
        recipientId: 'rec-1',
        fromCurrency: 'USD',
        amount: 300,
      }),
    });
    assert.equal(noPinRes.status, 403);

    // 5. Execute authorized transfer with PIN + idempotency replay + conflict detection
    const transferBody = {
      recipientId: 'rec-1',
      fromCurrency: 'USD',
      amount: 300,
      pin: '1234',
      notes: 'Rent',
    };

    const txRes = await fetch(`${baseUrl}/api/wallet/transfer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'Idempotency-Key': 'idem-transfer-001',
      },
      body: JSON.stringify(transferBody),
    });
    assert.equal(txRes.status, 200);
    const txData = (await txRes.json()) as {
      transaction: { id: string; status: string };
      balances: Record<string, { available: number }>;
    };
    assert.equal(txData.transaction.status, 'completed');
    assert.ok(txData.balances.USD.available < 1250);

    // Replay same idempotency key -> exact same TX ID, no double debit
    const replayRes = await fetch(`${baseUrl}/api/wallet/transfer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'Idempotency-Key': 'idem-transfer-001',
      },
      body: JSON.stringify(transferBody),
    });
    assert.equal(replayRes.status, 200);
    const replayData = (await replayRes.json()) as {
      transaction: { id: string };
      balances: Record<string, { available: number }>;
    };
    assert.equal(replayData.transaction.id, txData.transaction.id);
    assert.equal(replayData.balances.USD.available, txData.balances.USD.available);

    // Conflict when reusing same idempotency key with different payload
    const conflictRes = await fetch(`${baseUrl}/api/wallet/transfer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'Idempotency-Key': 'idem-transfer-001',
      },
      body: JSON.stringify({ ...transferBody, amount: 100 }),
    });
    assert.equal(conflictRes.status, 409);

    // 6. Verify transaction endpoint
    const verifyRes = await fetch(`${baseUrl}/api/wallet/transactions/${txData.transaction.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(verifyRes.status, 200);
    const verifyData = (await verifyRes.json()) as { verified: boolean };
    assert.equal(verifyData.verified, true);

    // 7. Execute Top-Up & Swap
    const topUpRes = await fetch(`${baseUrl}/api/wallet/topup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'Idempotency-Key': 'idem-topup-001',
      },
      body: JSON.stringify({ currency: 'GBP', amount: 150, method: 'Faster Payments' }),
    });
    assert.equal(topUpRes.status, 200);
    const topUpData = (await topUpRes.json()) as { balances: Record<string, { available: number }> };
    assert.equal(topUpData.balances.GBP.available, 500);

    const swapRes = await fetch(`${baseUrl}/api/wallet/swap`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'Idempotency-Key': 'idem-swap-001',
      },
      body: JSON.stringify({ fromCurrency: 'USD', toCurrency: 'EUR', amount: 100 }),
    });
    assert.equal(swapRes.status, 200);
    const swapData = (await swapRes.json()) as { balances: Record<string, { available: number }> };
    assert.equal(swapData.balances.EUR.available, 711.6);

    // 8. Audit logs recorded
    const auditRes = await fetch(`${baseUrl}/api/audit/logs`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(auditRes.status, 200);
    const auditData = (await auditRes.json()) as { logs: Array<{ action: string }> };
    assert.ok(auditData.logs.some((l) => l.action === 'WALLET_TRANSFER_EXECUTED'));
    assert.ok(auditData.logs.some((l) => l.action === 'WALLET_TOPUP_EXECUTED'));
    assert.ok(auditData.logs.some((l) => l.action === 'WALLET_SWAP_EXECUTED'));
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});

test('UI Mount & Modal State: renders App and open AIAssistantChatbox cleanly without crashes or mixed CDN imports', () => {
  // 1. Render full App shell (closed chatbox state)
  const appHtml = renderToString(React.createElement(App));
  assert.ok(appHtml.includes('Ask GlobalPay AI'));
  assert.ok(appHtml.includes('fixed bottom-4 right-4 z-[60]'));
  assert.ok(!appHtml.includes('🚀 Launch!'));

  // 2. Render AIAssistantChatbox explicitly in open state (simulating onClick -> toggleAIChat)
  const openModalHtml = renderToString(
    React.createElement(
      PaymentProvider,
      { initialAIChatOpen: true },
      React.createElement(AIAssistantChatbox)
    )
  );
  assert.ok(openModalHtml.includes('GlobalPay AI'));
  assert.ok(openModalHtml.includes('Your intelligent financial assistant.'));
  assert.ok(openModalHtml.includes('Message GlobalPay AI'));
  assert.ok(openModalHtml.includes('Speak voice command'));
  assert.ok(openModalHtml.includes('Send message'));
  assert.ok(openModalHtml.includes('aria-expanded="true"'));

  // 3. Verify zero mixed CDN JS imports, importmaps, or motion/react dependencies in index.html & src/
  const indexHtml = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf8');
  assert.ok(!/importmap|esm\.sh|unpkg\.com|jsdelivr\.net/i.test(indexHtml));

  const srcDir = path.resolve(process.cwd(), 'src');
  const stack = [srcDir];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        assert.ok(
          !/from\s+['"]motion\/react['"]|https:\/\/(esm\.sh|unpkg\.com|cdn\.jsdelivr\.net)/i.test(content),
          `Disallowed mixed/motion import found in ${fullPath}`
        );
      }
    }
  }
});

test('PayPal AI Hackathon: add_money commands return PayPal Sandbox proposal and update wallet balance upon approval', async () => {
  const snapshot = makeTestSnapshot();

  const cmd1 = parseNaturalCommandFallback('Add $50 to my wallet', 'USD');
  assert.equal(cmd1.action, 'add_money');
  assert.equal(cmd1.amount, 50);
  assert.equal(cmd1.currency, 'USD');
  assert.equal(cmd1.method, 'paypal');

  const res1 = buildVerifiedAssistantResponse(cmd1, snapshot);
  assert.equal(res1.requiresConfirmation, true);
  assert.equal(res1.confirmationProposal?.action, 'add_money');
  assert.equal(res1.confirmationProposal?.method, 'paypal');
  assert.equal(res1.confirmationProposal?.amount, 50);

  const cmd2 = parseNaturalCommandFallback('Deposit 100 EUR', 'USD');
  assert.equal(cmd2.action, 'add_money');
  assert.equal(cmd2.amount, 100);
  assert.equal(cmd2.currency, 'EUR');
  assert.equal(cmd2.method, 'paypal');

  const app = await createApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Invalid server address');
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const sessionRes = await fetch(`${baseUrl}/api/auth/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snapshot }),
    });
    const { token } = (await sessionRes.json()) as { token: string };

    // Simulate /api/ai/chat for "Add $50 to my wallet" (works with or without GEMINI_API_KEY)
    const chatRes = await fetch(`${baseUrl}/api/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ message: 'Add $50 to my wallet', history: [], snapshot }),
    });
    assert.equal(chatRes.status, 200);
    const chatJson = (await chatRes.json()) as {
      confirmationProposal?: { action: string; amount: number; currency: string; method?: string };
    };
    assert.equal(chatJson.confirmationProposal?.action, 'add_money');
    assert.equal(chatJson.confirmationProposal?.amount, 50);
    assert.equal(chatJson.confirmationProposal?.currency, 'USD');
    assert.equal(chatJson.confirmationProposal?.method, 'paypal');

    // Simulate user approving PayPal Sandbox Checkout -> credits USD balance
    const topupRes = await fetch(`${baseUrl}/api/wallet/topup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'Idempotency-Key': 'idem-paypal-sb-50',
      },
      body: JSON.stringify({
        currency: chatJson.confirmationProposal!.currency,
        amount: chatJson.confirmationProposal!.amount,
        method: 'PayPal Sandbox Checkout (PAYPAL-SB-TEST)',
      }),
    });
    assert.equal(topupRes.status, 200);
    const topupJson = (await topupRes.json()) as {
      balances: Record<string, { available: number }>;
      transaction: { sender: { name: string }; status: string };
    };
    assert.equal(topupJson.transaction.status, 'completed');
    assert.equal(topupJson.transaction.sender.name, 'PayPal Sandbox Checkout (PAYPAL-SB-TEST)');
    assert.equal(topupJson.balances.USD.available, 1300);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});

test('Phase 2: Local Intent Recognition handles all 9 financial intent types plus ambiguities', () => {
  // 1. send_money
  const sendRes = parseLocalIntent('Send $75 to Marco', 'USD');
  assert.equal(sendRes.intent, 'send_money');
  assert.equal(sendRes.amount, 75);
  assert.equal(sendRes.currency, 'USD');
  assert.equal(sendRes.recipient, 'Marco');
  assert.equal(sendRes.requires_confirmation, true);

  // 2. receive_money
  const recvRes = parseLocalIntent('How do I receive EUR funds?', 'EUR');
  assert.equal(recvRes.intent, 'receive_money');
  assert.equal(recvRes.currency, 'EUR');
  assert.equal(recvRes.requires_confirmation, false);
  assert.ok(recvRes.replyText.includes('IBAN'));

  // 3. check_balance
  const balRes = parseLocalIntent('What is my current GBP balance?', 'USD');
  assert.equal(balRes.intent, 'check_balance');
  assert.equal(balRes.currency, 'GBP');
  assert.equal(balRes.requires_confirmation, false);

  // 4. transaction_history
  const txRes = parseLocalIntent('Show my recent spending and history', 'USD');
  assert.equal(txRes.intent, 'transaction_history');
  assert.equal(txRes.requires_confirmation, false);

  // 5. currency_conversion (swap)
  const swapRes = parseLocalIntent('Swap 150 USD to EUR', 'USD');
  assert.equal(swapRes.intent, 'currency_conversion');
  assert.equal(swapRes.amount, 150);
  assert.equal(swapRes.fromCurrency, 'USD');
  assert.equal(swapRes.toCurrency, 'EUR');
  assert.equal(swapRes.requires_confirmation, true);

  // 6. fx_rate_lookup
  const fxRes = parseLocalIntent("What's the exchange rate between USD and INR?", 'USD');
  assert.equal(fxRes.intent, 'fx_rate_lookup');
  assert.equal(fxRes.fromCurrency, 'USD');
  assert.equal(fxRes.toCurrency, 'INR');
  assert.equal(fxRes.requires_confirmation, false);

  // 7. deposit_funds
  const depRes = parseLocalIntent('Deposit $250 via PayPal', 'USD');
  assert.equal(depRes.intent, 'deposit_funds');
  assert.equal(depRes.amount, 250);
  assert.equal(depRes.currency, 'USD');
  assert.equal(depRes.requires_confirmation, true);

  // 8. withdraw_funds
  const withRes = parseLocalIntent('Withdraw $100 to my bank', 'USD');
  assert.equal(withRes.intent, 'withdraw_funds');
  assert.equal(withRes.amount, 100);
  assert.equal(withRes.requires_confirmation, false);

  // 9. payment_status
  const statRes = parseLocalIntent('What is the status of TX-100001?', 'USD');
  assert.equal(statRes.intent, 'payment_status');
  assert.equal(statRes.requires_confirmation, false);
  assert.ok(statRes.replyText.includes('TX-100001'));

  // Ambiguous command handling: "Send money" without amount or recipient asks for clarification
  const ambigSend = parseLocalIntent('Send money', 'USD');
  assert.equal(ambigSend.intent, 'send_money');
  assert.equal(ambigSend.ambiguous, true);
  assert.equal(ambigSend.requires_confirmation, false);
  assert.ok(ambigSend.clarification_prompt?.length);

  // Ambiguous deposit: "Deposit" without amount asks for clarification
  const ambigDeposit = parseLocalIntent('Deposit', 'USD');
  assert.equal(ambigDeposit.intent, 'deposit_funds');
  assert.equal(ambigDeposit.ambiguous, true);
  assert.equal(ambigDeposit.requires_confirmation, false);
  assert.ok(ambigDeposit.clarification_prompt?.length);
});

test('Phase 9: Comprehensive validation of the 7 required test commands', async () => {
  const snapshot = makeTestSnapshot();
  const app = await createApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Invalid server address');
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const sessionRes = await fetch(`${baseUrl}/api/auth/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snapshot }),
    });
    const { token } = (await sessionRes.json()) as { token: string };

    // Command 1: "Send $50 to Marco"
    const c1Res = await fetch(`${baseUrl}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message: 'Send $50 to Marco', history: [], snapshot }),
    });
    assert.equal(c1Res.status, 200);
    const c1Json = (await c1Res.json()) as {
      intent: string;
      requiresConfirmation: boolean;
      confirmationProposal?: { recipientName: string; amount: number; currency: string; recipientId?: string };
    };
    assert.equal(c1Json.intent, 'send_money');
    assert.equal(c1Json.requiresConfirmation, true);
    assert.equal(c1Json.confirmationProposal?.amount, 50);
    assert.equal(c1Json.confirmationProposal?.currency, 'USD');
    assert.equal(c1Json.confirmationProposal?.recipientName, 'Marco Rossi');
    assert.equal(c1Json.confirmationProposal?.recipientId, 'rec-1');

    // Command 2: "What's my balance?"
    const c2Res = await fetch(`${baseUrl}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message: "What's my balance?", history: [], snapshot }),
    });
    assert.equal(c2Res.status, 200);
    const c2Json = (await c2Res.json()) as {
      intent: string;
      requiresConfirmation: boolean;
      balanceSummary?: Array<{ currency: string; available: number }>;
    };
    assert.equal(c2Json.intent, 'check_balance');
    assert.equal(c2Json.requiresConfirmation, false);
    assert.ok(c2Json.balanceSummary && c2Json.balanceSummary.length >= 4);
    assert.ok(c2Json.balanceSummary.some((b) => b.currency === 'USD' && b.available === 1250));

    // Command 3: "Convert 100 USD to EUR"
    const c3Res = await fetch(`${baseUrl}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message: 'Convert 100 USD to EUR', history: [], snapshot }),
    });
    assert.equal(c3Res.status, 200);
    const c3Json = (await c3Res.json()) as {
      intent: string;
      conversionQuote?: { fromAmount: number; fromCurrency: string; toCurrency: string; toAmount: number; rateTimestamp?: string };
    };
    assert.equal(c3Json.intent, 'currency_conversion');
    assert.equal(c3Json.conversionQuote?.fromAmount, 100);
    assert.equal(c3Json.conversionQuote?.fromCurrency, 'USD');
    assert.equal(c3Json.conversionQuote?.toCurrency, 'EUR');
    assert.equal(c3Json.conversionQuote?.toAmount, 91.2);
    assert.ok(c3Json.conversionQuote?.rateTimestamp);

    // Command 4: "Show my recent transactions"
    const c4Res = await fetch(`${baseUrl}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message: 'Show my recent transactions', history: [], snapshot }),
    });
    assert.equal(c4Res.status, 200);
    const c4Json = (await c4Res.json()) as {
      intent: string;
      requiresConfirmation: boolean;
      recentTransactions?: Array<{ id: string }>;
    };
    assert.equal(c4Json.intent, 'transaction_history');
    assert.equal(c4Json.requiresConfirmation, false);
    assert.ok(c4Json.recentTransactions && c4Json.recentTransactions.length > 0);

    // Command 5: "Deposit $200"
    const c5Res = await fetch(`${baseUrl}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message: 'Deposit $200', history: [], snapshot }),
    });
    assert.equal(c5Res.status, 200);
    const c5Json = (await c5Res.json()) as {
      intent: string;
      requiresConfirmation: boolean;
      confirmationProposal?: { action: string; amount: number; currency: string; method?: string };
    };
    assert.equal(c5Json.intent, 'deposit_funds');
    assert.equal(c5Json.requiresConfirmation, true);
    assert.equal(c5Json.confirmationProposal?.action, 'add_money');
    assert.equal(c5Json.confirmationProposal?.amount, 200);
    assert.equal(c5Json.confirmationProposal?.currency, 'USD');
    assert.equal(c5Json.confirmationProposal?.method, 'paypal');

    // Command 6: "What's the USD to INR rate?"
    const c6Res = await fetch(`${baseUrl}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message: "What's the USD to INR rate?", history: [], snapshot }),
    });
    assert.equal(c6Res.status, 200);
    const c6Json = (await c6Res.json()) as {
      intent: string;
      conversionQuote?: { fromCurrency: string; toCurrency: string; rate: number; source?: string; rateTimestamp?: string };
    };
    assert.equal(c6Json.intent, 'fx_rate_lookup');
    assert.equal(c6Json.conversionQuote?.fromCurrency, 'USD');
    assert.equal(c6Json.conversionQuote?.toCurrency, 'INR');
    assert.equal(c6Json.conversionQuote?.rate, 85.34);
    assert.ok(c6Json.conversionQuote?.source?.includes('GlobalPay Real-Time FX Feed'));
    assert.ok(c6Json.conversionQuote?.rateTimestamp);

    // Command 7: "Send money to John" (ambiguous: missing amount, recipient unknown in address book)
    const c7Res = await fetch(`${baseUrl}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message: 'Send money to John', history: [], snapshot }),
    });
    assert.equal(c7Res.status, 200);
    const c7Json = (await c7Res.json()) as {
      intent: string;
      clarificationNeeded?: boolean;
      replyText: string;
    };
    assert.equal(c7Json.intent, 'send_money');
    assert.ok(
      c7Json.clarificationNeeded ||
        c7Json.replyText.toLowerCase().includes('specify the amount') ||
        c7Json.replyText.toLowerCase().includes('how much')
    );
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});

test('Phase 8: Micro-benchmarking confirms ultra-low latency & cached FX accuracy', async () => {
  // Benchmark 1: Local intent parser executes 1,000 iterations in < 50ms total (< 0.05ms per call)
  const testPhrases = [
    'Send $50 to Marco',
    "What's my balance?",
    'Convert 100 USD to EUR',
    'Deposit $200 via PayPal',
    "What's the USD to INR rate?",
    'Show my recent transactions',
    'How do I receive EUR?',
    'Withdraw $50',
    'Status of TX-100001',
    'Send money to John',
  ];

  const t0 = performance.now();
  for (let i = 0; i < 1000; i++) {
    const phrase = testPhrases[i % testPhrases.length];
    const parsed = parseLocalIntent(phrase, 'USD');
    assert.ok(parsed.intent);
  }
  const totalIntentTimeMs = performance.now() - t0;
  const avgIntentTimeMs = totalIntentTimeMs / 1000;

  // Verify latency is well below 50ms target (typically < 0.05ms per execution)
  assert.ok(avgIntentTimeMs < 1.0, `Expected avg local intent < 1ms, got ${avgIntentTimeMs.toFixed(3)}ms`);
  assert.ok(totalIntentTimeMs < 50.0, `Expected 1000 iterations < 50ms, got ${totalIntentTimeMs.toFixed(2)}ms`);

  // Benchmark 2: Cached FX Rate retrieval with TTL and timestamp
  const fx0 = performance.now();
  const cached1 = getCachedExchangeRate('USD', 'INR');
  const cached2 = getCachedExchangeRate('USD', 'INR');
  const fxDuration = performance.now() - fx0;

  assert.equal(cached1.rate, 85.34);
  assert.equal(cached2.rate, 85.34);
  assert.ok(cached1.timestamp);
  assert.ok(cached1.source.includes('GlobalPay Real-Time FX Feed'));
  assert.ok(fxDuration < 5.0, `Expected cached FX retrieval < 5ms, got ${fxDuration.toFixed(3)}ms`);

  // Benchmark 3: Fast `/api/ai/intent` HTTP endpoint roundtrip < 50ms
  const snapshot = makeTestSnapshot();
  const app = await createApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Invalid server address');
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const sessionRes = await fetch(`${baseUrl}/api/auth/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snapshot }),
    });
    const { token } = (await sessionRes.json()) as { token: string };

    const httpT0 = performance.now();
    const intentRes = await fetch(`${baseUrl}/api/ai/intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message: 'Send $50 to Marco', defaultCurrency: 'USD' }),
    });
    const httpDuration = performance.now() - httpT0;

    assert.equal(intentRes.status, 200);
    const intentData = (await intentRes.json()) as { intent: { intent: string }; latencyMs?: number };
    assert.equal(intentData.intent.intent, 'send_money');
    assert.ok(httpDuration < 100.0, `Expected endpoint roundtrip < 100ms, got ${httpDuration.toFixed(2)}ms`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});

test('Phase 5: Financial Security invariants strictly enforced (no direct AI debit)', async () => {
  const snapshot = makeTestSnapshot();
  const initialUsd = snapshot.balances.USD.available;

  const app = await createApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Invalid server address');
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const sessionRes = await fetch(`${baseUrl}/api/auth/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snapshot }),
    });
    const { token } = (await sessionRes.json()) as { token: string };

    // 1. Asking AI to send money MUST NEVER debit balance directly
    const chatRes = await fetch(`${baseUrl}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message: 'Send $50 to Marco', history: [], snapshot }),
    });
    assert.equal(chatRes.status, 200);
    const chatData = (await chatRes.json()) as { requiresConfirmation: boolean };
    assert.equal(chatData.requiresConfirmation, true);

    // Verify wallet balance is completely unchanged
    const walletStateRes = await fetch(`${baseUrl}/api/wallet/state`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const walletState = (await walletStateRes.json()) as { balances: Record<string, { available: number }> };
    assert.equal(walletState.balances.USD.available, initialUsd);

    // 2. Reject balance over-drafting on transfer endpoint
    const overdraftRes = await fetch(`${baseUrl}/api/wallet/transfer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'Idempotency-Key': 'idem-overdraft-test',
      },
      body: JSON.stringify({
        recipientId: 'rec-1',
        fromCurrency: 'USD',
        amount: 999999, // exceeds available balance
        pin: '1234',
      }),
    });
    assert.equal(overdraftRes.status, 400);
    const overdraftData = (await overdraftRes.json()) as { error: string };
    assert.ok(overdraftData.error.toLowerCase().includes('insufficient'));

    // Balance still intact
    const verifyState = await (
      await fetch(`${baseUrl}/api/wallet/state`, { headers: { Authorization: `Bearer ${token}` } })
    ).json() as { balances: Record<string, { available: number }> };
    assert.equal(verifyState.balances.USD.available, initialUsd);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});



