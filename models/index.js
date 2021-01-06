const { ethers } = require('ethers');
const EthUtil = require("ethereumjs-util");
require('dotenv').config();
const fs = require('fs');
const { abi } = JSON.parse(fs.readFileSync('./jsons/Token_v2.json'));
const Mutex = require('async-mutex').Mutex;
const mutex = new Mutex();

const wait = (milliseconds) => {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
};

let nonceLatest = 0;

const models = {
    
    async postbySingleserver(req, res, next) {

        console.log("=== Recived Input ===\n", req.body);

        const {
            from, to, value, validAfter, validBefore, nonceValue, v, r, s 
        } = req.body;

        console.log(nonceValue);
        let nonceValueAfter = bytes32FromValue(nonceValue);
        console.log("Nonce =>", nonceValueAfter);

        // Configuring the connection to an Ethereum node
        const network = process.env.ETHEREUM_NETWORK;
        const provider = new ethers.providers.InfuraProvider(network, process.env.INFURA_PROJECT_ID);
        // Creating a signing account from a private key
        const signer = new ethers.Wallet(process.env.SIGNER_PRIVATE_KEY, provider);
        // Creating a Contract instance connected to the signer
        //console.log("GYEN => ",process.env.GYEN);

        const contract = new ethers.Contract(
          // Replace this with the address of your deployed contract
          process.env.GYEN,
          abi,
          signer
        );

        //get nonce
        let nonce = await signer.getTransactionCount();


        if(nonceLatest < nonce){
            nonceLatest = nonce; 
        }

        // mutex
        const release = await mutex.acquire();
        console.log("mutex start => ", nonceLatest);

        let overrides = {
      
          // The maximum units of gas for the transaction to use
          gasLimit: 230000,
      
          // The price (in wei) per unit of gas
          gasPrice: ethers.utils.parseUnits('10', 'gwei'),
      
          // The nonce to use in the transaction
          nonce: nonceLatest++,
      
          // The amount to send with the transaction (i.e. msg.value)
          //value: utils.parseEther('1.0'),
      
          // The chain ID (or network ID) to use
          //chainId: 4
      
        };
      
        try{
          // estimateGas
          // callStatic
          //console.log("estimateGas start ...");
          const estimated = await contract.estimateGas.transferWithAuthorization(from, to, value, validAfter, validBefore, nonceValueAfter, v, r, s,overrides);
          
          console.log("estimated gas=> ", estimated.toString());
        } catch(err){
          nonceLatest--;
            console.log("estimated error =>\n",err);
            res.status(200);

            res.body = { 'status': 200, 'success': false, 'result': err.reason }
            return next(null, req, res, next);
        } finally {

          console.log("mutex released");
          release();
       }
        
        // execute the transaction
        try{

            const tx = await contract.transferWithAuthorization(from, to, value, validAfter, validBefore, nonceValueAfter, v, r, s, overrides);
            console.log('Waiting Mining transaction...');
            console.log(`https://${network}.etherscan.io/tx/${tx.hash}`);
            // Waiting for the transaction to be mined
            const receipt = await tx.wait();
            // nonce countup
            //nonceLatest++;

            // The transaction is now on chain!
            //console.log(`Mined in block ${receipt.blockNumber}`);
            console.log("=== Transaction Receipt Info ===\n", receipt);

            var re = {
                minedBlock: receipt.blockNumber, 
                txHash: tx.hash
            }
            res.status(200);
            res.body = { 'status': 200, 'success': true, 'result': re }
            return next(null, req, res, next);
        }catch(err){
            console.log("send error =>\n",err);
            res.status(500);
            res.body = { 'status': 500, 'success': false, 'result': err.reason }
            return next(null, req, res, next);
        }
    },


    async postbyITX(req, res, next) {

        console.log("=== Recived Input ===\n", req.body);

        const {
            from, to, value, validAfter, validBefore, nonceValue, v, r, s 
        } = req.body;

        console.log(nonceValue);
        let nonceValueAfter = bytes32FromValue(nonceValue);
        console.log("Nonce =>", nonceValueAfter);
      
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
        const balanceb = await itx.send('relay_getBalance', [signer.address]);
        let bb = ethers.utils.parseUnits(balanceb, "wei");
        
        console.log(`Current ITX balance: ${balanceb}`);
      
        // Create a contract interface
        const iface = new ethers.utils.Interface(abi);
        const data = iface.encodeFunctionData('transferWithAuthorization', [from, to, value, validAfter, validBefore, nonceValueAfter, v, r, s]);
      
        // Create the transaction relay request
        const tx = {
          //from: '0xE6b48d76Bc4805ABF61F38A55F1D7C362c8BfdA8',
          // Address of the contract we want to call
          to: process.env.GYEN,
          // Encoded data payload representing the contract method call
          data: data,
          // An upper limit on the gas we're willing to spend
          gas: '100000'
          //gas: '10',
        };
      
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
      
        // Call the verifyString function
        let recovered = await ethers.utils.verifyMessage(ethers.utils.arrayify(relayTransactiondataHash), signature);
        console.log("Signed by address = > ", recovered);
      
        // Relay the transaction through ITX
        let relayTransactionHash;

        try{
            relayTransactionHash = await itx.send('relay_sendTransaction', [tx, signature]);
            console.log(`ITX relay transaction hash: ${relayTransactionHash}`);
        }catch(err){
            res.status(500);
            res.body = { 'status': 500, 'success': false, 'result': err }
            return next(null, req, res, next);
        }
 
      
        // Waiting for the corresponding Ethereum transaction to be mined
        // We poll the relay_getTransactionStatus method for status updates
        // ITX bumps the gas price of your transaction until it's mined,
        // causing a new transaction hash to be created each time it happens.
        // relay_getTransactionStatus returns a list of these transaction hashes
        // which can then be used to poll Infura for their transaction receipts
        console.log('Waiting to be mined...');
        let statusResponse;

        while (true) {
          // fetch the latest ethereum transaction hashes
          try{
            statusResponse = await itx.send('relay_getTransactionStatus', [relayTransactionHash]); 
          }catch(err){
            res.status(500);
            res.body = { 'status': 500, 'success': false, 'result': err }
            return next(null, req, res, next);
        }
          
      
          // check each of these hashes to see if their receipt exists and
          // has confirmations
          for (let i = 0; i < statusResponse.length; i++) {
            const hashes = statusResponse[i];
            const receipt = await itx.getTransactionReceipt(hashes['ethTxHash']);
            if (receipt && receipt.confirmations && receipt.confirmations > 1) {
              // The transaction is now on chain!
              //console.log(`Ethereum transaction hash: ${receipt.transactionHash}`);
              //console.log(`Mined in block ${receipt.blockNumber}`);
              console.log("=== Transaction Receipt Info ===\n", receipt);
             
              var re = {
                minedBlock: receipt.blockNumber, 
                txHash: receipt.transactionHash
              }

              const balancea = await itx.send('relay_getBalance', [signer.address]);
              console.log(`Current ITX balance: ${balancea}`);
              var ba = ethers.utils.parseUnits(balancea,"wei");
              
              re.gasfee = ethers.utils.formatEther((bb.sub(ba)).toString()) + ' ETH';

              res.status(200);
              res.body = { 'status': 200, 'success': true, 'result': re }
              return next(null, req, res, next);
            }
          }
          await wait(1000);
        }
    },

    async getSinglesenderInfo(req, res, next){
        // Configuring the connection to an Ethereum node
        const network = process.env.ETHEREUM_NETWORK;
        const provider = new ethers.providers.InfuraProvider(network, process.env.INFURA_PROJECT_ID);
        // Creating a signing account from a private key
        const signer = new ethers.Wallet(process.env.SIGNER_PRIVATE_KEY, provider);

        let re = {};
        re.senderAddress = signer.address;
        const balance = await signer.getBalance();
        re.senderBalance = ethers.utils.formatEther(balance.toString()) + 'ETH';
        const currentGasPrice = await signer.getGasPrice();
        re.currentGasPrice = currentGasPrice.toString()/1e9 + 'g';
        re.senderGasPrice = "10g";
        const senderNonce = await signer.getTransactionCount();
        re.senderNoncePending = nonceLatest;
        re.senderNonce = senderNonce;
        const block = await provider.getBlock();
        re.timestamp = block.timestamp;

        res.status(200);
        res.body = { 'status': 200, 'success': true, 'result': re }
        return next(null, req, res, next);
    },

    async getITXdepositerInfo(req, res, next){
        // Configuring the connection to an Ethereum node
        const network = process.env.ETHEREUM_NETWORK;
        const provider = new ethers.providers.InfuraProvider(network, process.env.INFURA_PROJECT_ID);
        // Creating a signing account from a private key
        const signer = new ethers.Wallet(process.env.SIGNER_PRIVATE_KEY, provider);


        let re = {};
        re.depositerAddress = signer.address;
        
        const balance = await provider.send('relay_getBalance', [signer.address]);
        console.log(`Current ITX balance: ${balance}`);

        re.depositerBalance = ethers.utils.formatEther(balance.toString()) + 'ETH';
        re.contractAddress = "0x015C7C7A7D65bbdb117C573007219107BD7486f9";
        re.relayer = 'I do not know, it is by ITX server wallet.';

        res.status(200);
        res.body = { 'status': 200, 'success': true, 'result': re }
        return next(null, req, res, next);
    },
}

function prepend0x(v) {
    return v.replace(/^(0x)?/, "0x");
}

function bytes32FromValue(value) {
    return prepend0x(strip0x(value).padEnd(64, "0"));
}

function strip0x(v) {
    return v.replace(/^0x/, "");
}

module.exports = models