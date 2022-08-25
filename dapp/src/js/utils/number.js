import Web3Utils from "web3-utils";
import StringUtils from "./string.js";

export default {

    isValidAmount(amount, decimals, minValue, maxValue) {
        if (!StringUtils.isString(amount) || StringUtils.isEmpty(amount)) {
            return false;
        }

        const regexStr = "^(0|[1-9]\\d*)(\\.\\d{0," + decimals + "})?$";

        if (new RegExp(regexStr).test(amount) === false) {
            console.log("invalid number");
            return false;
        }

        if (!StringUtils.isEmpty(minValue)) {
            try {
                minValue = this.toBN(minValue);
            } catch (err) {
                minValue = null;
            }
        }


        if (!StringUtils.isEmpty(maxValue)) {
            try {
                maxValue = this.toBN(maxValue);
            } catch (err) {
                maxValue = null;
            }
        }

        try {
            let value = this.toBN(amount);
            if (minValue && value.lt(minValue)) {
                throw "Value should be >= " + minValue.toString();
            }
            if (maxValue && value.le(maxValue)) {
                throw "Value should be <= " + maxValue.toString();
            }
        } catch (err) {
            console.log(err);
            return false;
        }

        return true;
    },

    toBaseUnit(value, decimals) {
        if (!StringUtils.isString(value)) {
            throw new Error("Pass strings to prevent floating point precision issues.");
        }

        const regexStr = "^(0|[1-9]\\d*)(\\.\\d{0," + decimals + "})?$";

        if (new RegExp(regexStr).test(value) === false) {
            throw new Error("INVALID_NUMBER")
        }

        const BN = Web3Utils.BN;
        const ten = new BN(10);
        const base = ten.pow(new BN(decimals));

        // Is it negative?
        let negative = (value.substring(0, 1) === "-");
        if (negative) {
            value = value.substring(1);
        }

        if (value === ".") {
            throw new Error(
                `Invalid value ${value} cannot be converted to`
                + ` base unit with ${decimals} decimals.`);
        }

        // Split it into a whole and fractional part
        let comps = value.split(".");
        if (comps.length > 2) { throw new Error("Too many decimal points"); }

        let whole = comps[0], fraction = comps[1];

        if (!whole) { whole = "0"; }
        if (!fraction) { fraction = "0"; }
        if (fraction.length > decimals) {
            throw new Error("Too many decimal places");
        }

        while (fraction.length < decimals) {
            fraction += "0";
        }

        whole = new BN(whole);
        fraction = new BN(fraction);
        let wei = (whole.mul(base)).add(fraction);

        if (negative) {
            wei = wei.neg();
        }

        return new BN(wei.toString(10), 10);
    },

    toBN(value) {
        return new Web3Utils.BN(value);
    },

    exp(base, exp) {
        return this.toBN(base).pow(this.toBN(exp));
    },

    formatUnit(value, decimals) {
        value = this.toBN(value);
        let base = new Web3Utils.BN(10).pow(new Web3Utils.BN(decimals));
        let fraction = value.mod(base).toString(10);

        while (fraction.length < decimals) {
            fraction = `0${fraction}`;
        }

        fraction = fraction.match(/^([0-9]*[1-9]|0)(0*)/)[1];

        let whole = value.div(base).toString(10);
        value = `${whole}.${fraction}`;

        let paddingZeroes = decimals - fraction.length;
        while (paddingZeroes > 0) {
            paddingZeroes--;
            value = `${value}0`;
        }
        return value;
    },
    
    toBigInt(value) {
      return BigInt(value)
    }
}
