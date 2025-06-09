from web3 import Web3
import time
import random

# Daftar RPC yang akan digunakan untuk fallback
rpc_list = [
    "https://evmrpc-testnet.0g.ai",
    "https://0g-testnet-rpc.astrostake.xyz",
    "https://lightnode-json-rpc-0g.grandvalleys.com",
    "https://0g-galileo-evmrpc.corenodehq.xyz/",
    "https://0g.json-rpc.cryptomolot.com/",
    "https://0g-evm.maouam.nodelab.my.id/",
]

# Fungsi untuk mencoba koneksi dengan fallback RPC jika terjadi error
def get_web3_instance():
    for rpc in rpc_list:
        try:
            web3 = Web3(Web3.HTTPProvider(rpc))
            if web3.is_connected():
                print(f"Terhubung ke RPC: {rpc}")
                return web3
        except:
            print(f"Gagal terhubung ke RPC: {rpc}, mencoba RPC berikutnya...")
    raise Exception("Tidak ada RPC yang tersedia!")

# Inisialisasi koneksi ke blockchain
web3 = get_web3_instance()

# Meminta user memasukkan private key
private_keys = input("Masukkan private keys (pisahkan dengan ','): ").split(",")

# Meminta user memasukkan jumlah transaksi swap yang diinginkan
num_swaps = int(input("Masukkan jumlah transaksi swap yang diinginkan: "))

# Simpan urutan transaksi acak
swap_orders = list(range(num_swaps))
random.shuffle(swap_orders)

# Struktur transaksi swap dengan fallback RPC
def execute_swap(wallet_address):
    try:
        print(f"Menjalankan transaksi swap untuk wallet: {wallet_address}")
        for swap_index in swap_orders:
            print(f"Melakukan transaksi swap ke-{swap_index+1} untuk wallet {wallet_address}")
            # Simulasi transaksi swap
            time.sleep(random.randint(1, 5))  # Jeda antar transaksi swap
        print("Transaksi swap berhasil!")
    except:
        print("Error dalam transaksi, mencoba RPC lain...")
        global web3
        web3 = get_web3_instance()
        execute_swap(wallet_address)

# Eksekusi transaksi swap untuk setiap wallet
for i, key in enumerate(private_keys):
    print(f"Menjalankan transaksi untuk wallet {i+1}...")
    execute_swap(key)
    
    if i < len(private_keys) - 1:
        print("Jeda 2 menit sebelum lanjut ke wallet berikutnya...")
        time.sleep(120)  # Jeda 2 menit sebelum pindah wallet

print("Semua transaksi selesai!")
