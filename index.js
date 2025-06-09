import Web3 from "web3";
import readline from "readline";
import chalk from "chalk"; // Modul untuk pewarnaan output

// Daftar RPC untuk fallback otomatis
const rpcList = [
    "https://evmrpc-testnet.0g.ai",
    "https://0g-testnet-rpc.astrostake.xyz",
    "https://lightnode-json-rpc-0g.grandvalleys.com",
    "https://0g-galileo-evmrpc.corenodehq.xyz/",
    "https://0g.json-rpc.cryptomolot.com/",
    "https://0g-evm.maouam.nodelab.my.id/",
];

// Fungsi untuk mendapatkan koneksi Web3 dengan fallback RPC
async function getWeb3Instance() {
    for (const rpc of rpcList) {
        try {
            const web3 = new Web3(new Web3.providers.HttpProvider(rpc));
            if (await web3.eth.net.isListening()) {
                console.log(chalk.green(`✅ Terhubung ke RPC: ${rpc}`));
                return web3;
            }
        } catch (error) {
            console.log(chalk.red(`❌ Gagal terhubung ke RPC: ${rpc}, mencoba RPC berikutnya...`));
        }
    }
    throw new Error(chalk.red("❌ Tidak ada RPC yang tersedia!"));
}

// Interface input untuk mendapatkan data dari pengguna
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

async function getUserInput(query) {
    return new Promise((resolve) => {
        rl.question(query, (answer) => {
            resolve(answer);
        });
    });
}

// Meminta user memasukkan private key
async function getWallets() {
    const privateKeys = await getUserInput(chalk.blue("🔑 Masukkan private keys (pisahkan dengan ','): "));
    return privateKeys.split(",").map((key) => key.trim());
}

// Meminta user memasukkan jumlah transaksi swap yang diinginkan
async function getSwapCount() {
    const swapCount = await getUserInput(chalk.blue("🔄 Masukkan jumlah transaksi swap yang diinginkan: "));
    return parseInt(swapCount, 10);
}

// Mengacak urutan transaksi swap
function getRandomSwapOrder(numSwaps) {
    const swapOrders = Array.from({ length: numSwaps }, (_, i) => i + 1);
    return swapOrders.sort(() => Math.random() - 0.5);
}

// Fungsi delay acak antara 1 hingga 3 menit
async function randomDelay() {
    const delayTime = Math.floor(Math.random() * (180000 - 60000) + 60000); // Antara 1 hingga 3 menit
    console.log(chalk.yellow(`⏳ Menunggu ${(delayTime / 60000).toFixed(1)} menit sebelum transaksi berikutnya...`));
    await new Promise((resolve) => setTimeout(resolve, delayTime));
}

// Fungsi untuk melakukan transaksi swap dengan fallback RPC
async function executeSwap(web3, wallet, swapOrders) {
    try {
        console.log(chalk.blue(`🔄 Menjalankan transaksi swap untuk wallet: ${wallet}`));
        for (const swapIndex of swapOrders) {
            console.log(chalk.green(`✅ Melakukan transaksi swap ke-${swapIndex} untuk wallet ${wallet}`));
            await randomDelay(); // Delay acak 1-3 menit antar transaksi
        }
        console.log(chalk.green(`🎉 Transaksi swap selesai untuk wallet: ${wallet}`));
    } catch (error) {
        console.log(chalk.red("❌ Terjadi kesalahan dalam transaksi, mencoba RPC lain..."));
        web3 = await getWeb3Instance();
        await executeSwap(web3, wallet, swapOrders);
    }
}

// Main function
async function main() {
    const web3 = await getWeb3Instance();
    const wallets = await getWallets();
    const swapCount = await getSwapCount();
    const swapOrders = getRandomSwapOrder(swapCount);

    for (let i = 0; i < wallets.length; i++) {
        await executeSwap(web3, wallets[i], swapOrders);
        if (i < wallets.length - 1) {
            console.log(chalk.yellow("⏳ Jeda 2 menit sebelum melanjutkan ke wallet berikutnya..."));
            await new Promise((resolve) => setTimeout(resolve, 120000)); // Jeda 2 menit sebelum pindah wallet
        }
    }

    console.log(chalk.green("🎉 Semua transaksi selesai!"));
    rl.close();
}

main();
