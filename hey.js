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
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// List of chat IDs to send updates to
const chatIds = [
    '1331814679',
    '6969979193',
    '6761938952'
];

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

// Send message to all chat IDs
async function sendToAllChats(message) {
    for (const chatId of chatIds) {
        try {
            await bot.sendMessage(chatId, message);
            console.log(`Sent message to chat ID ${chatId}`);
        } catch (error) {
            console.error(`Error sending message to chat ID ${chatId}:`, error);
        }
    }
}

// Monitor mempool transactions
async function checkMempool() {
    console.log("Checking mempool for new transactions...");
    try {
        const response = await fetchWithRetry(`${STACKS_NODE_URL}/extended/v1/tx/mempool?limit=20&unanchored=true&order_by=age&order=desc`);
        const data = response; // No need to parse JSON if not required

        // Filter smart contract transactions
        const smartContracts = data.results.filter(tx => tx.tx_type === 'smart_contract');

        console.log(`Found ${smartContracts.length} smart contract transaction(s).`);

        // Process each smart contract
        const contractPromises = smartContracts.map(async (contract) => {
            // Check if the contract ID ends with "stxcity"
            if (contract.smart_contract.contract_id.endswith('stxcity')) {
                console.log(`New STX.City token contract detected: ${contract.tx_id}`);

                // Notify Telegram bot
                const message = `🚀 New STX.City token deployed!\n\nContract ID: ${contract.smart_contract.contract_id}\nTransaction ID: ${contract.tx_id}\nTrack: ${STACKS_NODE_URL}/extended/v1/tx/${contract.tx_id}`;
                await sendToAllChats(message);
                console.log(`Sent Telegram message: ${message}`);

                // Track the transaction for confirmation
                trackTransaction(contract.tx_id);
            } else {
                console.log(`Ignored contract: ${contract.smart_contract.contract_id}`);
            }
        });

        // Wait for all contract promises to resolve
        await Promise.all(contractPromises);
    } catch (error) {
        console.error('Error checking mempool:', error);
    }
}

// Track transaction until confirmed
async function trackTransaction(txId) {
    console.log(`Tracking transaction ${txId} until confirmation...`);
    try {
        const interval = setInterval(async () => {
            const response = await fetchWithRetry(`${STACKS_NODE_URL}/extended/v1/tx/${txId}`);
            const data = response; // No need to parse JSON if not required

            console.log(`Checking transaction ${txId}...`);

            if (data.tx_status === 'success') {
                console.log(`Transaction ${txId} confirmed.`);

                // Notify Telegram bot
                const message = `✅ Token deployment confirmed!\n\nTransaction ID: ${txId}\nContract ID: ${data.smart_contract.contract_id}`;
                await sendToAllChats(message);
                console.log(`Sent Telegram confirmation message: ${message}`);

                clearInterval(interval); // Stop checking once the transaction is confirmed
            }
        }, 3000); // Check every 3 seconds for confirmation
    } catch (error) {
        console.error('Error tracking transaction:', error);
    }
}

// Set interval to check mempool every 3 seconds
setInterval(checkMempool, 3000); // Check every 3 seconds

// Start Express server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
