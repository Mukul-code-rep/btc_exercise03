import bip39 from "bip39";
import bitcoinjs from "bitcoinjs-lib";
import { BIP32Factory } from "bip32";
import { ECPairFactory } from "ecpair";
import * as ecc from "tiny-secp256k1";
import axios from "axios";
import { abs } from "mathjs";
import fs from 'fs'



const getTransactionsFromAddress = async (address) => {
  try {
    const response = await axios.get(
      `https://blockstream.info/testnet/api/address/${address}/txs`
    );
    return response.data;
  } catch (e) {
    console.log(e);
  }
};

const getUTXOFromAddress = async (address) => {
  try {
    const resp = await axios.get(
      `https://blockstream.info/testnet/api/address/${address}/utxo`
    );
    return resp.data;
  } catch (e) {
    console.log(e);
  }
};

const getFullTransactionHashFromTransactionId = async (transactionId) => {
  try {
    const resp = await axios.get(
      "https://blockstream.info/testnet/api//tx/" + transactionId + "/hex"
    );
    return resp.data;
  } catch (e) {
    console.log(e);
  }
};

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

const mostRecentUnusedAddress = async (rootKey) => {

  var count = 0,
    i = 0,
    a = 0;
  var unusedAddress = "",
    unusedChangeAddress = "";
  var dic_ = {};
  while (count < 20) {
    var path = `m/44'/1'/0'/0/${i}`;
    const keyPair = rootKey.derivePath(path);
    const address = bitcoinjs.payments.p2pkh({
      pubkey: keyPair.publicKey,
      network: bitcoinjs.networks.testnet,
    }).address;

    if (count == 0) {
      unusedAddress = address;
    }

    const txs = await getTransactionsFromAddress(address);
    
    var path_change = `m/44'/1'/0'/1/${i}`;
    const keyPairChange = rootKey.derivePath(path_change);
    const addressChange = bitcoinjs.payments.p2pkh({
      pubkey: keyPairChange.publicKey,
      network: bitcoinjs.networks.testnet,
    }).address;

    const txsChange = await getTransactionsFromAddress(addressChange);
    if (txs.length == 0 && txsChange.length == 0) {
      count += 1;
    } else {
      count = 0;
    }
    if (txs.length != 0) {
      dic_[address] = keyPair;
    }
    if (txsChange.length != 0) {
      dic_[addressChange] = keyPairChange;
    }
    if (txsChange.length == 0 && a == 0) {
      unusedChangeAddress = addressChange;
      a += 1;
    }

    i += 1;
  }


  fs.writeFile('Most Recenet Unused Address.txt', unusedAddress, err => {
      if (err) {
          console.error(err) ;
          return ;
      }
  })

  fs.writeFile('Most Recent Unused Change Address.txt', unusedChangeAddress, err => {
      if (err) {
          console.error(err) ;
          return ;
      }
  })

  return [unusedAddress, dic_, unusedChangeAddress];
};

const addressWithUTXO = async (dic_) => {
  var lst = [];
  for (var addr in dic_) {
    const utxo = await getUTXOFromAddress(addr);
    if (utxo.length == 0) {
      lst.push(addr);
    }
  }

  lst = lst.reverse();
  for (var item of lst) {
    delete dic_[item];
  }

  var str = "" ;
  for (var key in dic_) {
      str += key ;
      str += '\n' ;
  }

  fs.writeFile('Addresses with UTXOs.txt', str, err => {
      if (err) {
          console.error(err) ;
          return ;
      }
  })

  return dic_;
};

const send_tBTC = async (dic_, amt, unusedChangeAddress) => {
  const psbt = new bitcoinjs.Psbt({ network: bitcoinjs.networks.testnet });
  const ECPair = ECPairFactory(ecc);
  const validator = (pubkey, msghash, signature) =>
    ECPair.fromPublicKey(pubkey).verify(msghash, signature);
  var addrs = Object.keys(dic_);
  var keyPairs = Object.values(dic_);
  var i = 0,
    cpy = amt,
    a = [],
    c = 0;
  while (cpy > 0) {
    const utxos = await getUTXOFromAddress(addrs[i]);
    var b = 0 ;
    for (const utxo of utxos) {
      const transactionHash = await getFullTransactionHashFromTransactionId(
        utxo.txid
      );
      psbt.addInput({
        hash: utxo.txid,
        index: utxo.vout,
        nonWitnessUtxo: Buffer.from(transactionHash, "hex"),
      });
      cpy -= utxo.value;
      b += 1 ;
      c += 1 ;
    }
    a.push(b) ;
    i += 1;
  }

  psbt.addOutput({
    address: "mk4Y3aRXmG2UThf8UhbFzavgKkyckny2Ua",
    value: amt,
  });

  cpy = abs(cpy);

  psbt.addOutput({
    address: unusedChangeAddress,
    value: cpy / 2,
  });

  while (i > 0) {
      while (a[i-1] > 0) {
          psbt.signInput(c-1, ECPair.fromPrivateKey(keyPairs[i-1].privateKey)) ;
          a[i-1] -= 1 ;
          c -= 1 ;
      }
      i -= 1 ;
  }

  psbt.validateSignaturesOfAllInputs(validator);

  psbt.finalizeAllInputs();

  await broadcastToTestnet(psbt.extractTransaction().toHex());

  return 0;
};

const bip32 = BIP32Factory(ecc);

const mnemonic =
  "venture exact fish hawk awesome blur impose silent okay above gain woman curious panic dial reopen gun inquiry";

const seed = bip39.mnemonicToSeedSync(mnemonic);

const rootKey = bip32.fromSeed(seed);

var lst = await mostRecentUnusedAddress(rootKey);

var dicp = await addressWithUTXO(lst[1]);

const l = await send_tBTC(dicp, 14750, lst[2]);
console.log(l);
