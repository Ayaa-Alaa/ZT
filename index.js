// modifikasi.js
import fs from "fs";
import readline from "readline";
import { ethers } from "ethers";

// ========================== CONFIGURATION ==============================
const configData = JSON.parse(fs.readFileSync("datanya.json", "utf-8"));
const { RPC_URL, USDT_ADDRESS, ETH_ADDRESS, BTC_ADDRESS, ROUTER_ADDRESS, NETWORK_NAME } = configData;

const APPROVAL_GAS_LIMIT = 100000;
const SWAP_GAS_LIMIT = 150000;

let transactionRunning = false;
let chosenSwap = null;
let transactionQueue = Promise.resolve();
let transactionQueueList = [];
let transactionIdCounter = 0;
let nextNonce = null;
let selectedGasPrice = null;
let PRIVATE_KEY = "";
let provider, wallet;

// ========================== SIMPLE LOGGING & HELPERS ==============================
// Fungsi addLog hanya mencetak pesan error; pesan transaksi utama akan ditampilkan di addTransactionToQueue.
function addLog(message, type = "info") {
  if (type === "error") console.log(`[ERROR] ${message}`);
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function shortHash(hash) {
  return `${hash.substring(0, 6)}...${hash.substring(hash.length - 4)}`;
}

// ========================== WALLET INITIALIZATION ==============================
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function inputPrivateKey() {
  return new Promise((resolve) => {
    rl.question("Masukkan Private Key: ", (key) => {
      resolve(key.trim());
    });
  });
}

async function initializeWallet() {
  PRIVATE_KEY = await inputPrivateKey();
  provider = new ethers.JsonRpcProvider(RPC_URL);
  wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  return { provider, wallet };
}

// ========================== ABI DEFINITIONS ==============================
const ERC20_ABI = [
  {
    constant: false,
    inputs: [
      { name: "_spender", type: "address" },
      { name: "_value", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    constant: true,
    inputs: [{ name: "_owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "balance", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    constant: true,
    inputs: [
      { name: "_owner", type: "address" },
      { name: "_spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ name: "remaining", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
];

const CONTRACT_ABI = [
  {
    inputs: [
      {
        components: [
          { internalType: "address", name: "tokenIn", type: "address" },
          { internalType: "address", name: "tokenOut", type: "address" },
          { internalType: "uint24", name: "fee", type: "uint24" },
          { internalType: "address", name: "recipient", type: "address" },
          { internalType: "uint256", name: "deadline", type: "uint256" },
          { internalType: "uint256", name: "amountIn", type: "uint256" },
          { internalType: "uint256", name: "amountOutMinimum", type: "uint256" },
          { internalType: "uint160", name: "sqrtPriceLimitX96", type: "uint160" },
        ],
        internalType: "struct ISwapRouter.ExactInputSingleParams",
        name: "params",
        type: "tuple",
      },
    ],
    name: "exactInputSingle",
    outputs: [{ internalType: "uint256", name: "amountOut", type: "uint256" }],
    stateMutability: "payable",
    type: "function",
  },
];

// ========================== SWAP FUNCTIONS ==============================
async function swapAuto(direction, amountIn) {
  const swapContract = new ethers.Contract(ROUTER_ADDRESS, CONTRACT_ABI, wallet);
  const deadline = Math.floor(Date.now() / 1000) + 120;
  const directions = {
    usdtToEth: { tokenIn: USDT_ADDRESS, tokenOut: ETH_ADDRESS },
    ethToUsdt: { tokenIn: ETH_ADDRESS, tokenOut: USDT_ADDRESS },
    usdtToBtc: { tokenIn: USDT_ADDRESS, tokenOut: BTC_ADDRESS },
    btcToUsdt: { tokenIn: BTC_ADDRESS, tokenOut: USDT_ADDRESS },
    btcToEth: { tokenIn: BTC_ADDRESS, tokenOut: ETH_ADDRESS },
    ethToBtc: { tokenIn: ETH_ADDRESS, tokenOut: BTC_ADDRESS },
  };
  if (!directions[direction]) throw new Error("Direction swap tidak dikenal.");
  const params = {
    tokenIn: directions[direction].tokenIn,
    tokenOut: directions[direction].tokenOut,
    fee: 3000,
    recipient: wallet.address,
    deadline: deadline,
    amountIn: amountIn,
    amountOutMinimum: 0,
    sqrtPriceLimitX96: 0n,
  };
  const gasPriceToUse = selectedGasPrice || (await provider.getFeeData()).gasPrice;
  const tx = await swapContract.exactInputSingle(params, {
    gasLimit: SWAP_GAS_LIMIT,
    gasPrice: gasPriceToUse,
  });
  await tx.wait();
}

// ---------------- Auto Swap USDT & ETH ----------------
async function autoSwapUsdtEth(totalSwaps) {
  try {
    for (let i = 1; i <= totalSwaps; i++) {
      if (!transactionRunning) return;
      if (i % 2 === 1) {
        await addTransactionToQueue(async (nonce) => {
          // Mengubah nilai swap USDT menjadi antara 20 - 90
          const randomUsdt = (Math.random() * 70 + 20).toFixed(2);
          const usdtAmount = ethers.parseUnits(randomUsdt, 18);
          const usdtContract = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, provider);
          const currentUsdtBalance = await usdtContract.balanceOf(wallet.address);
          if (currentUsdtBalance < usdtAmount)
            throw new Error("Saldo USDT tidak cukup untuk swap USDT→ETH");
          await approveToken(USDT_ADDRESS, usdtAmount);
          await swapAuto("usdtToEth", usdtAmount);
        }, `USDT→ETH Swap ${i}`);
      } else {
        await addTransactionToQueue(async (nonce) => {
          // Mengubah nilai swap ETH menjadi antara 0.04 - 0.08
          const randomEth = (Math.random() * 0.04 + 0.04).toFixed(6);
          const ethAmount = ethers.parseUnits(randomEth, 18);
          const ethContract = new ethers.Contract(ETH_ADDRESS, ERC20_ABI, provider);
          const currentEthBalance = await ethContract.balanceOf(wallet.address);
          if (currentEthBalance < ethAmount)
            throw new Error("Saldo ETH tidak cukup untuk swap ETH→USDT");
          await approveToken(ETH_ADDRESS, ethAmount);
          await swapAuto("ethToUsdt", ethAmount);
        }, `ETH→USDT Swap ${i}`);
      }
      if (i < totalSwaps) {
        const delaySeconds = Math.floor(Math.random() * 31) + 30;
        await delay(delaySeconds * 1000);
        if (!transactionRunning) break;
      }
    }
    console.log("Auto Swap USDT & ETH selesai.");
  } catch (error) {
    console.log("Error:", error.message);
  } finally {
    stopTransaction();
  }
}


// ---------------- Auto Swap USDT & BTC ----------------
async function autoSwapUsdtBtc(totalSwaps) {
  try {
    for (let i = 1; i <= totalSwaps; i++) {
      if (!transactionRunning) return;
      if (i % 2 === 1) {
        await addTransactionToQueue(async (nonce) => {
          const randomUsdt = (Math.random() * 70 + 20).toFixed(2);
          const usdtAmount = ethers.parseUnits(randomUsdt, 18);
          const usdtContract = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, provider);
          const currentUsdtBalance = await usdtContract.balanceOf(wallet.address);
          if (currentUsdtBalance < usdtAmount)
            throw new Error("Saldo USDT tidak cukup untuk swap USDT→BTC");
          await approveToken(USDT_ADDRESS, usdtAmount);
          await swapAuto("usdtToBtc", usdtAmount);
        }, `USDT→BTC Swap ${i}`);
      } else {
        await addTransactionToQueue(async (nonce) => {
          const randomBtc = (Math.random() * 0.0004 + 0.00003).toFixed(6);
          const btcAmount = ethers.parseUnits(randomBtc, 18);
          const btcContract = new ethers.Contract(BTC_ADDRESS, ERC20_ABI, provider);
          const currentBtcBalance = await btcContract.balanceOf(wallet.address);
          if (currentBtcBalance < btcAmount)
            throw new Error("Saldo BTC tidak cukup untuk swap BTC→USDT");
          await approveToken(BTC_ADDRESS, btcAmount);
          await swapAuto("btcToUsdt", btcAmount);
        }, `BTC→USDT Swap ${i}`);
      }
      if (i < totalSwaps) {
        const delaySeconds = Math.floor(Math.random() * 31) + 30;
        await delay(delaySeconds * 1000);
        if (!transactionRunning) break;
      }
    }
    console.log("Auto Swap USDT & BTC selesai.");
  } catch (error) {
    console.log("Error:", error.message);
  } finally {
    stopTransaction();
  }
}

// ---------------- Auto Swap BTC & ETH ----------------
async function autoSwapBtcEth(totalSwaps) {
  try {
    for (let i = 1; i <= totalSwaps; i++) {
      if (!transactionRunning) return;
      if (i % 2 === 1) {
        await addTransactionToQueue(async (nonce) => {
          const randomBtc = (Math.random() * 0.04 + 0.01).toFixed(6);
          const btcAmount = ethers.parseUnits(randomBtc, 18);
          const btcContract = new ethers.Contract(BTC_ADDRESS, ERC20_ABI, provider);
          const currentBtcBalance = await btcContract.balanceOf(wallet.address);
          if (currentBtcBalance < btcAmount)
            throw new Error("Saldo BTC tidak cukup untuk swap BTC→ETH");
          await approveToken(BTC_ADDRESS, btcAmount);
          await swapAuto("btcToEth", btcAmount);
        }, `BTC→ETH Swap ${i}`);
      } else {
        await addTransactionToQueue(async (nonce) => {
          const randomEth = (Math.random() * 0.2 + 0.1).toFixed(6);
          const ethAmount = ethers.parseUnits(randomEth, 18);
          const ethContract = new ethers.Contract(ETH_ADDRESS, ERC20_ABI, provider);
          const currentEthBalance = await ethContract.balanceOf(wallet.address);
          if (currentEthBalance < ethAmount)
            throw new Error("Saldo ETH tidak cukup untuk swap ETH→BTC");
          await approveToken(ETH_ADDRESS, ethAmount);
          await swapAuto("ethToBtc", ethAmount);
        }, `ETH→BTC Swap ${i}`);
      }
      if (i < totalSwaps) {
        const delaySeconds = Math.floor(Math.random() * 31) + 30;
        await delay(delaySeconds * 1000);
        if (!transactionRunning) break;
      }
    }
    console.log("Auto Swap BTC & ETH selesai.");
  } catch (error) {
    console.log("Error:", error.message);
  } finally {
    stopTransaction();
  }
}

async function approveToken(tokenAddress, amount) {
  const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
  const currentAllowance = await tokenContract.allowance(wallet.address, ROUTER_ADDRESS);
  if (currentAllowance >= amount) return;
  const feeData = await provider.getFeeData();
  const tx = await tokenContract.approve(ROUTER_ADDRESS, amount, {
    gasLimit: APPROVAL_GAS_LIMIT,
    gasPrice: feeData.gasPrice,
  });
  await tx.wait();
}

// ========================== TRANSACTION QUEUE ==============================
// Setiap transaksi di dalam antrean hanya menampilkan satu ringkasan (summary) melalui clear screen.
function addTransactionToQueue(transactionFunction, description = "Transaksi") {
  const transactionId = ++transactionIdCounter;
  transactionQueueList.push({
    id: transactionId,
    description,
    timestamp: new Date().toLocaleTimeString(),
    status: "queued",
  });
  transactionQueue = transactionQueue.then(async () => {
    console.clear();
    console.log(`Transaksi [${transactionId}] - ${description}: Processing...`);
    try {
      if (nextNonce === null) {
        nextNonce = await provider.getTransactionCount(wallet.address, "pending");
      }
      await transactionFunction(nextNonce);
      nextNonce++;
      console.clear();
      console.log(`Transaksi [${transactionId}] - ${description}: Completed.`);
    } catch (error) {
      if (error.message && error.message.toLowerCase().includes("nonce")) {
        nextNonce = await provider.getTransactionCount(wallet.address, "pending");
      }
      console.clear();
      console.log(`Transaksi [${transactionId}] - ${description}: Error - ${error.message}`);
    } finally {
      removeTransactionFromQueue(transactionId);
    }
  });
  return transactionQueue;
}

function removeTransactionFromQueue(id) {
  transactionQueueList = transactionQueueList.filter((tx) => tx.id !== id);
}

function stopTransaction() {
  transactionRunning = false;
  chosenSwap = null;
}

// ========================== MENU & CLI ==============================
function showMainMenu() {
  console.clear();
  console.log("=== MENU ===");
  console.log("1. Auto Swap USDT & ETH");
  console.log("2. Auto Swap USDT & BTC");
  console.log("3. Auto Swap BTC & ETH");
  console.log("4. Refresh Wallet Data");
  console.log("5. Exit");

  rl.question("Pilih opsi (1-5): ", (choice) => {
    switch (choice.trim()) {
      case "1":
        rl.question("Jumlah swap USDT & ETH: ", (value) => {
          const totalSwaps = parseInt(value);
          if (isNaN(totalSwaps) || totalSwaps <= 0) {
            console.log("Jumlah swap tidak valid.");
            showMainMenu();
          } else {
            transactionRunning = true;
            chosenSwap = "USDT & ETH";
            console.log(`Memulai Auto Swap USDT & ETH sebanyak ${totalSwaps} kali...`);
            autoSwapUsdtEth(totalSwaps).then(showMainMenu);
          }
        });
        break;
      case "2":
        rl.question("Jumlah swap USDT & BTC: ", (value) => {
          const totalSwaps = parseInt(value);
          if (isNaN(totalSwaps) || totalSwaps <= 0) {
            console.log("Jumlah swap tidak valid.");
            showMainMenu();
          } else {
            transactionRunning = true;
            chosenSwap = "USDT & BTC";
            console.log(`Memulai Auto Swap USDT & BTC sebanyak ${totalSwaps} kali...`);
            autoSwapUsdtBtc(totalSwaps).then(showMainMenu);
          }
        });
        break;
      case "3":
        rl.question("Jumlah swap BTC & ETH: ", (value) => {
          const totalSwaps = parseInt(value);
          if (isNaN(totalSwaps) || totalSwaps <= 0) {
            console.log("Jumlah swap tidak valid.");
            showMainMenu();
          } else {
            transactionRunning = true;
            chosenSwap = "BTC & ETH";
            console.log(`Memulai Auto Swap BTC & ETH sebanyak ${totalSwaps} kali...`);
            autoSwapBtcEth(totalSwaps).then(showMainMenu);
          }
        });
        break;
      case "4":
        updateWalletData(provider, wallet).then(showMainMenu);
        break;
      case "5":
        rl.close();
        process.exit(0);
        break;
      default:
        console.log("Pilihan tidak valid.");
        showMainMenu();
        break;
    }
  });
}

// ========================== GAS FEE SELECTION ==============================
function chooseGasFee() {
  return new Promise((resolve, reject) => {
    console.clear();
    console.log("Pilih Gas Fee:");
    console.log("1. Normal");
    console.log("2. Rendah");
    console.log("3. x2 Fee");
    rl.question("Masukkan pilihan (1-3): ", async (answer) => {
      try {
        const feeData = await provider.getFeeData();
        const gasPriceBN = feeData.gasPrice;
        if (answer.trim() === "1") resolve(gasPriceBN);
        else if (answer.trim() === "2") resolve((gasPriceBN * 80n) / 100n);
        else if (answer.trim() === "3") resolve(gasPriceBN * 2n);
        else {
          console.log("Pilihan tidak valid. Menggunakan Normal.");
          resolve(gasPriceBN);
        }
      } catch (err) {
        reject(err);
      }
    });
  });
}

function startTransactionProcess(pair, totalSwaps) {
  chooseGasFee()
    .then((gasPrice) => {
      selectedGasPrice = gasPrice;
      console.clear();
      console.log(`Gas fee yang dipilih: ${ethers.formatUnits(selectedGasPrice, "gwei")} Gwei`);
      transactionRunning = true;
      chosenSwap = pair;
      console.log(`Memulai ${pair} sebanyak ${totalSwaps} kali...`);
      if (pair === "USDT & ETH") {
        autoSwapUsdtEth(totalSwaps);
      } else if (pair === "USDT & BTC") {
        autoSwapUsdtBtc(totalSwaps);
      } else if (pair === "BTC & ETH") {
        autoSwapBtcEth(totalSwaps);
      } else {
        console.log(`Swap untuk pasangan ${pair} belum diimplementasikan.`);
        stopTransaction();
      }
    })
    .catch((err) => {
      console.log("Pemilihan gas fee dibatalkan:", err);
    });
}

// ========================== WALLET DATA UPDATE ==============================
async function updateWalletData(provider, wallet) {
  try {
    const walletAddress = wallet.address;
    const balanceNative = await provider.getBalance(walletAddress);
    const saldoAOGI = parseFloat(ethers.formatEther(balanceNative)).toFixed(4);

    const usdtContract = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, provider);
    const balanceUSDT = await usdtContract.balanceOf(walletAddress);
    const saldoUSDT = parseFloat(ethers.formatEther(balanceUSDT)).toFixed(4);

    const ethContract = new ethers.Contract(ETH_ADDRESS, ERC20_ABI, provider);
    const balanceETH = await ethContract.balanceOf(walletAddress);
    const saldoETH = parseFloat(ethers.formatEther(balanceETH)).toFixed(4);

    const btcContract = new ethers.Contract(BTC_ADDRESS, ERC20_ABI, provider);
    const balanceBTC = await btcContract.balanceOf(walletAddress);
    const saldoBTC = parseFloat(ethers.formatUnits(balanceBTC, 18)).toFixed(4);

    console.clear();
    console.log("=== Informasi Wallet ===");
    console.log(`Address : ${walletAddress}`);
    console.log(`AOGI    : ${saldoAOGI}`);
    console.log(`USDT    : ${saldoUSDT}`);
    console.log(`ETH     : ${saldoETH}`);
    console.log(`BTC     : ${saldoBTC}`);
    console.log(`Network : ${NETWORK_NAME}`);
  } catch (error) {
    console.log("Gagal mengambil data wallet:", error.message);
  }
}

// ========================== MAIN EXECUTION ==============================
(async () => {
  try {
    await initializeWallet();
    console.log("Wallet berhasil diinisialisasi. Address:", wallet.address);
    showMainMenu();
  } catch (error) {
    console.log("Gagal inisialisasi wallet:", error.message);
    process.exit(1);
  }
})();
