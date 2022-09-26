const RSKEscrow = artifacts.require('RSKEscrow');
const _ = require('lodash');
const crypto = require('crypto');

const extractCallError = (err) => {
    if (!err.reason && err.message) {
        let substr = "Returned error: VM Exception while processing transaction: revert";
        let pos = err.message.indexOf(substr);
        if (pos >= 0) {
            err.reason = err.message.substring(pos + substr.length).trim();
        }
    }
}

const toBN = (value) => {
    return web3.utils.toBN(value);
}

contract('RSKEscrow', function (accounts) {
    let escrowContractInstance;
    let adminAddress = accounts[0];
    let sellerAddress = accounts[1];
    let buyerAddress = accounts[2];
    let someUserAddress = accounts[3];

    it('Escrow contract initialization', async function () {
        // Deploy instance.
        escrowContractInstance = await RSKEscrow.deployed();

        // Verify RBTC contract balance.
        let contractBalance_RBTC = toBN(await web3.eth.getBalance(escrowContractInstance.address));
        assert.equal(contractBalance_RBTC.toString(), '0', 'Check contract balance.');

        // Verify RBTC escrow fees.
        let escrowFees_RBTC = toBN(await escrowContractInstance.fees('0x0000000000000000000000000000000000000000'));
        assert.equal(escrowFees_RBTC.toString(), '0', 'Check RBTC escrow fees.');
    });

    it('Seller escrows RBTC and releases to buyer', async function () {
        // Generate escrow details.
        let orderId = 'abc123';
        let buyerSecret = crypto.randomBytes(32)
        let buyerHash = crypto.createHash('sha256').update(buyerSecret).digest('hex');
        let sellerSecret = crypto.randomBytes(32);
        let sellerHash = crypto.createHash('sha256').update(sellerSecret).digest('hex');
        let amount = web3.utils.toWei('0.01', 'ether').toString();
        let fee = web3.utils.toWei('0.0001', 'ether').toString();
        let totalAmount = toBN(amount).add(toBN(fee)).toString();

        // Retrieve old balances before escrowing funds.
        let oldContractBalance = toBN(await web3.eth.getBalance(escrowContractInstance.address));
        let oldEscrowFees = toBN(await escrowContractInstance.fees('0x0000000000000000000000000000000000000000'));
        let oldAdminBalance = toBN(await web3.eth.getBalance(adminAddress));
        let oldBuyerBalance = toBN(await web3.eth.getBalance(buyerAddress));
        let oldSellerBalance = toBN(await web3.eth.getBalance(sellerAddress));

        // Escrow seller funds and calculate gas fees.
        let txnReceipt = await escrowContractInstance.escrowRBTC(orderId, buyerAddress, `0x${buyerHash}`, `0x${sellerHash}`, amount, fee, { from: sellerAddress, value: totalAmount });
        let txn = await web3.eth.getTransaction(txnReceipt.tx);
        let gasUsed = toBN(txnReceipt.receipt.gasUsed);
        let transactionCost = gasUsed.mul(toBN(txn.gasPrice));

        // Calculate new expected balances after escrowing funds.
        let expectedContractBalance = oldContractBalance.add(toBN(amount)).add(toBN(fee));
        let expectedEscrowFees = oldEscrowFees;
        let expectedAdminBalance = oldAdminBalance;
        let expectedBuyerBalance = oldBuyerBalance;
        let expectedSellerBalance = oldSellerBalance.sub(toBN(amount)).sub(toBN(fee)).sub(transactionCost);

        // Verify balances after escrowing funds.
        currentContractBalance = toBN(await web3.eth.getBalance(escrowContractInstance.address));
        currentEscrowFees = toBN(await escrowContractInstance.fees('0x0000000000000000000000000000000000000000'));
        currentAdminBalance = toBN(await web3.eth.getBalance(adminAddress));
        currentBuyerBalance = toBN(await web3.eth.getBalance(buyerAddress));
        currentSellerBalance = toBN(await web3.eth.getBalance(sellerAddress));
        assert.equal(expectedContractBalance.toString(), currentContractBalance.toString(), 'Check contract balance.');
        assert.equal(expectedEscrowFees.toString(), currentEscrowFees.toString(), 'Check escrow fees.');
        assert.equal(expectedAdminBalance.toString(), currentAdminBalance.toString(), 'Check admin balance.');
        assert.equal(expectedBuyerBalance.toString(), currentBuyerBalance.toString(), 'Check buyer balance.');
        assert.equal(expectedSellerBalance.toString(), currentSellerBalance.toString(), 'Check seller balance.');

        // Check escrow details.
        let orderInfo = await escrowContractInstance.orderById(orderId);
        assert.equal(orderId, orderInfo.id, 'Check order ID.');
        assert.equal('0x0000000000000000000000000000000000000000', orderInfo.tokenContractAddress, 'Check contract address.');
        assert.equal(buyerAddress, orderInfo.buyerAddress, 'Check buyer address.');
        assert.equal('0x' + buyerHash, orderInfo.buyerHash, 'Check buyer hash.');
        assert.equal(sellerAddress, orderInfo.sellerAddress, 'Check seller address.');
        assert.equal('0x' + sellerHash, orderInfo.sellerHash, 'Check seller hash.');
        assert.equal(amount, orderInfo.amount, 'Check amount.');
        assert.equal(fee, orderInfo.fee, 'Check fee.');
        assert.equal('1', orderInfo.status, 'Check status.');
        assert.equal(false, orderInfo.adminAction, 'Check admin status.');

        // Release seller funds to buyer and calculate gas fees.
        txnReceipt = await escrowContractInstance.releaseToBuyer(orderId, `0x${buyerSecret.toString('hex')}`, { from: sellerAddress });
        txn = await web3.eth.getTransaction(txnReceipt.tx);
        gasUsed = toBN(txnReceipt.receipt.gasUsed);
        transactionCost = gasUsed.mul(toBN(txn.gasPrice));

        // Calculate new expected balances after releasing funds.
        expectedContractBalance = currentContractBalance.sub(toBN(amount));
        expectedEscrowFees = currentEscrowFees.add(toBN(fee));
        expectedAdminBalance = currentAdminBalance;
        expectedBuyerBalance = currentBuyerBalance.add(toBN(amount));
        expectedSellerBalance = currentSellerBalance.sub(transactionCost);

        // Verify balances after releasing funds.
        currentContractBalance = toBN(await web3.eth.getBalance(escrowContractInstance.address));
        currentEscrowFees = toBN(await escrowContractInstance.fees('0x0000000000000000000000000000000000000000'));
        currentAdminBalance = toBN(await web3.eth.getBalance(adminAddress));
        currentBuyerBalance = toBN(await web3.eth.getBalance(buyerAddress));
        currentSellerBalance = toBN(await web3.eth.getBalance(sellerAddress));
        assert.equal(expectedContractBalance.toString(), currentContractBalance.toString(), 'Check contract balance.');
        assert.equal(expectedEscrowFees.toString(), currentEscrowFees.toString(), 'Check escrow fees.');
        assert.equal(expectedAdminBalance.toString(), currentAdminBalance.toString(), 'Check admin balance.');
        assert.equal(expectedBuyerBalance.toString(), currentBuyerBalance.toString(), 'Check buyer balance.');
        assert.equal(expectedSellerBalance.toString(), currentSellerBalance.toString(), 'Check seller balance.');

        // Check escrow status.
        orderInfo = await escrowContractInstance.orderById(orderId);
        assert.equal('2', orderInfo.status, 'Check status.');
        assert.equal(false, orderInfo.adminAction, 'Check admin status.');

        // Withdraw escrow fees and calculate gas fees.
        txnReceipt = await escrowContractInstance.withdrawFees('0x0000000000000000000000000000000000000000', { from: adminAddress });
        txn = await web3.eth.getTransaction(txnReceipt.tx);
        gasUsed = toBN(txnReceipt.receipt.gasUsed);
        transactionCost = gasUsed.mul(toBN(txn.gasPrice));

        // Calculate new expected balances after withdrawing fees.
        expectedContractBalance = currentContractBalance.sub(toBN(fee));
        expectedEscrowFees = toBN('0');
        expectedAdminBalance = currentAdminBalance.add(toBN(fee)).sub(transactionCost);
        expectedBuyerBalance = currentBuyerBalance;
        expectedSellerBalance = currentSellerBalance;

        // Verify balances after withdraw service fees.
        currentContractBalance = toBN(await web3.eth.getBalance(escrowContractInstance.address));
        currentEscrowFees = toBN(await escrowContractInstance.fees('0x0000000000000000000000000000000000000000'));
        currentAdminBalance = toBN(await web3.eth.getBalance(adminAddress));
        currentBuyerBalance = toBN(await web3.eth.getBalance(buyerAddress));
        currentSellerBalance = toBN(await web3.eth.getBalance(sellerAddress));
        assert.equal(expectedContractBalance.toString(), currentContractBalance.toString(), 'Check contract balance.');
        assert.equal(expectedEscrowFees.toString(), currentEscrowFees.toString(), 'Check escrow fees.');
        assert.equal(expectedAdminBalance.toString(), currentAdminBalance.toString(), 'Check admin balance.');
        assert.equal(expectedBuyerBalance.toString(), currentBuyerBalance.toString(), 'Check buyer balance.');
        assert.equal(expectedSellerBalance.toString(), currentSellerBalance.toString(), 'Check seller balance.');
    });

    it('Seller escrows RBTC and gets a refund', async function () {
        // Generate escrow details.
        let orderId = 'def456';
        let buyerSecret = crypto.randomBytes(32)
        let buyerHash = crypto.createHash('sha256').update(buyerSecret).digest('hex');
        let sellerSecret = crypto.randomBytes(32);
        let sellerHash = crypto.createHash('sha256').update(sellerSecret).digest('hex');
        let amount = web3.utils.toWei('0.01', 'ether').toString();
        let fee = web3.utils.toWei('0.0001', 'ether').toString();
        let totalAmount = toBN(amount).add(toBN(fee)).toString();

        // Retrieve old balances before escrowing funds.
        let oldContractBalance = toBN(await web3.eth.getBalance(escrowContractInstance.address));
        let oldEscrowFees = toBN(await escrowContractInstance.fees('0x0000000000000000000000000000000000000000'));
        let oldAdminBalance = toBN(await web3.eth.getBalance(adminAddress));
        let oldBuyerBalance = toBN(await web3.eth.getBalance(buyerAddress));
        let oldSellerBalance = toBN(await web3.eth.getBalance(sellerAddress));

        // Escrow seller funds and calculate gas fees.
        let txnReceipt = await escrowContractInstance.escrowRBTC(orderId, buyerAddress, `0x${buyerHash}`, `0x${sellerHash}`, amount, fee, { from: sellerAddress, value: totalAmount });
        let txn = await web3.eth.getTransaction(txnReceipt.tx);
        let gasUsed = toBN(txnReceipt.receipt.gasUsed);
        let transactionCost = gasUsed.mul(toBN(txn.gasPrice));

        // Calculate new expected balances after escrowing funds.
        let expectedContractBalance = oldContractBalance.add(toBN(amount)).add(toBN(fee));
        let expectedEscrowFees = oldEscrowFees;
        let expectedAdminBalance = oldAdminBalance;
        let expectedBuyerBalance = oldBuyerBalance;
        let expectedSellerBalance = oldSellerBalance.sub(toBN(amount)).sub(toBN(fee)).sub(transactionCost);

        // Verify balances after escrowing funds.
        currentContractBalance = toBN(await web3.eth.getBalance(escrowContractInstance.address));
        currentEscrowFees = toBN(await escrowContractInstance.fees('0x0000000000000000000000000000000000000000'));
        currentAdminBalance = toBN(await web3.eth.getBalance(adminAddress));
        currentBuyerBalance = toBN(await web3.eth.getBalance(buyerAddress));
        currentSellerBalance = toBN(await web3.eth.getBalance(sellerAddress));
        assert.equal(expectedContractBalance.toString(), currentContractBalance.toString(), 'Check contract balance.');
        assert.equal(expectedEscrowFees.toString(), currentEscrowFees.toString(), 'Check escrow fees.');
        assert.equal(expectedAdminBalance.toString(), currentAdminBalance.toString(), 'Check admin balance.');
        assert.equal(expectedBuyerBalance.toString(), currentBuyerBalance.toString(), 'Check buyer balance.');
        assert.equal(expectedSellerBalance.toString(), currentSellerBalance.toString(), 'Check seller balance.');

        // Check escrow details.
        let orderInfo = await escrowContractInstance.orderById(orderId);
        assert.equal(orderId, orderInfo.id, 'Check order ID.');
        assert.equal('0x0000000000000000000000000000000000000000', orderInfo.tokenContractAddress, 'Check contract address.');
        assert.equal(buyerAddress, orderInfo.buyerAddress, 'Check buyer address.');
        assert.equal('0x' + buyerHash, orderInfo.buyerHash, 'Check buyer hash.');
        assert.equal(sellerAddress, orderInfo.sellerAddress, 'Check seller address.');
        assert.equal('0x' + sellerHash, orderInfo.sellerHash, 'Check seller hash.');
        assert.equal(amount, orderInfo.amount, 'Check amount.');
        assert.equal(fee, orderInfo.fee, 'Check fee.');
        assert.equal('1', orderInfo.status, 'Check status.');
        assert.equal(false, orderInfo.adminAction, 'Check admin status.');

        // Refund seller and calculate gas fees.
        txnReceipt = await escrowContractInstance.refundSeller(orderId, `0x${sellerSecret.toString('hex')}`, { from: sellerAddress });
        txn = await web3.eth.getTransaction(txnReceipt.tx);
        gasUsed = toBN(txnReceipt.receipt.gasUsed);
        transactionCost = gasUsed.mul(toBN(txn.gasPrice));

        // Calculate new expected balances after refund.
        expectedContractBalance = currentContractBalance.sub(toBN(amount)).sub(toBN(fee));
        expectedEscrowFees = currentEscrowFees;
        expectedAdminBalance = currentAdminBalance;
        expectedBuyerBalance = currentBuyerBalance;
        expectedSellerBalance = currentSellerBalance.add(toBN(amount)).add(toBN(fee)).sub(transactionCost);

        // Verify balances after refund.
        currentContractBalance = toBN(await web3.eth.getBalance(escrowContractInstance.address));
        currentEscrowFees = toBN(await escrowContractInstance.fees('0x0000000000000000000000000000000000000000'));
        currentAdminBalance = toBN(await web3.eth.getBalance(adminAddress));
        currentBuyerBalance = toBN(await web3.eth.getBalance(buyerAddress));
        currentSellerBalance = toBN(await web3.eth.getBalance(sellerAddress));
        assert.equal(expectedContractBalance.toString(), currentContractBalance.toString(), 'Check contract balance.');
        assert.equal(expectedEscrowFees.toString(), currentEscrowFees.toString(), 'Check escrow fees.');
        assert.equal(expectedAdminBalance.toString(), currentAdminBalance.toString(), 'Check admin balance.');
        assert.equal(expectedBuyerBalance.toString(), currentBuyerBalance.toString(), 'Check buyer balance.');
        assert.equal(expectedSellerBalance.toString(), currentSellerBalance.toString(), 'Check seller balance.');

        // Check escrow status.
        orderInfo = await escrowContractInstance.orderById(orderId);
        assert.equal('3', orderInfo.status, 'Check status.');
        assert.equal(false, orderInfo.adminAction, 'Check admin status.');
    });

    it('Seller escrows RBTC and admin releases to buyer', async function () {
        // Generate escrow details.
        let orderId = 'xyz789';
        let buyerSecret = crypto.randomBytes(32)
        let buyerHash = crypto.createHash('sha256').update(buyerSecret).digest('hex');
        let sellerSecret = crypto.randomBytes(32);
        let sellerHash = crypto.createHash('sha256').update(sellerSecret).digest('hex');
        let amount = web3.utils.toWei('0.01', 'ether').toString();
        let fee = web3.utils.toWei('0.0001', 'ether').toString();
        let totalAmount = toBN(amount).add(toBN(fee)).toString();

        // Retrieve old balances before escrowing funds.
        let oldContractBalance = toBN(await web3.eth.getBalance(escrowContractInstance.address));
        let oldEscrowFees = toBN(await escrowContractInstance.fees('0x0000000000000000000000000000000000000000'));
        let oldAdminBalance = toBN(await web3.eth.getBalance(adminAddress));
        let oldBuyerBalance = toBN(await web3.eth.getBalance(buyerAddress));
        let oldSellerBalance = toBN(await web3.eth.getBalance(sellerAddress));

        // Escrow seller funds and calculate gas fees.
        let txnReceipt = await escrowContractInstance.escrowRBTC(orderId, buyerAddress, `0x${buyerHash}`, `0x${sellerHash}`, amount, fee, { from: sellerAddress, value: totalAmount });
        let txn = await web3.eth.getTransaction(txnReceipt.tx);
        let gasUsed = toBN(txnReceipt.receipt.gasUsed);
        let transactionCost = gasUsed.mul(toBN(txn.gasPrice));

        // Calculate new expected balances after escrowing funds.
        let expectedContractBalance = oldContractBalance.add(toBN(amount)).add(toBN(fee));
        let expectedEscrowFees = oldEscrowFees;
        let expectedAdminBalance = oldAdminBalance;
        let expectedBuyerBalance = oldBuyerBalance;
        let expectedSellerBalance = oldSellerBalance.sub(toBN(amount)).sub(toBN(fee)).sub(transactionCost);

        // Verify balances after escrowing funds.
        currentContractBalance = toBN(await web3.eth.getBalance(escrowContractInstance.address));
        currentEscrowFees = toBN(await escrowContractInstance.fees('0x0000000000000000000000000000000000000000'));
        currentAdminBalance = toBN(await web3.eth.getBalance(adminAddress));
        currentBuyerBalance = toBN(await web3.eth.getBalance(buyerAddress));
        currentSellerBalance = toBN(await web3.eth.getBalance(sellerAddress));
        assert.equal(expectedContractBalance.toString(), currentContractBalance.toString(), 'Check contract balance.');
        assert.equal(expectedEscrowFees.toString(), currentEscrowFees.toString(), 'Check escrow fees.');
        assert.equal(expectedAdminBalance.toString(), currentAdminBalance.toString(), 'Check admin balance.');
        assert.equal(expectedBuyerBalance.toString(), currentBuyerBalance.toString(), 'Check buyer balance.');
        assert.equal(expectedSellerBalance.toString(), currentSellerBalance.toString(), 'Check seller balance.');

        // Check escrow details.
        let orderInfo = await escrowContractInstance.orderById(orderId);
        assert.equal(orderId, orderInfo.id, 'Check order ID.');
        assert.equal('0x0000000000000000000000000000000000000000', orderInfo.tokenContractAddress, 'Check contract address.');
        assert.equal(buyerAddress, orderInfo.buyerAddress, 'Check buyer address.');
        assert.equal('0x' + buyerHash, orderInfo.buyerHash, 'Check buyer hash.');
        assert.equal(sellerAddress, orderInfo.sellerAddress, 'Check seller address.');
        assert.equal('0x' + sellerHash, orderInfo.sellerHash, 'Check seller hash.');
        assert.equal(amount, orderInfo.amount, 'Check amount.');
        assert.equal(fee, orderInfo.fee, 'Check fee.');
        assert.equal('1', orderInfo.status, 'Check status.');
        assert.equal(false, orderInfo.adminAction, 'Check admin status.');

        // Admin releases funds to buyer and calculate gas fees.
        txnReceipt = await escrowContractInstance.adminReleaseToBuyer(orderId, { from: adminAddress });
        txn = await web3.eth.getTransaction(txnReceipt.tx);
        gasUsed = toBN(txnReceipt.receipt.gasUsed);
        transactionCost = gasUsed.mul(toBN(txn.gasPrice));

        // Calculate new expected balances after releasing funds.
        expectedContractBalance = currentContractBalance.sub(toBN(amount));
        expectedEscrowFees = currentEscrowFees.add(toBN(fee));
        expectedAdminBalance = currentAdminBalance.sub(transactionCost);;
        expectedBuyerBalance = currentBuyerBalance.add(toBN(amount));
        expectedSellerBalance = currentSellerBalance;

        // Verify balances after releasing funds.
        currentContractBalance = toBN(await web3.eth.getBalance(escrowContractInstance.address));
        currentEscrowFees = toBN(await escrowContractInstance.fees('0x0000000000000000000000000000000000000000'));
        currentAdminBalance = toBN(await web3.eth.getBalance(adminAddress));
        currentBuyerBalance = toBN(await web3.eth.getBalance(buyerAddress));
        currentSellerBalance = toBN(await web3.eth.getBalance(sellerAddress));
        assert.equal(expectedContractBalance.toString(), currentContractBalance.toString(), 'Check contract balance.');
        assert.equal(expectedEscrowFees.toString(), currentEscrowFees.toString(), 'Check escrow fees.');
        assert.equal(expectedAdminBalance.toString(), currentAdminBalance.toString(), 'Check admin balance.');
        assert.equal(expectedBuyerBalance.toString(), currentBuyerBalance.toString(), 'Check buyer balance.');
        assert.equal(expectedSellerBalance.toString(), currentSellerBalance.toString(), 'Check seller balance.');

        // Check escrow status.
        orderInfo = await escrowContractInstance.orderById(orderId);
        assert.equal('2', orderInfo.status, 'Check status.');
        assert.equal(true, orderInfo.adminAction, 'Check admin status.');

        // Withdraw escrow fees and calculate gas fees.
        txnReceipt = await escrowContractInstance.withdrawFees('0x0000000000000000000000000000000000000000', { from: adminAddress });
        txn = await web3.eth.getTransaction(txnReceipt.tx);
        gasUsed = toBN(txnReceipt.receipt.gasUsed);
        transactionCost = gasUsed.mul(toBN(txn.gasPrice));

        // Calculate new expected balances after withdrawing fees.
        expectedContractBalance = currentContractBalance.sub(toBN(fee));
        expectedEscrowFees = toBN('0');
        expectedAdminBalance = currentAdminBalance.sub(transactionCost);
        expectedBuyerBalance = currentBuyerBalance;
        expectedSellerBalance = currentSellerBalance;

        // Verify balances after withdraw service fees.
        currentContractBalance = toBN(await web3.eth.getBalance(escrowContractInstance.address));
        currentEscrowFees = toBN(await escrowContractInstance.fees('0x0000000000000000000000000000000000000000'));
        currentAdminBalance = toBN(await web3.eth.getBalance(adminAddress));
        currentBuyerBalance = toBN(await web3.eth.getBalance(buyerAddress));
        currentSellerBalance = toBN(await web3.eth.getBalance(sellerAddress));
        assert.equal(expectedContractBalance.toString(), currentContractBalance.toString(), 'Check contract balance.');
        assert.equal(expectedEscrowFees.toString(), currentEscrowFees.toString(), 'Check escrow fees.');
        assert.equal(expectedAdminBalance.toString(), currentAdminBalance.toString(), 'Check admin balance.');
        assert.equal(expectedBuyerBalance.toString(), currentBuyerBalance.toString(), 'Check buyer balance.');
        assert.equal(expectedSellerBalance.toString(), currentSellerBalance.toString(), 'Check seller balance.');
    });

    it('Seller escrows RBTC and admin refunds', async function () {
        // Generate escrow details.
        let orderId = '123xyz';
        let buyerSecret = crypto.randomBytes(32)
        let buyerHash = crypto.createHash('sha256').update(buyerSecret).digest('hex');
        let sellerSecret = crypto.randomBytes(32);
        let sellerHash = crypto.createHash('sha256').update(sellerSecret).digest('hex');
        let amount = web3.utils.toWei('0.01', 'ether').toString();
        let fee = web3.utils.toWei('0.0001', 'ether').toString();
        let totalAmount = toBN(amount).add(toBN(fee)).toString();

        // Retrieve old balances before escrowing funds.
        let oldContractBalance = toBN(await web3.eth.getBalance(escrowContractInstance.address));
        let oldEscrowFees = toBN(await escrowContractInstance.fees('0x0000000000000000000000000000000000000000'));
        let oldAdminBalance = toBN(await web3.eth.getBalance(adminAddress));
        let oldBuyerBalance = toBN(await web3.eth.getBalance(buyerAddress));
        let oldSellerBalance = toBN(await web3.eth.getBalance(sellerAddress));

        // Escrow seller funds and calculate gas fees.
        let txnReceipt = await escrowContractInstance.escrowRBTC(orderId, buyerAddress, `0x${buyerHash}`, `0x${sellerHash}`, amount, fee, { from: sellerAddress, value: totalAmount });
        let txn = await web3.eth.getTransaction(txnReceipt.tx);
        let gasUsed = toBN(txnReceipt.receipt.gasUsed);
        let transactionCost = gasUsed.mul(toBN(txn.gasPrice));

        // Calculate new expected balances after escrowing funds.
        let expectedContractBalance = oldContractBalance.add(toBN(amount)).add(toBN(fee));
        let expectedEscrowFees = oldEscrowFees;
        let expectedAdminBalance = oldAdminBalance;
        let expectedBuyerBalance = oldBuyerBalance;
        let expectedSellerBalance = oldSellerBalance.sub(toBN(amount)).sub(toBN(fee)).sub(transactionCost);

        // Verify balances after escrowing funds.
        currentContractBalance = toBN(await web3.eth.getBalance(escrowContractInstance.address));
        currentEscrowFees = toBN(await escrowContractInstance.fees('0x0000000000000000000000000000000000000000'));
        currentAdminBalance = toBN(await web3.eth.getBalance(adminAddress));
        currentBuyerBalance = toBN(await web3.eth.getBalance(buyerAddress));
        currentSellerBalance = toBN(await web3.eth.getBalance(sellerAddress));
        assert.equal(expectedContractBalance.toString(), currentContractBalance.toString(), 'Check contract balance.');
        assert.equal(expectedEscrowFees.toString(), currentEscrowFees.toString(), 'Check escrow fees.');
        assert.equal(expectedAdminBalance.toString(), currentAdminBalance.toString(), 'Check admin balance.');
        assert.equal(expectedBuyerBalance.toString(), currentBuyerBalance.toString(), 'Check buyer balance.');
        assert.equal(expectedSellerBalance.toString(), currentSellerBalance.toString(), 'Check seller balance.');

        // Check escrow details.
        let orderInfo = await escrowContractInstance.orderById(orderId);
        assert.equal(orderId, orderInfo.id, 'Check order ID.');
        assert.equal('0x0000000000000000000000000000000000000000', orderInfo.tokenContractAddress, 'Check contract address.');
        assert.equal(buyerAddress, orderInfo.buyerAddress, 'Check buyer address.');
        assert.equal('0x' + buyerHash, orderInfo.buyerHash, 'Check buyer hash.');
        assert.equal(sellerAddress, orderInfo.sellerAddress, 'Check seller address.');
        assert.equal('0x' + sellerHash, orderInfo.sellerHash, 'Check seller hash.');
        assert.equal(amount, orderInfo.amount, 'Check amount.');
        assert.equal(fee, orderInfo.fee, 'Check fee.');
        assert.equal('1', orderInfo.status, 'Check status.');
        assert.equal(false, orderInfo.adminAction, 'Check admin status.');

        // Refund seller and calculate gas fees.
        txnReceipt = await escrowContractInstance.adminRefundSeller(orderId, { from: adminAddress });
        txn = await web3.eth.getTransaction(txnReceipt.tx);
        gasUsed = toBN(txnReceipt.receipt.gasUsed);
        transactionCost = gasUsed.mul(toBN(txn.gasPrice));

        // Calculate new expected balances after refund.
        expectedContractBalance = currentContractBalance.sub(toBN(amount)).sub(toBN(fee));
        expectedEscrowFees = currentEscrowFees;
        expectedAdminBalance = currentAdminBalance.sub(transactionCost);
        expectedBuyerBalance = currentBuyerBalance;
        expectedSellerBalance = currentSellerBalance.add(toBN(amount)).add(toBN(fee));

        // Verify balances after refund.
        currentContractBalance = toBN(await web3.eth.getBalance(escrowContractInstance.address));
        currentEscrowFees = toBN(await escrowContractInstance.fees('0x0000000000000000000000000000000000000000'));
        currentAdminBalance = toBN(await web3.eth.getBalance(adminAddress));
        currentBuyerBalance = toBN(await web3.eth.getBalance(buyerAddress));
        currentSellerBalance = toBN(await web3.eth.getBalance(sellerAddress));
        assert.equal(expectedContractBalance.toString(), currentContractBalance.toString(), 'Check contract balance.');
        assert.equal(expectedEscrowFees.toString(), currentEscrowFees.toString(), 'Check escrow fees.');
        assert.equal(expectedAdminBalance.toString(), currentAdminBalance.toString(), 'Check admin balance.');
        assert.equal(expectedBuyerBalance.toString(), currentBuyerBalance.toString(), 'Check buyer balance.');
        assert.equal(expectedSellerBalance.toString(), currentSellerBalance.toString(), 'Check seller balance.');

        // Check escrow status.
        orderInfo = await escrowContractInstance.orderById(orderId);
        assert.equal('3', orderInfo.status, 'Check status.');
        assert.equal(true, orderInfo.adminAction, 'Check admin status.');
    });

    it('Whitelist ERC20 Token from non-admin address', async function () {
        // Try to whitelist token from a non-admin account.
        let errorRaised = false;
        try {
            await escrowContractInstance.setWhitelistedERC20Token('0x19f64674d8a5b4e652319f5e239efd3bc969a1fe', true, { from: someUserAddress });
        } catch (err) {
            errorRaised = true;
        }
        assert.equal(errorRaised, true, 'Assert failure.');
    });

    it('Whitelist ERC20 Token from admin address', async function () {
        const erc20Address = '0x19f64674d8a5b4e652319f5e239efd3bc969a1fe';

        // Verify token is not whitelisted yet.
        let whitelisted = await escrowContractInstance.isERC20Whitelisted(erc20Address);
        assert.equal(whitelisted, false, 'Assure token is not whitelisted yet.');

        // Whitelist token from admin account.
        await escrowContractInstance.setWhitelistedERC20Token(erc20Address, true, { from: adminAddress });

        // Verify token is now whitelisted.
        whitelisted = await escrowContractInstance.isERC20Whitelisted(erc20Address);
        assert.equal(whitelisted, true, 'Assure token  is whitelisted.');
    });

});