import RLogin from "@rsksmart/rlogin";
import WalletConnectProvider from "@walletconnect/web3-provider"
import Portis from "@portis/web3"
import Torus from "@toruslabs/torus-embed"
import { trezorProviderOptions } from "@rsksmart/rlogin-trezor-provider"
import { ledgerProviderOptions } from "@rsksmart/rlogin-ledger-provider"
import { dcentProviderOptions } from "@rsksmart/rlogin-dcent-provider"

import Web3 from "web3";
import Config from "../../../resources/config.js";

const RPC_URLS = Config.wallets.rpcUrls[process.env.NODE_ENV];
const SUPPORTED_CHAINS = Object.keys(RPC_URLS).map(Number);
const RLOGIN = new RLogin({
  providerOptions: {
    walletconnect: {
      package: WalletConnectProvider,
      options: {
        rpc: RPC_URLS
      }
    },
    portis: {
      package: Portis,
      options: Config.wallets.portisOptions[process.env.NODE_ENV]
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
  RPC_URLS,
  SUPPORTED_CHAINS
});

const CONTRACT_ADDRESS = Config.contractAddresses[process.env.NODE_ENV]

let instance = null;

export default {

  async getInstance() {
    if (instance) {
      return instance;
    }

    let resp = await RLOGIN.connect();
    let web3 = new Web3(resp.provider);
    let walletAddress = (await web3.eth.getAccounts())[0];

    instance = {
      walletAddress: walletAddress,
      web3Instance: web3,
      contract: new web3.eth.Contract(Config.rskEscrowABI, CONTRACT_ADDRESS),
    }

    return instance;
  }
};