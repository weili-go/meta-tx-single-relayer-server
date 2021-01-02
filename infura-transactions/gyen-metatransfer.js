const { ethers } = require('ethers');
const EthUtil = require("ethereumjs-util");
const axios = require('axios').default;
const Web3 = require('web3');
const headers = { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' };


const transferWithAuthorizationTypeHash = ethers.utils.keccak256(
  ethers.utils.toUtf8Bytes("TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)")
);

//0x7c7c6cdb67a18743f49ec6fa9b35f50d52ed05cbed4cc592e13b44501c1a2267
console.log("typehash => ",transferWithAuthorizationTypeHash);

//0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f
console.log("keccak256=>", ethers.utils.keccak256(
  ethers.utils.toUtf8Bytes("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")
))

/*
console.log("keccak256 no1 =>", ethers.utils.keccak256(
  "0x1233132340000000000000000000000000000000000000000000000000000000001")
)

console.log("keccak256 no2 =>", ethers.utils.keccak256(
  ethers.utils.toUtf8Bytes("0x1233132340000000000000000000000000000000000000000000000000000000001"))
)
*/

// Loading the contract ABI
// (the results of a previous compilation step)
const fs = require('fs');
const { abi } = JSON.parse(fs.readFileSync('./jsons/Token_v2.json'));

const wait = (milliseconds) => {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
};

//////

function signTransferAuthorization(
  from,
  to,
  value,
  validAfter,
  validBefore,
  nonceValue,
  domainSeparator,
  privateKey
) {
  console.log("signTransferAuthorization start");
  return signEIP712(
    domainSeparator,
    transferWithAuthorizationTypeHash,
    ["address", "address", "uint256", "uint256", "uint256", "bytes32"],
    [from, to, value, validAfter, validBefore, nonceValue],
    privateKey
  );
}

function signEIP712(domainSeparator, typeHash, types, parameters, privateKey) {
  console.log("signEIP712 start");
  console.log("GYEN sender private key => ",privateKey);
  const vv = ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      ["bytes32", ...types],
      [typeHash, ...parameters]
    )
  )
  console.log("domain signed value => \n",vv)

  //do not use ethers.utils.toUtf8Bytes here, there is error. no know why
  const digest = ethers.utils.keccak256(
      "0x1901" +
      strip0x(domainSeparator) +
      strip0x(vv)
  );

  console.log("digest:   \n", digest);

  return ecSign(digest, privateKey);
}

function ecSign(digest, privateKey) {
  console.log("ecSign start");
  try {
    var pv = bufferFromHexString(privateKey);
    console.log("private key => ", pv)
    const { v, r, s } = EthUtil.ecsign(
      bufferFromHexString(digest),
      pv
    );

    console.log("\n");
    console.log("v: ", v);
    console.log("r: ", hexStringFromBuffer(r));
    console.log("s: ", hexStringFromBuffer(s));

    return { v, r: hexStringFromBuffer(r), s: hexStringFromBuffer(s) };
  } catch (error) {
    console.log(error);
  }
}

function hexStringFromBuffer(buf) {
  return "0x" + buf.toString("hex");
}

function bufferFromHexString(hex) {
  return Buffer.from(strip0x(hex), "hex");
}

function makeDomainSeparator(name, version, chainId, address) {
  console.log("makeDomainSeparator start");
  var re = "";
  re =  ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      ["bytes32", "bytes32", "bytes32", "uint256", "address"],
      [
        ethers.utils.keccak256(
          ethers.utils.toUtf8Bytes("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")
        ),
        ethers.utils.keccak256(ethers.utils.toUtf8Bytes(name)),
        ethers.utils.keccak256(ethers.utils.toUtf8Bytes(version)),
        chainId,
        address,
      ]
    )
  );

  return re;
}

function strip0x(v) {
  var tmp = '';
  if(!!v){
    tmp = v.replace(/^0x/, "");
    console.log("value => ",tmp)
    return tmp
  }else{
    return '';
  }
}
//////

