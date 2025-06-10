import "dotenv/config";
import readlineSync from "readline-sync";
import { ethers } from "ethers";

// Mengambil data dari .env
const RPC_LIST = process.env.RPC_URL.split(",").map(url => url.trim());
const USDT_ADDRESS = process.env.USDT_ADDRESS;
const ETH_ADDRESS = process.env.ETH_ADDRESS;
const BTC_ADDRESS = process.env.BTC_ADDRESS;
const ROUTER_ADDRESS = process.env.ROUTER_ADDRESS;
const NETWORK_NAME = process.env.NETWORK_NAME;
const CONTRACT_ABI = JSON.parse(process.env.CONTRACT_ABI); // Mengubah string JSON menjadi array ABI

// Pilih RPC
console.log("Pilih RPC yang ingin digunakan:");
RPC_LIST.forEach((rpc, index) => console.log(`${index + 1}. ${rpc}`));
const selectedRpcIndex = readlineSync.question("Masukkan nomor RPC: ") - 1;

if (isNaN(selectedRpcIndex) || selectedRpcIndex < 0 || selectedRpcIndex >= RPC_LIST.length) {
  console.error("Pilihan tidak valid.");
  process.exit(1);
}

const provider = new ethers.JsonRpcProvider(RPC_LIST[selectedRpcIndex]);
console.log(`Menggunakan RPC: ${RPC_LIST[selectedRpcIndex]}`);

// Input Private Key dengan tampilan alamat wallet
const privateKeysInput = readlineSync.question("Masukkan PRIVATE_KEY (pisahkan dengan koma jika lebih dari satu): ");
const privateKeys = privateKeysInput.split(",").map(pk => pk.trim());

if (privateKeys.length === 0) {
  console.error("Tidak ada private key yang diberikan. Program berhenti.");
  process.exit(1);
}

// Konversi Private Key menjadi alamat wallet
const wallets = privateKeys.map(pk => new ethers.Wallet(pk, provider));
const walletAddresses = wallets.map(wallet => wallet.address);

// Refresh tampilan untuk menunjukkan alamat wallet
console.clear();
console.log("🔑 Wallet Address yang digunakan:");
walletAddresses.forEach((address, index) => {
  console.log(`Wallet ${index + 1}: ${address}`);
});

// Masukkan jumlah swap
const totalSwaps = readlineSync.questionInt("Masukkan jumlah swap: ");

if (totalSwaps <= 0) {
  console.error("Jumlah swap tidak valid. Masukkan angka > 0.");
  process.exit(1);
}

// Swap otomatis
async function autoSwapAllPairs(wallets, totalSwaps, provider) {
  for (let i = 0; i < totalSwaps; i++) {
    const wallet = wallets[i % wallets.length];

    await swapAuto(wallet, provider, "usdtToEth", getRandomSwapAmount());
    await updateWalletData();
    await delay(getRandomDelay());

    await swapAuto(wallet, provider, "usdtToBtc", getRandomSwapAmount());
    await updateWalletData();
    await delay(getRandomDelay());

    await swapAuto(wallet, provider, "btcToEth", getRandomSwapAmount());
    await updateWalletData();
  }

  console.log("Semua swap selesai!");
}

// Fungsi Swap
async function swapAuto(wallet, provider, direction, amountIn) {
  try {
    const swapContract = new ethers.Contract(ROUTER_ADDRESS, CONTRACT_ABI, wallet);
    let params;
    const deadline = Math.floor(Date.now() / 1000) + 120;

    if (direction === "usdtToEth") {
      params = { tokenIn: USDT_ADDRESS, tokenOut: ETH_ADDRESS, fee: 3000, recipient: wallet.address, deadline, amountIn, amountOutMinimum: 0, sqrtPriceLimitX96: 0n };
    } else if (direction === "usdtToBtc") {
      params = { tokenIn: USDT_ADDRESS, tokenOut: BTC_ADDRESS, fee: 3000, recipient: wallet.address, deadline, amountIn, amountOutMinimum: 0, sqrtPriceLimitX96: 0n };
    } else if (direction === "btcToEth") {
      params = { tokenIn: BTC_ADDRESS, tokenOut: ETH_ADDRESS, fee: 3000, recipient: wallet.address, deadline, amountIn, amountOutMinimum: 0, sqrtPriceLimitX96: 0n };
    } else {
      throw new Error("Swap direction tidak valid.");
    }

    const tx = await swapContract.exactInputSingle(params, { gasLimit: 150000, gasPrice: await provider.getFeeData().gasPrice });
    console.log(`Swap berhasil: ${tx.hash}`);
    await tx.wait();
  } catch (error) {
    console.error(`Swap gagal: ${error.message}`);
  }
}

// Fungsi Update Saldo
async function updateWalletData() {
  console.log("Mengupdate saldo wallet...");
}

// Fungsi Delay
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Fungsi untuk mendapatkan jumlah swap acak
function getRandomSwapAmount() {
  return Math.floor(Math.random() * (300 - 100 + 1) + 100);
}

// Fungsi untuk jeda acak antar swap
function getRandomDelay() {
  return Math.floor(Math.random() * (120 - 60 + 1) + 60) * 1000;
}

// Menjalankan swap otomatis
autoSwapAllPairs(wallets, totalSwaps, provider);
