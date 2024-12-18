const express = require('express');
const fetch = require('node-fetch');
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;
// Load environment variables
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const STACKS_NODE_URL = process.env.STACKS_NODE_URL || 'https://stacks-node-api.mainnet.stacks.co';

// Initialize Telegram bot
// const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);

app.post("/webhook", (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
  });

// List of chat IDs to send updates to
const chatIds = ['1331814679', '6969979193', '6761938952'];

// Track sent transactions to prevent duplicates
const sentTransactions = new Set();
const confirmedTransactions = new Set(); // Track confirmed transactions

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
            return fetchWithRetry(url, retries - 1, delay * 2);
        }
        console.error(`Max retries reached. Failed to fetch ${url}:`, error);
        throw error;
    }
}

// Send message to all chat IDs
async function sendToAllChats(message) {
    for (const chatId of chatIds) {
        try {
            await bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
            console.log(`Sent message to chat ID ${chatId}`);
        } catch (error) {
            console.error(`Error sending message to chat ID ${chatId}:`, error);
        }
    }
}

// Track transaction for success confirmation
async function trackTransaction(txId) {
    console.log(`Tracking transaction ${txId} for confirmation...`);
    const interval = setInterval(async () => {
        try {
            const txData = await fetchWithRetry(`${STACKS_NODE_URL}/extended/v1/tx/${txId}`);
            if (txData.tx_status === 'success' && !confirmedTransactions.has(txId)) {
                confirmedTransactions.add(txId); // Mark as confirmed

                const message = `✅ *Transaction Confirmed!* ✅\n\n🔗 Contract ID: ${txData.smart_contract?.contract_id || 'N/A'}\n🆔 Transaction ID: ${txId}\n🎉 Status: *Success*\n🔍 Track here: ${STACKS_NODE_URL}/extended/v1/tx/${txId}`;
                await sendToAllChats(message);
                console.log(`Transaction ${txId} confirmed and notification sent.`);
                clearInterval(interval); // Stop tracking
            }
        } catch (error) {
            console.error(`Error tracking transaction ${txId}:`, error);
        }
    }, 3000); // Check every 3 seconds
}

// Check mempool for smart contract transactions
async function checkMempool() {
    console.log("Checking mempool for new transactions...");
    try {
        const response = await fetchWithRetry(`${STACKS_NODE_URL}/extended/v1/tx/mempool?limit=20&unanchored=true&order_by=age&order=desc`);
        
        const smartContracts = response.results.filter(tx => 
            tx.tx_type === 'smart_contract' && 
            tx.smart_contract.contract_id.endsWith('stxcity') // Filter for "stxcity"
        );

        if (smartContracts.length > 0) {
            console.log(`Found ${smartContracts.length} relevant smart contract transaction(s).`);

            for (const contract of smartContracts) {
                if (!sentTransactions.has(contract.tx_id)) {
                    sentTransactions.add(contract.tx_id); // Mark transaction as sent

                    // Notify about the new smart contract
                    const message = `🚨 *New Smart Contract Detected!* 🚨\n\n🔗 Contract ID: ${contract.smart_contract.contract_id}\n🆔 Transaction ID: ${contract.tx_id}\n🔍 Track here: ${STACKS_NODE_URL}/extended/v1/tx/${contract.tx_id}`;
                    await sendToAllChats(message);
                    console.log(`Notified about transaction: ${contract.tx_id}`);

                    // Start tracking for confirmation
                    trackTransaction(contract.tx_id);
                }
            }
        } else {
            console.log("No new relevant smart contract transactions found.");
        }
    } catch (error) {
        console.error('Error checking mempool:', error);
    }
}


// Check mempool every 3 seconds
setInterval(checkMempool, 3000);


const axios = require('axios');

// Self-ping every 5 minutes
setInterval(() => {
  axios.get('https://sniper-an93.onrender.com')
    .then(() => console.log('Self-ping successful'))
    .catch(err => console.error('Self-ping failed', err));
}, 300000); // 300,000 ms = 5 minutes


// Start Express server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