//main
async function main() {
  console.log("main start");

  // Make sure we're using the right network
  if (process.env.ETHEREUM_NETWORK !== 'rinkeby') {
    console.log('ITX currently only available on Rinkeby network');
    process.exit(1);
  }

  // Configure the connection to an Ethereum node
  const itx = new ethers.providers.InfuraProvider(
    process.env.ETHEREUM_NETWORK,
    process.env.INFURA_PROJECT_ID
  );

  // Create a signing account from a private key
  const signer = new ethers.Wallet(process.env.SIGNER_PRIVATE_KEY, itx);

  // get domainSeparator
  const domainSeparator = makeDomainSeparator(
    "GYEN rinkeby v2",
    "2",
    4,
    "0x410e8b240a83081d4ef30ecdf309949104f40648"
  );
  console.log("domainSeparator:   ", domainSeparator);

  const from = "0xc4960f4bb9843e7a512e6f38b9acef82b114fdaf";
  const to = "0x410e8b240a83081d4ef30ecdf309949104f40648";
  const value = "2200000";
  const validAfter = "1";
  let validBefore = Date.now() + 200000;
  //const validBefore = "1211111111111";
  //const nonceValue = Web3.utils.asciiToHex("0");
  const nonceValue = '0x0000000000000000000000000000000000000000000000000000000001010008';
  // get r,s,v
  const vrs = signTransferAuthorization(
    from,
    to,
    value,
    validAfter,
    validBefore,
    nonceValue,
    domainSeparator,
    process.env.META_SIGNER_PRIVATE_KEY
  );

  console.log("vrs => ",vrs)

  //await selfsend(from, to, value, validAfter, validBefore, nonceValue, vrs.v, vrs.r, vrs.s);

  // Create a contract interface
  const iface = new ethers.utils.Interface(abi);

  console.log("data start");
  const data = iface.encodeFunctionData('transferWithAuthorization', [from, to, value, validAfter, validBefore, nonceValue, vrs.v, vrs.r, vrs.s])
  console.log("data\n",data);

  // Create the transaction relay request
  const tx = {
    //from: '0xE6b48d76Bc4805ABF61F38A55F1D7C362c8BfdA8',
    // Address of the contract we want to call
    to: '0x410E8B240a83081D4EF30ECdf309949104f40648',
    // Encoded data payload representing the contract method call
    data: data,
    // An upper limit on the gas we're willing to spend
    gas: '100000'
    //gas: '10',
  };

  console.log("tx=>\n",tx);

  // Sign a relay request using the signer's private key
  // Final signature of the form keccak256("\x19Ethereum Signed Message:\n" + len((to + data + gas + chainId)) + (to + data + gas + chainId)))
  // Where (to + data + gas + chainId) represents the RLP encoded concatenation of these fields.
  // ITX will check the from address of this signature and deduct balance according to the gas used by the transaction
  const relayTransactiondataHash = ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      ['address', 'bytes', 'uint', 'uint'],
      [tx.to, tx.data, tx.gas, 4] // Rinkeby chainId is 4
    )
  );
  const signature = await signer.signMessage(ethers.utils.arrayify(relayTransactiondataHash));

  console.log('signature=>\n', signature);

  // Call the verifyString function
  let recovered = await ethers.utils.verifyMessage(ethers.utils.arrayify(relayTransactiondataHash), signature);
  console.log("from address = > ", recovered);

  // Relay the transaction through ITX
  const relayTransactionHash = await itx.send('relay_sendTransaction', [tx, signature]);
  console.log(`ITX relay transaction hash: ${relayTransactionHash}`);

  // Waiting for the corresponding Ethereum transaction to be mined
  // We poll the relay_getTransactionStatus method for status updates
  // ITX bumps the gas price of your transaction until it's mined,
  // causing a new transaction hash to be created each time it happens.
  // relay_getTransactionStatus returns a list of these transaction hashes
  // which can then be used to poll Infura for their transaction receipts
  console.log('Waiting to be mined...');
  while (true) {
    // fetch the latest ethereum transaction hashes
    const statusResponse = await itx.send('relay_getTransactionStatus', [relayTransactionHash]);

    // check each of these hashes to see if their receipt exists and
    // has confirmations
    for (let i = 0; i < statusResponse.length; i++) {
      const hashes = statusResponse[i];
      const receipt = await itx.getTransactionReceipt(hashes['ethTxHash']);
      if (receipt && receipt.confirmations && receipt.confirmations > 1) {
        // The transaction is now on chain!
        console.log(`Ethereum transaction hash: ${receipt.transactionHash}`);
        console.log(`Mined in block ${receipt.blockNumber}`);
        return;
      }
    }
    await wait(1000);
  }
}

require('dotenv').config();


