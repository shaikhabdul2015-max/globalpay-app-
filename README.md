# GlobalPay AI — Multi-Currency Wallet with Intelligent PayPal Agent

GlobalPay AI is a next-generation multi-currency financial platform designed for freelancers, expats, and cross-border digital nomads. It bridges the gap between natural language AI interactions and secure financial transaction rails via the PayPal Sandbox ecosystem.

## 🚀 Live Demo & Deployment
- **Live URL:** [Paste your Render Live URL here]
- **Demo Video:** [Paste your YouTube 3-min Video Link here]

## 💡 The Problem
Managing money across borders is rigid and fragmented. International users lose time calculating conversions, toggling between exchange charts, and filling out complex transaction forms just to execute basic deposits or payouts. 

## ✨ Our Solution: The AI Financial Agent
GlobalPay AI introduces a unified conversational agent **"Ask GlobalPay AI"** that intercepts user intents and securely triggers precise financial operations.
- **Natural Language Parsing:** Users can type plain instructions like *"Add \$50 using PayPal"* or *"Deposit 100 USD"*.
- **Deterministic Backend Control:** The AI handles the interpretation, but our robust Express backend completely controls the actual financial ledger.
- **Seamless PayPal Integration:** Integrates dynamically with the **PayPal Sandbox Checkout ecosystem** right inside the conversational layer.

## ⚙️ Core Technical Architecture
1. **Frontend:** React with fluid Tailwind CSS modules tailored for clean multi-currency portfolio states (USD, EUR, GBP, INR, AED).
2. **Backend Execution:** Node.js + Express server hosting strict validation boundaries.
3. **AI Parsing Core:** Built using LLM structured JSON output rules to reliably transform natural inputs into actionable API payloads without giving the LLM independent ledger authorization.
4. **Payment Gateway:** Native integration simulation using **PayPal REST APIs / Sandbox SDKs** to execute instant top-ups.

## 📁 Repository Structure
```text
globalpay-app/
├── src/
│   ├── ai/          # Command parser logic & system prompts
│   ├── payments/    # PayPal Sandbox API connections
│   └── components/  # React Chatbot & Currency Card viewports
└── server.js        # Main Express engine
```

## 🛠️ Setup & Installation
1. Clone the repository:
   ```bash
   git clone https://github.com
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure your `.env` variables:
   ```env
   OPENAI_API_KEY=your_openai_or_gemini_key
   PAYPAL_CLIENT_ID=your_sandbox_client_id
   PAYPAL_CLIENT_SECRET=your_sandbox_secret
   PAYPAL_BASE_URL=https://paypal.com
   ```
4. Run the local environment:
   ```bash
   npm run dev
   ```
