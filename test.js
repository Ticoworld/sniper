// const { generateWallet } = require("@stacks/wallet-sdk");

// async function generateAndRetrieveWallet() {
//   try {
//     // Assuming "your_seed_phrase" is your 24-word Stacks seed phrase
//     const wallet = await generateWallet({
//       secretKey:
//         "advance want supply problem lottery gentle begin dream private blue grow atom salon still time drink expect blouse jungle adjust always length normal unknown",
//       password: "password",
//     });
//     console.log(wallet);

//     // Log wallet structure to inspect
//     console.log(wallet);

//     // Check if wallet.accounts exists and contains accounts
//     if (wallet.accounts && wallet.accounts.length > 0) {
//       const privateKey = wallet.accounts[0].stxPrivateKey;
//       console.log("Private Key:", privateKey);
//     } else {
//       console.error("No accounts found in wallet.");
//     }
//   } catch (error) {
//     console.error("Error generating wallet:", error);
//   }
// }

// generateAndRetrieveWallet();


const crypto = require('crypto');
const fs = require('fs');

// Your private key (should be securely stored, not hardcoded in production)
const privateKey = '1e5893e3c56606facd0bbef68c314f8b30c92decffe9c703cb7a407b596b2c7601';  

// Your password for encryption
const password = 'doughnut';  

// Create a random initialization vector (IV) for added security
const iv = crypto.randomBytes(16);

// Derive a key from the password using PBKDF2 for better key security
crypto.pbkdf2(password, 'salt', 100000, 32, 'sha256', (err, derivedKey) => {
  if (err) throw err;

  const cipher = crypto.createCipheriv('aes-256-cbc', derivedKey, iv);
  let encrypted = cipher.update(privateKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  // Save the encrypted private key and IV to a file or environment variables
  const encryptedData = `ENCRYPTED_PRIVATE_KEY=${encrypted}\nENCRYPTION_PASSWORD=${password}\nIV=${iv.toString('hex')}\n`;

  fs.writeFileSync('.env', encryptedData);
  console.log('Private key encrypted and saved to .env');
});

async function seedDefaultUsers() {
  const defaultChatIds = ["1331814679", "6969979193", "6761938952"];

  for (const chatId of defaultChatIds) {
    const existingUser = await User.findOne({ userId: chatId });

    if (!existingUser) {
      const newUser = new User({
        userId: chatId,
        connected: false,
      });
      await newUser.save();
      console.log(`User with ID ${chatId} added to the database.`);
    }
  }
}

seedDefaultUsers();