async function selfsend(from, to, value, validAfter, validBefore, nonceValue, v, r, s) {
  // Configuring the connection to an Ethereum node
  const network = 'rinkeby';
  const provider = new ethers.providers.InfuraProvider(network, 'c3422181d0594697a38defe7706a1e5b');
  // Creating a signing account from a private key
  const signer = new ethers.Wallet(process.env.SIGNER_PRIVATE_KEY, provider);
  // Creating a Contract instance connected to the signer
  const contract = new ethers.Contract(
    // Replace this with the address of your deployed contract
    '0x410E8B240a83081D4EF30ECdf309949104f40648',
    abi,
    signer
  );

  let overrides = {

    // The maximum units of gas for the transaction to use
    gasLimit: 230000,

    // The price (in wei) per unit of gas
    gasPrice: ethers.utils.parseUnits('10', 'gwei'),

    // The nonce to use in the transaction
    //nonce: 149,

    // The amount to send with the transaction (i.e. msg.value)
    //value: utils.parseEther('1.0'),

    // The chain ID (or network ID) to use
    //chainId: 4

  };

  try{
    // estimateGas
    // callStatic
    const estimated = await contract.estimateGas.transferWithAuthorization(from, to, value, validAfter, validBefore, nonceValue, v, r, s,overrides);
    console.log("estimated gs=> ", estimated);
    console.log("estimated gs=> ", estimated.toString());
  } catch(e){
    console.log("error => \n",e);
    return;
  }
  
  // Issuing a transaction that calls the `echo` method
  const tx = await contract.transferWithAuthorization(from, to, value, validAfter, validBefore, nonceValue, v, r, s, overrides);
  console.log('selfsend Mining transaction...');
  console.log(`https://${network}.etherscan.io/tx/${tx.hash}`);
  // Waiting for the transaction to be mined
  const receipt = await tx.wait();
  // The transaction is now on chain!
  console.log(`selfsend Mined in block ${receipt.blockNumber}`);
}
//main
async function selfmain() {
  console.log("self main start");

  // Make sure we're using the right network
  if (process.env.ETHEREUM_NETWORK !== 'rinkeby') {
    console.log('ITX currently only available on Rinkeby network');
    process.exit(1);
  }

  // Configure the connection to an Ethereum node
  const itx = new ethers.providers.InfuraProvider(
    process.env.ETHEREUM_NETWORK,
    process.env.INFURA_PROJECT_ID
  );

  // Create a signing account from a private key
  const signer = new ethers.Wallet(process.env.SIGNER_PRIVATE_KEY, itx);

  // get domainSeparator
  const domainSeparator = makeDomainSeparator(
    "GYEN rinkeby v2",
    "2",
    4,
    "0x410e8b240a83081d4ef30ecdf309949104f40648"
  );
  console.log("domainSeparator:   ", domainSeparator);

  const from = "0xc4960f4bb9843e7a512e6f38b9acef82b114fdaf";
  const to = "0x410e8b240a83081d4ef30ecdf309949104f40648";
  const value = "1200000";
  const validAfter = "2";
  let validBefore = Date.now() + 200000;
  //const validBefore = "1211111111111";
  let nonceValue = Web3.utils.asciiToHex("321");
  nonceValue = bytes32FromValue(nonceValue);
  console.log("nonceValue => ", nonceValue);
  //const nonceValue = '0x1100000000000000000000000000000000000000000000000000000000000007';
  // get r,s,v
  const vrs = signTransferAuthorization(
    from,
    to,
    value,
    validAfter,
    validBefore,
    nonceValue,
    domainSeparator,
    process.env.META_SIGNER_PRIVATE_KEY
  );

  //console.log("vrs => ",vrs)
  var re = vrs;
  re.from = from;
  re.to = to;
  re.value = value;
  re.validAfter = validAfter;
  re.validBefore = validBefore;
  re.nonceValue = nonceValue;
  console.log("Input Info =>\n", re);

  console.log("\n\n");


  try{
    const result = await post("http://localhost:8001/postbySingleserver",re);
    //const result = await post("http://localhost:8001/postbyITX",re);
    console.log("result => \n",result);
  }catch(e){
    console.log("error=>\n", e)
  }



  
  //await selfsend(from, to, value, validAfter, validBefore, nonceValue, vrs.v, vrs.r, vrs.s);

}

async function test(){
  const x = await get("http://localhost:8001/getSinglesenderInfo");
  console.log("result =>\n", x);
}


async function get(url, params=undefined, config=undefined){
  const { data } = await axios.get(url, { params, headers, ...config });
  return data;
};

async function post(url, params, config=undefined){
  const { data } = await axios.post(url, params, { headers, ...config });
  return data;
};
function prepend0x(v) {
  return v.replace(/^(0x)?/, "0x");
}

function bytes32FromValue(value) {
  return prepend0x(strip0x(value).padEnd(64, "0"));
}

function strip0x(v) {
  return v.replace(/^0x/, "");
}

//main();
selfmain();
//test();


