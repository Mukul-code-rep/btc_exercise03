import bip39 from 'bip39'
import bitcoinjs from 'bitcoinjs-lib'
import { BIP32Factory } from 'bip32';
import { RegtestUtils } from 'regtest-client';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import axios from 'axios';

const APIPASS = process.env.APIPASS || 'satoshi';
const APIURL = process.env.APIURL || 'https://regtest.bitbank.cc/1';
const regtestUtils = new RegtestUtils({ APIPASS, APIURL });

const ECPair = ECPairFactory(ecc);
const bip32 = BIP32Factory(ecc);
const regtest = regtestUtils.network;


const mnemonic = bip39.generateMnemonic(256)
const path = "m/44'/1'/0'/0/0";

const validator = (pubkey, msghash, signature) => ECPair.fromPublicKey(pubkey).verify(msghash, signature)

//Generates random mnemonic
//console.log(mnemonic)
//Overiting for conistatncy
const mnemonicSaved = "venture exact fish hawk awesome blur impose silent okay above gain woman curious panic dial reopen gun inquiry"
//console.log(mnemonicSaved)//Prints Mnemon

const seed = bip39.mnemonicToSeedSync(mnemonicSaved)
//Taking a mnemonic phrase to a list of 64 numbers that stay consistantof the phrase you enter
//console.log(seed)

//Get the seed from mnemonic already made
//Use bip32 to derive children from taht key with the path

//Get the bip32 root from seed
const root = bip32.fromSeed(seed);
//Get the keyPair from the root
const keyPair = root.derivePath(path);
//console.log("KeyPair: ", keyPair)

const { address } = bitcoinjs.payments.p2pkh({
    pubkey: keyPair.publicKey,
    network: bitcoinjs.networks.testnet,
});

console.log("Address:", address)
//console.log("Private Key: ", Buffer.from(keyPair.privateKey).toString('hex'))
//console.log("Public Key: ", Buffer.from(keyPair.publicKey).toString('hex'));

const getTransactionsFromAddress = async (address) => {
    try {
        const resp = await axios.get('https://blockstream.info/testnet/api/address/' + address + "/txs");
        console.log(resp.data[0]);
        return resp.data;

    } catch (e) {
        console.log(e)
    }
}

const getFullTransactionHashFromTransactionId = async (transactionId) => {
    try {
        const resp = await axios.get('https://blockstream.info/testnet/api//tx/' + transactionId + '/hex');
        //console.log(resp.data[0]);
        return resp.data;

    } catch (e) {
        console.log(e)
    }
}

const getUTXOFromAddress = async (address) => {
    try {
        const resp = await axios.get('https://blockstream.info/testnet/api/address/' + address + '/utxo');
        //console.log(resp.data);
        return resp.data;

    } catch (e) {
        console.log(e)
    }
}

const broadcastToTestnet = async(transaction) => {
    try {
            await axios({
                method: 'post',
                url: 'https://blockstream.info/testnet/api/tx',
                data: transaction
            });

    } catch (e) {
        console.log(e)
    }
}

//const transactions = await getTransactionsFromAddress(address);
const utxos = await getUTXOFromAddress(address);
//console.log("utxo",utxo);
var transactionHashes = [] ;
var totalBalance = 0 ;
for (const utxo of utxos) {
    transactionHashes.push(await getFullTransactionHashFromTransactionId(utxo.txid)) ;
    totalBalance += utxo.value ;
}
//const transactionHash = await getFullTransactionHashFromTransactionId(utxo.txid)

//console.log(transactions)
const psbt = new bitcoinjs.Psbt({network: bitcoinjs.networks.testnet});
// psbt.setVersion(2); // These are defaults. This line is not needed.
// psbt.setLocktime(0); // These are defaults. This line is not needed.

//Create Transaction
var inputs = [] ;
for (const i in transactionHashes) {
    inputs.push({hash: utxos[i].txid, index: utxos[i].vout, nonWitnessUtxo: Buffer.from(transactionHashes[i], "hex")}) ;
}
//var inputs = [{hash: utxo.txid, index: utxo.vout, nonWitnessUtxo: Buffer.from(transactionHash,"hex")}]


//Transaction Input
psbt.addInputs(inputs);

const fee = 4000 ;

//Transaction Output
psbt.addOutput({
    address: "mzh9zGetc1UspvXy6vSkjwWnUHYm2AsU8F",
    value: 11000,
});


psbt.addOutput({
    address: address,
    value: totalBalance-11000-fee,
});

psbt.signAllInputs(ECPair.fromPrivateKey(keyPair.privateKey));

psbt.validateSignaturesOfAllInputs(validator);

psbt.finalizeAllInputs();

//console.log(psbt.extractTransaction().toHex());
await broadcastToTestnet(psbt.extractTransaction().toHex());