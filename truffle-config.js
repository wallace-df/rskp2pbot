const HDWalletProvider = require('@truffle/hdwallet-provider');
const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env.test') });

/**
 * Use this file to configure your truffle project. It's seeded with some
 * common settings for different networks and features like migrations,
 * compilation and testing. Uncomment the ones you need or modify
 * them to suit your project as necessary.
 *
 * More information about configuration can be found at:
 *
 * trufflesuite.com/docs/advanced/configuration
 *
 */
 module.exports = {
    /**
     * Networks define how you connect to your ethereum client and let you set the
     * defaults web3 uses to send transactions. If you don't specify one truffle
     * will spin up a development blockchain for you on port 9545 when you
     * run `develop` or `test`. You can ask a truffle command to use a specific
     * network from the command line, e.g
     *
     * $ truffle test --network <network-name>
     */
  
    networks: {
      // Useful for testing. The `development` name is special - truffle uses it by default
      // if it's defined here and no other network is specified at the command line.
      // You should run a client (like ganache-cli, geth or parity) in a separate terminal
      // tab if you use this network and you must also set the `host`, `port` and `network_id`
      // options below to some value.
      //
      development: {
       host: "127.0.0.1",     // Localhost (default: none)
       port: 7545,            // Standard Ethereum port (default: none)
       network_id: "*",       // Any network (default: none)
      },

      rsk_testnet: {
        provider: () => new HDWalletProvider({
          mnemonic: {
            phrase: process.env.TESTNET_SEED_PHRASE,
          },
          providerOrUrl: 'https://public-node.testnet.rsk.co/',
          derivationPath: "m/44'/37310'/0'/0/",
          // Higher polling interval to check for blocks less frequently
          pollingInterval: 15e3,
        }),
        // Ref: http://developers.rsk.co/rsk/architecture/account-based/#chainid
        network_id: 31,
        gasPrice: 0x387ee40,
        networkCheckTimeout: 1e6,
        timeoutBlocks: 100,
        // Higher polling interval to check for blocks less frequently
        // during deployment
        deploymentPollingInterval: 15e3,
      }
    },
  
    // Configure your compilers
    compilers: {
      solc: {
        version: "0.8.7"
      }
    }
  };