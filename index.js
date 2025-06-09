import readline from "readline";
import { ethers } from "ethers";

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

let currentRpcIndex = 0;
let provider;

function setProvider() {
  provider = new ethers.JsonRpcProvider(RPC_LIST[currentRpcIndex]);
}

async function tryNextRpc() {
  currentRpcIndex = (currentRpcIndex + 1) % RPC_LIST.length;
  console.log(`Switching to RPC: ${RPC_LIST[currentRpcIndex]}`);
  setProvider();
}

function getRandomDelay() {
  return Math.floor(Math.random() * (180000 - 60000 + 1)) + 60000; // Jeda 1-3 menit
}

async function waitRandomDelay() {
  const delay = getRandomDelay();
  console.log(`Menunggu ${delay / 1000} detik sebelum swap berikutnya...`);
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

// Meminta user memasukkan beberapa PRIVATE_KEY
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question("Masukkan PRIVATE_KEY Anda (pisahkan dengan koma jika lebih dari satu): ", async (input) => {
  const PRIVATE_KEYS = input.split(",").map(key => key.trim());

  if (PRIVATE_KEYS.some(key => !/^0x[a-fA-F0-9]{64}$/.test(key))) {
    console.error("Satu atau lebih private key tidak valid!");
    process.exit(1);
  }

  setProvider();
  rl.close();

  async function executeSwapForWallet(wallet) {
    const totalSwaps = getRandomTransactionCount(); // Set jumlah transaksi acak
    console.log(`Mulai swap dengan wallet: ${wallet.address} (${totalSwaps} kali transaksi)`);

    let successfulSwaps = 0;

    while (successfulSwaps < totalSwaps) {
      const currentSwapIndex = Math.floor(Math.random() * SWAP_PAIRS.length);
      const [tokenIn, tokenOut] = SWAP_PAIRS[currentSwapIndex];
      const amount = getRandomAmount(tokenIn);

      await waitRandomDelay(); // Jeda sebelum swap

      const swapContract = new ethers.Contract(
        "0xb95B5953FF8ee5D5d9818CdbEfE363ff2191318c",
        [...], // Isi dengan ABI router swap
        wallet
      );

      try {
        const tx = await swapContract.exactInputSingle({
          tokenIn, tokenOut, fee: 3000, recipient: wallet.address,
          deadline: Math.floor(Date.now() / 1000) + 120,
          amountIn: amount, amountOutMinimum: 0, sqrtPriceLimitX96: 0
        }, { gasLimit: 150000, gasPrice: (await provider.getFeeData()).gasPrice });

        console.log(`Swap Tx (${successfulSwaps + 1}/${totalSwaps}) dari wallet ${wallet.address}: ${tokenIn} ➯ ${tokenOut}, Nominal: ${ethers.formatUnits(amount, 18)}, Tx: ${tx.hash}`);
        await tx.wait();
        successfulSwaps++; // Hanya menghitung transaksi sukses
      } catch (error) {
        console.error(`Swap gagal dari wallet ${wallet.address}: ${error.message}`);
        await tryNextRpc();
      }
    }
  }

  async function sequentialWalletSwap() {
    while (true) {
      for (const PRIVATE_KEY of PRIVATE_KEYS) {
        const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
        await executeSwapForWallet(wallet);
      }

      console.log("Semua wallet telah menyelesaikan transaksi masing-masing. Menunggu 2 menit sebelum mengulang...");
      await new Promise(resolve => setTimeout(resolve, 120000)); // Jeda 2 menit sebelum looping ulang
    }
  }

  sequentialWalletSwap();
});
