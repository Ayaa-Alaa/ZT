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
const CONTRACT_ABI = JSON.parse(process.env.CONTRACT_ABI);

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

// Fungsi untuk mendapatkan nominal swap dalam rentang yang diinginkan
function getSwapAmount(direction) {
  if (direction === "usdtToEth" || direction === "usdtToBtc") {
    return ethers.parseUnits((30 + Math.random() * 10).toFixed(6), 6); // USDT: 30 - 40 USDT
  } else if (direction === "btcToEth") {
    return ethers.parseUnits((0.0004 + Math.random() * 0.0004).toFixed(8), 8); // BTC: 0.0004 - 0.0008 BTC
  } else {
    return ethers.parseUnits((0.004 + Math.random() * 0.004).toFixed(18), 18); // ETH: 0.004 - 0.008 ETH
  }
}

// Swap otomatis sesuai urutan wallet 1 → wallet 2 → wallet n
async function autoSwapAllPairs(wallets, totalSwaps, provider) {
  for (let j = 0; j < wallets.length; j++) {
    const wallet = wallets[j];
    console.log(`🔄 Swap dimulai untuk Wallet ${j + 1}: ${wallet.address}`);

    for (let i = 0; i < totalSwaps; i++) {
      await swapAuto(wallet, provider, "usdtToEth", getSwapAmount("usdtToEth"));
      await updateWalletData();
      await delay(getRandomDelay());

      await swapAuto(wallet, provider, "usdtToBtc", getSwapAmount("usdtToBtc"));
      await updateWalletData();
      await delay(getRandomDelay());

      await swapAuto(wallet, provider, "btcToEth", getSwapAmount("btcToEth"));
      await updateWalletData();
    }

    console.log(`✅ Wallet ${j + 1} telah menyelesaikan ${totalSwaps} swap.`);
  }

  console.log("🏁 Semua wallet telah selesai melakukan swap!");
}

// Fungsi Swap dengan Gas Limit Standar & Slippage 0.5%
async function swapAuto(wallet, provider, direction, amountIn) {
  try {
    const swapContract = new ethers.Contract(ROUTER_ADDRESS, CONTRACT_ABI, wallet);
    let params;
    const deadline = Math.floor(Date.now() / 1000) + 120;

    const expectedAmount = Number(amountIn) * 1.005; // Prediksi hasil swap
    const slippagePercentage = 0.995; // Izinkan slippage 0.5%
    
    params = {
      tokenIn: direction.includes("usdt") ? USDT_ADDRESS : BTC_ADDRESS,
      tokenOut: direction.includes("eth") ? ETH_ADDRESS : BTC_ADDRESS,
      fee: 3000,
      recipient: wallet.address,
      deadline,
      amountIn,
      amountOutMinimum: ethers.parseUnits((expectedAmount * slippagePercentage).toFixed(18), 18),
      sqrtPriceLimitX96: 0n
    };

    const tx = await swapContract.exactInputSingle(params, {
      gasLimit: 300000, // Gunakan gas limit standar
      gasPrice: await provider.getFeeData().gasPrice
    });

    console.log(`Swap berhasil: ${tx.hash}`);
    await tx.wait();
  } catch (error) {
    console.error(`Swap gagal: ${error.reason || error.message}`);
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

// Fungsi untuk jeda acak antar swap
function getRandomDelay() {
  return Math.floor(Math.random() * (120 - 60 + 1) + 60) * 1000;

// Menjalankan swap otomatis sesuai urutan wallet
autoSwapAllPairs(wallets, totalSwaps, provider);
