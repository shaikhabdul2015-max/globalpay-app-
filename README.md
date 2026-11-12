# 🌍 GlobalPay AI

**An AI-powered cross-border payment and live FX wallet assistant that simplifies global money transfers through natural chat.**

[![License: MIT](https://shields.io)](https://opensource.org)
[![Built with Google Gemini](https://shields.io)](https://google.com)
[![Powered by PayPal](https://shields.io)](https://paypal.com)

---

## 🔗 Live Links & Demo
* **Live Application:** [https://onrender.com](https://onrender.com)
* **Video Demonstration:** [Watch Demo on YouTube](https://youtube.com/shorts/Ji01F0skLHY)

---

## 📖 Overview
International travelers and global users often struggle with managing multiple currencies, tracking real-time foreign exchange (FX) rates, and dealing with complex cross-border payment interfaces. **GlobalPay AI** solves this by combining a multi-currency digital wallet with an intelligent conversational AI assistant—making global money management as easy as sending a text message.

---

## ✨ Key Features
* **Multi-Currency Portfolio:** View and manage balances across major global currencies (**USD, EUR, GBP, INR, AED**) with real-time mid-market FX conversions.
* **Conversational AI Commands:** Use natural language in the chatbox (e.g., *"Add $50 to my wallet"*, *"Deposit 100 EUR"*, or *"Send $50 to Marco"*) to execute financial actions instantly.
* **Inline PayPal Sandbox Checkout:** Launches an interactive PayPal checkout overlay directly inside the chat window—supporting PayPal balance and Debit/Credit card funding without popup blockers.
* **Hybrid Intent Parser:** Pairs **Google Gemini AI** with a deterministic backend fallback parser (`parseNaturalCommandFallback`) to guarantee reliable command execution in all environments.
* **Instant Ledger & Receipt Tracking:** Automatically verifies top-ups via `/api/wallet/topup`, updates dashboard balances in real time, and generates digital receipts with PayPal order references.

---

## 🛠️ Tech Stack
* **Frontend:** React, TypeScript, Tailwind CSS
* **Backend:** Node.js, Express
* **AI & NLP:** Google Gemini API (built via Google AI Studio)
* **Payments:** PayPal Checkout / PayPal Sandbox API
* **Deployment & Testing:** Render, Vitest (`globalpay-ai.test.ts`)

---

## 🚀 Getting Started (Local Setup)

### Prerequisites
* Node.js (v18+ recommended)
* npm or yarn
* Google Gemini API Key (optional—includes deterministic fallback parser for testing)
* PayPal Sandbox Client ID

### Installation
1. **Clone the repository:**
   ```bash
   git clone https://github.com
   cd globalpay-app-
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   Create a `.env` file in the root directory and add your keys:
   ```env
   GEMINI_API_KEY=your_google_gemini_api_key
   PAYPAL_CLIENT_ID=your_paypal_sandbox_client_id
   PAYPAL_CLIENT_SECRET=your_paypal_sandbox_client_secret
   ```

4. **Run the application:**
   ```bash
   npm run dev
   ```

---

## 🧪 Testing Instructions
1. Open the [Live App](https://onrender.com) or run locally.
2. Open the **GlobalPay AI** assistant chatbox on the main dashboard.
3. Enter a command such as **`Add $50 to my wallet`** or **`Deposit 100 EUR`**.
4. When the inline **PayPal Sandbox Checkout** overlay appears inside the chat, click the PayPal or Debit/Credit card button to simulate payment approval.
5. Verify that the wallet balance updates automatically on the dashboard and a receipt is generated. *(Note: Uses PayPal Sandbox—no real money is charged).*

---

## 📄 License
This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.
