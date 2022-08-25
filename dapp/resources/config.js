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

    contractABI: require("./abis/RSKEscrow.json"),

    contractAddresses: {
        development: "0x3ab06F2fAE5EC46774d894791c4dDb98c9c4C846",
        test: "0x3ab06F2fAE5EC46774d894791c4dDb98c9c4C846"
    },

    tokens: {
        development: {
            RBTC: {
                symbol: "tRBTC",
                address: "0x0000000000000000000000000000000000000000",
                decimals: 18
            },
            RIF: {
                symbol: "tRIF",
                address: "0x19f64674D8a5b4e652319F5e239EFd3bc969a1FE",
                decimals: 18
            }
        },
        test: {
            RBTC: {
                symbol: "tRBTC",
                address: "0x0000000000000000000000000000000000000000",
                decimals: 18
            },
            RIF: {
                symbol: "tRIF",
                address: "0x19f64674D8a5b4e652319F5e239EFd3bc969a1FE",
                decimals: 18
            }
        }
    }
};