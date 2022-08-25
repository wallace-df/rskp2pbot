export default {
    formatDuration(durationInSeconds) {
        if (!durationInSeconds) {
            return "-";
        }

        let seconds = Number(durationInSeconds);
        let d = Math.floor(seconds / (3600 * 24));
        let h = Math.floor(seconds % (3600 * 24) / 3600);
        let m = Math.floor(seconds % 3600 / 60);
        let s = Math.floor(seconds % 60);

        let dDisplay = d > 0 ? d + (d == 1 ? " day, " : " days, ") : "";
        let hDisplay = h > 0 ? h + (h == 1 ? " hour, " : " hours, ") : "";
        let mDisplay = m > 0 ? m + (m == 1 ? " minute, " : " minutes, ") : "";
        let sDisplay = s > 0 ? s + (s == 1 ? " second" : " seconds") : "";
        let result = dDisplay + hDisplay + mDisplay + sDisplay;

        if (result.endsWith(", ")) {
            result = result.substring(0, result.length - 2);
        }

        return result;
    },

    formatTimestamp(timestamp) {
        if (!timestamp) {
          return "-";
        }
        return new Date(Number(timestamp) * 1000).toLocaleString();
    },
}