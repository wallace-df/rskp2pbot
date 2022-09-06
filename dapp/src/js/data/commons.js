import Config from "../../../resources/config.js";

import StringUtils from "../../js/utils/string.js";
import NumberUtils from "../utils/number.js";
import AddressUtils from "../utils/address.js";
import TimeUtils from "../utils/time.js";

import Web3Utils from "web3-utils";

const $ = window["$"];

function getTokenFromMap(map) {
    let newMap = {};
    for (let key in map) {
        if (map.hasOwnProperty(key)) {
            newMap[map[key].address] = map[key];
        }
    }
    return newMap;
}

let tokenByAddress = getTokenFromMap(Config.tokens[process.env.NODE_ENV]);

export default {
    methods: {

        isStringEmpty(string) {
            return StringUtils.isEmpty(string);
        },
        
        isValidAddress(address) {
            return AddressUtils.isValidAddress(address);
        },

        isValidAmount(amount, decimals, minValue) {
           return NumberUtils.isValidAmount(amount, decimals, minValue);
        },

        toBN(value) {
            return new Web3Utils.BN(value);
        },

        toBytes32(value) {
            return Web3Utils.fromAscii(value);
        },

        getToken(tokenSymbol) {
            if (tokenSymbol) {
                tokenSymbol = String(tokenSymbol).toUpperCase();
            }
            return Config.tokens[process.env.NODE_ENV][tokenSymbol];
        },

        getTokenByAddress(tokenAddress){
            return tokenByAddress[tokenAddress.toLowerCase()];
        },

        formatTimestamp(timestamp) {
            return TimeUtils.formatTimestamp(timestamp);
        },

        formatAmount(amount, token) {
            if (!amount) {
                return null;
            }

            if (!token) {
                return null;
            }

            let formattedAmount = NumberUtils.formatUnit(amount.toString(), token.decimals) + " " + token.symbol;
            return formattedAmount;
        },

        formatOrderAmount(order) {
            let amount = this.formatAmount(this.toBN(order.amount), this.getTokenByAddress(order.tokenContractAddress))
            if (amount) {
                return amount;
            }
            return null;
        },
        
        formatOrderFeeAmount(order) {
            let amount = this.formatAmount(this.toBN(order.fee), this.getTokenByAddress(order.tokenContractAddress))
            if (amount) {
                return amount;
            }
            return null;
        },

        formatOrderTotalAmount(order) {
            let totalAmount = this.toBN(order.fee).add(this.toBN(order.amount));
            let amount = this.formatAmount(totalAmount, this.getTokenByAddress(order.tokenContractAddress))
            if (amount) {
                return amount;
            }
            return null;
        },

        showError(err) {
            console.log(err);
            let error;
            if (err.data && err.data.data && err.data.data.message) {
                error = err.data.data.message;
            } else if (err.message) {
                error = err.message;
            } else {
                error = err;
            }

            this.$store.commit("setLoading", false);

            $("#errorMsg").text(error);
            $("#errorModal").modal("show");

        },

        showSuccess(msg) {
            $("#successMsg").text(msg);
            $("#successModal").modal("show");
        }
    }
}