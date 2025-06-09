import readline from "readline";
import { ethers } from "ethers";
import fs from "fs";

// ANSI escape codes untuk warna terminal
const COLORS = {
  RESET: "\x1b[0m",
  RED: "\x1b[31m",
  GREEN: "\x1b[32m",
  CYAN: "\x1b[36m",
  YELLOW: "\x1b[33m"
};

// Baca ABI dari file "datanya.json"
const abiData = JSON.parse(fs.readFileSync("datanya.json", "utf8"));
const CONTRACT_ABI = abiData.ABI;

const RPC_LIST = [
  "https://evmrpc-testnet.0g.ai",
  "https://0g-testnet-rpc.astrostake.xyz",
  "https://lightnode-json-rpc-0g.grandvalleys.com",
  "https://0g-galileo-evmrpc.corenodehq.xyz/",
  "https://0g.json-rpc.cryptomolot.com/",
  "https://0g-evm.maouam.nodelab.my.id/",
  "https://0g-evmrpc-galileo.coinsspor.com/",
  "https://0g-evmrpc-galileo.komado.xyz/"
];

const SWAP_PAIRS = [
  ["USDT", "ETH"], ["ETH", "USDT"],
  ["USDT", "BTC"], ["BTC", "USDT"],
  ["BTC", "ETH"], ["ETH", "BTC"]
];

const TOKEN_ADDRESSES = {
  USDT: "0x3eC8A8705bE1D5ca90066b37ba62c4183B024ebf",
  ETH: "0x0fE9B43625fA7EdD663aDcEC0728DD635e4AbF7c",
  BTC: "0x36f6414FF1df609214dDAbA71c84f18bcf00F67d"
};

const APPROVAL_GAS_LIMIT = 100000;
const SWAP_GAS_LIMIT = 150000;
const ESTIMATED_GAS_USAGE = 150000;

let currentRpcIndex = 0;
let provider;

function setProvider() {
  provider = new ethers.JsonRpcProvider(RPC_LIST[currentRpcIndex]);
}

async function tryNextRpc() {
  currentRpcIndex = (currentRpcIndex + 1) % RPC_LIST.length;
  console.log(`${COLORS.YELLOW}Switching to RPC: ${RPC_LIST[currentRpcIndex]}${COLORS.RESET}`);
  setProvider();
}

function getRandomDelay() {
  return Math.floor(Math.random() * (180000 - 60000 + 1)) + 60000; // Jeda 1-3 menit
}

async function waitRandomDelay() {
  const delay = getRandomDelay();
  console.log(`${COLORS.CYAN}Menunggu ${delay / 1000} detik sebelum swap berikutnya...${COLORS.RESET}`);
  await new Promise(resolve => setTimeout(resolve, delay));
}

// Menghasilkan jumlah swap acak antara 20 hingga 40 untuk setiap wallet
function getRandomTransactionCount() {
  return Math.floor(Math.random() * (40 - 20 + 1)) + 20;
}

// Menghasilkan nominal swap acak sesuai batasan yang telah ditentukan
function getRandomAmount(token) {
  const ranges = {
    USDT: [30, 60],
    ETH: [0.004, 0.008],
    BTC: [0.0004, 0.0009]
  };

  const [min, max] = ranges[token];
  return ethers.parseUnits((Math.random() * (max - min) + min).toFixed(6), 18);
}

// Mendapatkan harga gas terbaru dari jaringan
async function getGasPrice() {
  const feeData = await provider.getFeeData();
  return feeData.gasPrice;
}

// Meminta user memasukkan beberapa PRIVATE_KEY
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question("Masukkan PRIVATE_KEY Anda (pisahkan dengan koma jika lebih dari satu): ", async (input) => {
  const PRIVATE_KEYS = input.split(",").map(key => key.trim());

  if (PRIVATE_KEYS.some(key => !/^0x[a-fA-F0-9]{64}$/.test(key))) {
    console.error(`${COLORS.RED}Satu atau lebih private key tidak valid!${COLORS.RESET}`);
    process.exit(1);
  }

  setProvider();
  rl.close();

  async function approveToken(tokenAddress, tokenAbi, amount) {
    try {
      const tokenContract = new ethers.Contract(tokenAddress, tokenAbi, wallet);
      const currentAllowance = await tokenContract.allowance(wallet.address, ROUTER_ADDRESS);
      
      if (currentAllowance >= amount) {
        console.log(`${COLORS.GREEN}Persetujuan tidak diperlukan, sudah cukup.${COLORS.RESET}`);
        return;
      }

      const tx = await tokenContract.approve(ROUTER_ADDRESS, amount, {
        gasLimit: APPROVAL_GAS_LIMIT,
        gasPrice: await getGasPrice()
      });

      console.log(`${COLORS.GREEN}Approval Tx: ${tx.hash}${COLORS.RESET}`);
      await tx.wait();
    } catch (error) {
      console.error(`${COLORS.RED}Persetujuan gagal: ${error.message}${COLORS.RESET}`);
    }
  }

  async function executeSwap(wallet, tokenIn, tokenOut, amount) {
    await waitRandomDelay(); // Jeda sebelum swap
    const swapContract = new ethers.Contract("0xb95B5953FF8ee5D5d9818CdbEfE363ff2191318c", CONTRACT_ABI, wallet);
    
    try {
      const tx = await swapContract.exactInputSingle({
        tokenIn, tokenOut, fee: 3000, recipient: wallet.address,
        deadline: Math.floor(Date.now() / 1000) + 120,
        amountIn: amount, amountOutMinimum: 0, sqrtPriceLimitX96: 0
      }, {
        gasLimit: SWAP_GAS_LIMIT,
        gasPrice: await getGasPrice()
      });

      console.log(`${COLORS.GREEN}Swap Tx dari ${wallet.address}: ${tokenIn} ➯ ${tokenOut}, Nominal: ${ethers.formatUnits(amount, 18)}, Tx: ${tx.hash}${COLORS.RESET}`);
      await tx.wait();
    } catch (error) {
      console.error(`${COLORS.RED}Swap gagal dari wallet ${wallet.address}: ${error.message}${COLORS.RESET}`);
      await tryNextRpc();
    }
  }

  async function sequentialWalletSwap() {
    while (true) {
      for (const PRIVATE_KEY of PRIVATE_KEYS) {
        const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
        const totalSwaps = getRandomTransactionCount();
        console.log(`${COLORS.CYAN}Mulai swap dengan wallet: ${wallet.address} (${totalSwaps} kali transaksi)${COLORS.RESET}`);

        let successfulSwaps = 0;
        while (successfulSwaps < totalSwaps) {
          const currentSwapIndex = Math.floor(Math.random() * SWAP_PAIRS.length);
          const [tokenIn, tokenOut] = SWAP_PAIRS[currentSwapIndex];
          const amount = getRandomAmount(tokenIn);

          await executeSwap(wallet, TOKEN_ADDRESSES[tokenIn], TOKEN_ADDRESSES[tokenOut], amount);
          successfulSwaps++;
        }
      }

      console.log(`${COLORS.YELLOW}Semua wallet telah menyelesaikan transaksi masing-masing. Menunggu 2 menit sebelum mengulang...${COLORS.RESET}`);
      await new Promise(resolve => setTimeout(resolve, 120000)); // Jeda 2 menit sebelum looping ulang
    }
  }

  sequentialWalletSwap();
});
