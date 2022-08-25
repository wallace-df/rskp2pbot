import Config from "../../../resources/config.js";
import NumberUtils from "../utils/number.js";

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
        formatAmount(amount, tokenContractAddress) {
            let token = tokenByAddress[tokenContractAddress];
            if (!amount) {
                return null;
            }

            if (!token) {
                return null;
            }

            let formattedAmount = NumberUtils.formatUnit(amount.toString(), token.decimals) + " " + token.symbol;
            return formattedAmount;
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