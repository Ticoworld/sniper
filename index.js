const express = require("express");
const fetch = require("node-fetch");
const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const mongoose = require("mongoose");
require("dotenv").config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 5000;
const cors = require('cors');
app.use(cors());


// Load environment variables
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const STACKS_NODE_URL = process.env.STACKS_NODE_URL || "https://stacks-node-api.mainnet.stacks.co";
const MONGO_URI = process.env.MONGO_URI;

// Validate environment variables
if (!TELEGRAM_TOKEN || !MONGO_URI) {
  console.error("Missing required environment variables."); 
  process.exit(1);
}

// Middleware to parse JSON requests
app.use(express.json());

// Connect to MongoDB
mongoose.connect(MONGO_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Define User schema and model
const userSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  wallet: { type: String, default: null },
  connected: { type: Boolean, default: false },
});
const User = mongoose.model("User ", userSchema);

// Initialize Telegram bot
// const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const bot = new TelegramBot(TELEGRAM_TOKEN);

// Webhook for Telegram (if you're using webhooks instead of polling)
app.post("/webhook", (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
  console.log('helloworld');
});

app.get("/", (req, res) => {
  res.send("Server is running");
});

// Handle incoming messageslet 
awaitingUserId = false;
let adminUserId = "1331814679";  // Replace with your actual admin's user ID

bot.on("message", async (msg) => {
  const userId = msg.chat.id.toString();  // Use userId as string for MongoDB compatibility

  // Check if user is authorized
  let user = await User.findOne({ userId: userId });

  // If user is not in the database, deny access
  if (!user) {
    await bot.sendMessage(userId, "You are not authorized to use this bot. Please contact the admin to get access.");
    return; // Stop further processing
  }

  // Handle /start command to check for wallet connection
  if (msg.text === "/start") {
    if (!user.connected) {
      await bot.sendMessage(userId, "Your wallet is not connected. Please use the /connect command to link your wallet.");
    } else {
      await bot.sendMessage(userId, "Welcome back! Your wallet is connected.");
    }
    return; // Stop further processing for /start
  }

  // Handle /connect command for wallet connection
  if (msg.text === "/connect") {
    const walletConnectionLink = `https://sniper-bot-x3bd.onrender.com/?userId=${userId}`;
    await bot.sendMessage(
      userId,
      `<a href="${walletConnectionLink}">Click here </a> to connect your wallet.`,
      { parse_mode: "HTML" }
    );
    return; // Stop further processing for /connect
  }

  // Admin check for /adduser command
  if (msg.text === "/adduser" && userId === adminUserId && !awaitingUserId) {
    awaitingUserId = true;
    await bot.sendMessage(userId, "Please send the user ID to add.");
    return; // Stop further processing for /adduser
  }

  // Capture the next message as the new user ID to be added
  if (awaitingUserId) {
    const newUserId = msg.text;
    let userInDB = await User.findOne({ userId: newUserId });

    if (userInDB) {
      await bot.sendMessage(userId, "This user is already in the database.");
    } else {
      // Add the new user to the database
      const newUser = new User({ userId: newUserId, connected: false, wallet: null });
      await newUser.save();
      await bot.sendMessage(userId, `User with ID ${newUserId} has been added successfully.`);
    }
    awaitingUserId = false; // Reset the state after processing
  }
});


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
      await new Promise((resolve) => setTimeout(resolve, delay));
      return fetchWithRetry(url, retries - 1, delay * 2);
    }
    console.error(`Max retries reached. Failed to fetch ${url}:`, error);
    throw error;
  }
}

// Send message to all chat IDs from the database
async function sendToAllChats(message) {
  try {
    const users = await User.find();
    const chatIds = users.map(user => user.userId);

    const promises = chatIds.map(chatId =>
      bot.sendMessage(chatId, message, { parse_mode: "Markdown" }).catch(err => {
        console.error(`Failed to send message to chat ID ${chatId}:`, err);
      })
    );

    await Promise.all(promises);
    console.log("Notifications sent to all authorized users.");
  } catch (error) {
    console.error("Error sending message to all users:", error);
  }
}

// Track transaction for success confirmation
async function trackTransaction(txId) {
  const checkStatus = async () => {
    try {
      const txData = await fetchWithRetry(`${STACKS_NODE_URL}/extended/v1/tx/${txId}`);
      if (txData.tx_status === "success") {
        const message = `✅ *Transaction Confirmed!* ✅\n\n🔗 Contract ID: ${txData.smart_contract?.contract_id || "N/A"}\n🆔 Transaction ID: ${txId}\n🎉 Status: *Success*\n🔍 [Track Transaction](${STACKS_NODE_URL}/extended/v1/tx/${txId})`;
        await sendToAllChats(message);
      } else {
        setTimeout(checkStatus, 1000); // Check again after 1 second
      }
    } catch (error) {
      console.error(`Error tracking transaction ${txId}:`, error);
      setTimeout(checkStatus, 2000); // Retry after 2 seconds on error
    }
  };
  checkStatus();
}

// Check mempool for smart contract transactions
async function checkMempool() {
  try {
    const response = await fetchWithRetry(
      `${STACKS_NODE_URL}/extended/v1/tx/mempool?limit=10&fields=tx_id,tx_type,smart_contract`
    );
    const smartContracts = response.results.filter(
      (tx) =>
        tx.tx_type === "smart_contract" &&
        tx.smart_contract?.contract_id?.endsWith("stxcity")
    );

    for (const contract of smartContracts) {
      const message = `🚨 *New Smart Contract Detected!* 🚨\n\n🔗 Contract ID: ${contract.smart_contract.contract_id}\n🆔 Transaction ID: ${contract.tx_id}\n🔍 [Track Transaction](${STACKS_NODE_URL}/extended/v1/tx/${contract.tx_id})`;
      await sendToAllChats(message);
      trackTransaction(contract.tx_id); // Start confirmation tracking
    }
  } catch (error) {
    console.error("Error in mempool check:", error);
  } finally {
    setTimeout(checkMempool, 1000); // Run again after 1 second
  }
}

// Initial call to check the mempool
checkMempool();

// Endpoint to update the wallet address
app.post("/update-wallet", async (req, res) => {
  console.log(req.body); // Log incoming request body
  const { userId, wallet } = req.body;

  if (!userId || !wallet) {
    return res.status(400).send("Invalid request");
  }

  try {
    const user = await User.findOne({ userId });
    if (user) {
      user.wallet = wallet;
      user.connected = true;
      await user.save();
      return res.status(200).send("Wallet updated successfully.");
    }
    return res.status(404).send("User not found.");
  } catch (error) {
    console.error("Error updating wallet:", error); 
    return res.status(500).send("Internal server error.");
  }
});



// Start Express server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
 
// Self-ping every 5 minutes to keep the server awake
setInterval(() => {
  axios
    .get("https://sniper-an93.onrender.com") // Replace with your actual URL
    .then(() => console.log("Self-ping successful"))
    .catch((err) => console.error("Self-ping failed", err));
}, 300000); // 300,000 ms = 5 minutes