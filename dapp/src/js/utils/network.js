import web3 from "web3";

export default {

    invokeMethodAndWaitConfirmation(web3, contractMethod, walletAddress, onSuccessCallback, onErrorCallback) {
        let timer = null;
        let onErrorCalled = false;
        let onSuccessCalled = false;
    
        function stopTimer() {
            if (timer !== null) {
                clearInterval(timer);
                timer = null;
            }
        }
    
        function onError(err) {
            if (onErrorCalled) {
                return;
            }
            onErrorCalled = true;
            stopTimer();
            onErrorCallback(err);
        }
    
        async function monitorTx(hash) {
            let tx = await web3.eth.getTransactionReceipt(hash);
            if (tx) {
                if (tx.status) {
                    stopTimer();
                    if (onSuccessCalled) {
                        return;
                    }
                    onSuccessCalled = true;
                    onSuccessCallback();
                } else {
                    onError("Transaction failed. Please try again later.");
                }
            }
        }
    
        contractMethod.send({ from: walletAddress, value: 0 })
            .on("transactionHash", function (hash) {
                timer = setInterval(function () { monitorTx(hash) }, 5000);
            })
            .on("error", onError);
    }
}