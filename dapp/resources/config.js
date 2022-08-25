export default {

    wallets: {

        rpcUrls: {
            development: {
                31: "https://public-node.testnet.rsk.co"
            },
            test: {
                31: "https://public-node.testnet.rsk.co"
            },
            production: {
                30: "https://public-node.rsk.co"
            }
        },

        portisOptions: {
            development: {
                id: "a1c8672b-7b1c-476b-b3d0-41c27d575920",
                network: {
                    nodeUrl: "https://public-node.testnet.rsk.co",
                    chainId: 31
                }
            },
            test: {
                id: "a1c8672b-7b1c-476b-b3d0-41c27d575920",
                network: {
                    nodeUrl: "https://public-node.testnet.rsk.co",
                    chainId: 31
                }
            },
            production: {
                id: "a1c8672b-7b1c-476b-b3d0-41c27d575920",
                network: {
                    nodeUrl: "https://public-node.rsk.co",
                    chainId: 30
                }
            }
        }
    },

    // contractABI: require("./abis/RSKEscrow.json"),

    contractABI: require("../../contracts/abis/RSKEscrow.json"),

    contractAddresses: {
        development: "0x73EC72bA3A8Ea6EA828C6F927B6fd15C810703A1",
        test: "0x73EC72bA3A8Ea6EA828C6F927B6fd15C810703A1"
    },

    tokens: {
        development: {
            RBTC: {
                id: "RBTC",
                symbol: "tRBTC",
                address: "0x0000000000000000000000000000000000000000",
                decimals: 18
            },
            RIF: {
                id: "RIF",
                symbol: "tRIF",
                address: "0x19f64674d8a5b4e652319f5e239efd3bc969a1fe",
                decimals: 18
            }
        },
        test: {
            RBTC: {
                id: "RBTC",
                symbol: "tRBTC",
                address: "0x0000000000000000000000000000000000000000",
                decimals: 18
            },
            RIF: {
                id: "RIF",
                symbol: "tRIF",
                address: "0x19f64674d8a5b4e652319f5e239efd3bc969a1fe",
                decimals: 18
            }
        }
    }
};