import RLogin from "@rsksmart/rlogin";
import WalletConnectProvider from "@walletconnect/web3-provider"
import Portis from "@portis/web3"
import Torus from "@toruslabs/torus-embed"
import { trezorProviderOptions } from "@rsksmart/rlogin-trezor-provider"
import { ledgerProviderOptions } from "@rsksmart/rlogin-ledger-provider"
import { dcentProviderOptions } from "@rsksmart/rlogin-dcent-provider"

import Web3 from "web3";
import Config from "../../../resources/config.js";


const ENV =  process.env.NODE_ENV;
const RPC_URLS = Config.wallets.rpcUrls[ENV];
const SUPPORTED_CHAINS = Object.keys(RPC_URLS).map(Number);
const RLOGIN = new RLogin({
  cacheProvider: false,
  providerOptions: {
    walletconnect: {
      package: WalletConnectProvider,
      options: {
        bridge: 'https://walletconnect-bridge.rifos.org/',
        rpc: RPC_URLS
      }
    },
    portis: {
      package: Portis,
      options: Config.wallets.portisOptions[ENV]
    },
    torus: {
      package: Torus,
    },
    "custom-ledger": ledgerProviderOptions,
    "custom-dcent": dcentProviderOptions,
    "custom-trezor": {
      ...trezorProviderOptions,
      options: {
        manifestEmail: "info@iovlabs.org",
        manifestAppUrl: "https://basic-sample.rlogin.identity.rifos.org/",
      }
    }
  },
  rpcUrls: RPC_URLS,
  supportedChains: SUPPORTED_CHAINS
});

const CONTRACT_ADDRESS = Config.contractAddresses[ENV]
const NETWORK_NAME = Config.networkNames[ENV];

let instance = null;
let connectionListener = null;

export default {

  setConnectionListener(listener) {
    connectionListener = listener;
  },

  async getInstance() {
    if (instance) {
      return instance;
    }

    let resp = await RLOGIN.connect();
    let provider = resp.provider;
    let web3 = new Web3(provider);
    let walletAddress = (await web3.eth.getAccounts())[0];

    instance = {
      walletAddress: walletAddress,
      web3Instance: web3,
      networkName: NETWORK_NAME,
      contract: new web3.eth.Contract(Config.rskEscrowABI, CONTRACT_ADDRESS),
      provider: provider
    };

    provider.on('chainChanged', function (networkId) {
      // if (SUPPORTED_CHAINS.indexOf(Number(networkId)) < 0) {
      // }
      location.reload();
    });

    provider.on('disconnect', function () {
      location.reload();
    });

    if (connectionListener) {
      connectionListener({networkName: instance.networkName, walletAddress: instance.walletAddress});
    }

    provider.on('accountsChanged', function (accounts) {
      location.reload();
      // if (!accounts || accounts.length === 0) {
      //     location.reload();
      // } else {
      //   instance.walletAddress = accounts[0];

      //   if (connectionListener) {
      //     connectionListener({networkName: instance.networkName, walletAddress: instance.walletAddress});
      //   }
      // }
    });

    return instance;
  }
};