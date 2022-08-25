export default {

    isString(s) {
        return (typeof s === "string" || s instanceof String)
    },

    isEmpty(str) {
        return (str === undefined || str === null || !this.isString(str) || str.trim().length === 0);
    },

    removeHexPrefix(hex) {
        return hex.replace(/^0x/, "");
    },

    addHexPrefix(hex) {
        return `0x${this.removeHexPrefix(hex)}`;
    }
}
