const express = require('express');
const fetch = require('node-fetch');
const TelegramBot = require('node-telegram-bot-api');
const { connectWebSocketClient } = require('@stacks/blockchain-api-client'); // Import WebSocket client
require('dotenv').config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Load environment variables
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const STACKS_NODE_URL = process.env.STACKS_NODE_URL || 'wss://stacks-node-api.mainnet.stacks.co';

// Initialize Telegram bot
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// Connect to WebSocket and subscribe to new transactions
async function startWebSocket() {
  try {
    const client = await connectWebSocketClient(STACKS_NODE_URL);

    // Monitor new transactions from the mempool
    client.subscribeMempool(async (tx) => {
      // Filter for smart contract transactions only
      if (tx.tx_type === 'smart_contract') {
        // Check if the contract ID ends with "stxcity"
        if (tx.smart_contract.contract_id.endsWith('stxcity')) {
          console.log(`New STX.City token contract detected: ${tx.tx_id}`);

          // Send Telegram notification
          const message = `🚀 New STX.City token deployed!\n\nContract ID: ${tx.smart_contract.contract_id}\nTransaction ID: ${tx.tx_id}\nTrack: ${STACKS_NODE_URL}/extended/v1/tx/${tx.tx_id}`;
          await bot.sendMessage(process.env.TELEGRAM_CHAT_ID, message);
          console.log(`Sent Telegram message: ${message}`);

          // Track the transaction for confirmation
          trackTransaction(tx.tx_id);
        } else {
          console.log(`Ignored contract: ${tx.smart_contract.contract_id}`);
        }
      }
    });
  } catch (error) {
    console.error('Error connecting to WebSocket:', error);
  }
}

// Track transaction until confirmed
async function trackTransaction(txId) {
  console.log(`Tracking transaction ${txId} until confirmation...`);
  try {
    const interval = setInterval(async () => {
      // Fetch the transaction details for the given txId
      const response = await fetchWithRetry(`${STACKS_NODE_URL}/extended/v1/tx/${txId}`);
      const data = response; // No need to parse JSON if not required

      console.log(`Checking transaction ${txId}...`);

      // Check if transaction is confirmed in the anchor block
      if (data.tx_status === 'success') {
        console.log(`Transaction ${txId} confirmed.`);

        // Send Telegram notification
        const message = `✅ Token deployment confirmed!\n\nTransaction ID: ${txId}\nContract ID: ${data.smart_contract.contract_id}`;
        await bot.sendMessage(process.env.TELEGRAM_CHAT_ID, message);
        console.log(`Sent Telegram confirmation message: ${message}`);

        clearInterval(interval); // Stop checking once the transaction is confirmed
      }
    }, 3000); // Check every 3 seconds for confirmation
  } catch (error) {
    console.error('Error tracking transaction:', error);
  }
}

// Fetch with retry in case of failure
async function fetchWithRetry(url, retries = 5, delay = 1000) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    if (retries > 0) {
      console.log(`Retrying in ${delay / 1000}s...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchWithRetry(url, retries - 1, delay * 2); // Exponential backoff
    }
    console.error(`Max retries reached. Failed to fetch ${url}:`, error);
    throw error;
  }
}

// Start WebSocket
startWebSocket();

// Start Express server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
