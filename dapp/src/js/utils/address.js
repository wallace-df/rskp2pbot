import Web3Utils from "web3-utils";

export default {

    isValidAddress(address) {
        return Web3Utils.isAddress(address);
    }
}
