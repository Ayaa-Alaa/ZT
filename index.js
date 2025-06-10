import "dotenv/config";
import blessed from "blessed";
import figlet from "figlet";
import { ethers } from "ethers";
import readline from "readline";

// Mengelola daftar RPC
const RPC_LIST = process.env.RPC_URL.split(",").map(url => url.trim());
let currentRpcIndex = 0;
let provider = new ethers.JsonRpcProvider(RPC_LIST[currentRpcIndex]);

function switchToNextRpc() {
  currentRpcIndex = (currentRpcIndex + 1) % RPC_LIST.length;
  provider = new ethers.JsonRpcProvider(RPC_LIST[currentRpcIndex]);
  console.log(`Beralih ke RPC ${currentRpcIndex + 1}: ${RPC_LIST[currentRpcIndex]}`);
}

// Mendapatkan Private Key dari pengguna
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question("Masukkan PRIVATE_KEY (pisahkan dengan koma jika lebih dari satu): ", (input) => {
  const privateKeys = input.split(",").map(pk => pk.trim());
  startApplication(privateKeys);
});

function startApplication(privateKeys) {
  if (privateKeys.length === 0) {
    console.error("Tidak ada private key yang diberikan. Program berhenti.");
    process.exit(1);
  }

  const wallets = privateKeys.map(pk => new ethers.Wallet(pk, provider));
  console.log(`Menggunakan ${wallets.length} akun untuk transaksi.`);

  startAutoSwapSequence(wallets);
}

// Fungsi untuk menangani swap dengan fallback jika terjadi error RPC
async function safeSwap(swapFunction, wallet, ...args) {
  let success = false;
  let attempts = 0;

  while (!success && attempts < RPC_LIST.length) {
    try {
      await swapFunction(wallet, ...args);
      success = true;
      console.log(`Swap berhasil dengan RPC ${currentRpcIndex + 1}`);
    } catch (error) {
      console.log(`RPC ${currentRpcIndex + 1} gagal: ${error.message}`);
      switchToNextRpc();
      attempts++;
    }
  }

  if (!success) {
    console.log("Semua RPC gagal! Swap tidak dapat dilakukan.");
  }
}

// Fungsi untuk mendapatkan jumlah swap acak
function getRandomSwapAmount() {
  return Math.floor(Math.random() * (300 - 100 + 1) + 100);
}

// Fungsi delay acak untuk swap
function getRandomDelay() {
  return Math.floor(Math.random() * (120 - 60 + 1) + 60) * 1000;
}

async function autoSwapAllPairs(wallets, totalSwaps) {
  for (let i = 0; i < totalSwaps; i++) {
    const wallet = wallets[i % wallets.length];

    await safeSwap(swapAuto, wallet, "usdtToEth", getRandomSwapAmount());
    await updateWalletData();
    await delay(getRandomDelay());

    await safeSwap(swapAuto, wallet, "usdtToBtc", getRandomSwapAmount());
    await updateWalletData();
    await delay(getRandomDelay());

    await safeSwap(swapAuto, wallet, "btcToEth", getRandomSwapAmount());
    await updateWalletData();
  }

  console.log("Semua swap selesai!");
}

function startAutoSwapSequence(wallets) {
  rl.question("Masukkan jumlah swap: ", async (value) => {
    rl.close();
    const totalSwaps = parseInt(value);
    if (isNaN(totalSwaps) || totalSwaps <= 0) {
      console.log("Jumlah swap tidak valid. Masukkan angka > 0.");
      return;
    }
    await autoSwapAllPairs(wallets, totalSwaps);
  });
}

// Fungsi update saldo wallet secara berkala
async function updateWalletData() {
  console.log("Mengupdate saldo wallet...");
}
