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

    rskEscrowABI: require("../../contracts/abis/RSKEscrow.json"),
    erc20ABI: require("../../contracts/abis/ERC20.json"),

    contractAddresses: {
        development: "0xe2514B40ccf6De1Adc9FA25219bC4F17C5cac948",
        test: "0xe2514B40ccf6De1Adc9FA25219bC4F17C5cac948"
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
                decimals: 18,
                image: 'https://s2.coinmarketcap.com/static/img/coins/64x64/3701.png'
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
                decimals: 18,
                image: 'https://s2.coinmarketcap.com/static/img/coins/64x64/3701.png'
            }
        }
    }
};