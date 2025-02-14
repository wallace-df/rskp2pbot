const { User, Order, Dispute } = require('../models');
const messages = require('../bot/messages');
const ordersActions = require('../bot/ordersActions');
const { handleReputationItems, getUserI18nContext, getToken, acquireOrdersLock, releaseOrdersLock } = require('../util');
const { ethers } = require('ethers');
const BN = require('bn.js');
const logger = require('../logger');

const rskEscrowContract = new ethers.Contract(
  process.env.RSK_ESCROW_CONTRACT,
  require('../contracts/abis/RSKEscrow.json'),
  new ethers.providers.JsonRpcProvider(process.env.RSK_PROVIDER)
);

const isMatchingOrder = (order, escrow) => {
  let token = getToken(order.token_code);
  if (!token) {
    return false;
  }

  if (token.contractAddress.toLowerCase() !== escrow.tokenContractAddress.toLowerCase()) {
    return false;
  }

  if (!order.buyer_address || order.buyer_address.toLowerCase() !== escrow.buyerAddress.toLowerCase()) {
    return false;
  }

  if (('0x' + order.buyer_hash.toLowerCase()) !== escrow.buyerHash.toLowerCase()) {
    return false;
  }

  if (('0x' + order.seller_hash.toLowerCase()) !== escrow.sellerHash.toLowerCase()) {
    return false;
  }

  if (new BN(String(order.amount)).toString() !== escrow.amount.toString()) {
    return false;
  }

  if (new BN(String(order.fee)).toString() !== escrow.fee.toString()) {
    return false;
  }

  return true;


}

const syncEscrowedOrders = async bot => {

  try {

    // We don't want to run together with other tasks that update the order status.
    //
    // In special, we want  avoid cases like:
    // (1) Seller locks tokens in escrow.
    // (2) The cancel job runs before the escrow job, giving the seller the option to get a refund.
    // (3) The sync escrow job runs in parallel, sees that the order hasn't been cancelled yet and informs the buyer to go on with the trade.
    // 
    // In the scenario above, the seller could trick the buyer for sending fiat, while also holding the power to refund tokens.
    // We want either the refund option available for the seller, or the option to go on with the trade.
    //
    if (!acquireOrdersLock()) {
      return;
    }

    // Activate orders where the seller has locked the required tokens.
    await activateFundedOrders(bot);

    // Resolve (release or cancel) orders where the seller has locked the required tokens.
    await resolveFundedOrders(bot);

    // Flag refundable orders whose funds have been already unlocked.
    await flagUnlockedRefundableOrders(bot);

  } catch (error) {
    logger.error(error);
  } finally {
    releaseOrdersLock();
  }
};

const activateFundedOrders = async bot => {
  const waitingOrders = await Order.find({
    $or: [{ status: 'WAITING_PAYMENT' }]
  });

  for (const order of waitingOrders) {
    try {
      let locked = false;

      let escrow = await rskEscrowContract.orderById(order._id.toString());
      if (escrow.status === 1 && isMatchingOrder(order, escrow)) {
        locked = true;
      }

      if (!locked) {
        continue;
      }

      // Save updated state first, then publish messages.
      order.status = 'ACTIVE';
      order.tokens_held_at = Date.now();
      order.save();

      const buyer = await User.findOne({ _id: order.buyer_id });
      const seller = await User.findOne({ _id: order.seller_id });

      // This is the i18n context we need to pass to the message
      const i18nCtxBuyer = await getUserI18nContext(buyer);
      const i18nCtxSeller = await getUserI18nContext(seller);

      if (order.type === 'sell') {
        await messages.onGoingTakeSellMessage(
          bot,
          buyer,
          seller,
          order,
          i18nCtxBuyer,
          i18nCtxSeller
        );
      } else if (order.type === 'buy') {    
        await messages.onGoingTakeBuyMessage(
          bot,
          buyer,
          seller,
          order,
          i18nCtxBuyer,
          i18nCtxSeller
        );
      }

    } catch (err) {
      logger.warning(err);
    }
  }
};

const resolveFundedOrders = async bot => {
  const lockedOrders = await Order.find({
    $or: [{ status: 'ACTIVE' }, { status: 'FIAT_SENT' }, { status: 'DISPUTE' }]
  });

  for (const order of lockedOrders) {
    try {

      let escrow = await rskEscrowContract.orderById(order._id.toString());

      if (!isMatchingOrder(order, escrow)) {
        continue;
      }

      if (escrow.status === 2) {
        await processReleasedOrder(bot, order, escrow.adminAction);
      } else if (escrow.status === 3) {
        await processRefundedOrder(bot, order, escrow.adminAction);
      }

    } catch (err) {
      logger.warning(err);
    }
  }
};

const flagUnlockedRefundableOrders = async bot => {
  const cancelledOrders = await Order.find({
    status: 'CANCELED',
    funds_unlocked: false
  });

  for (const order of cancelledOrders) {
    try {

      let escrow = await rskEscrowContract.orderById(order._id.toString());

      if (!isMatchingOrder(order, escrow)) {
        continue;
      }

      if (escrow.status === 2 || escrow.status === 3) {
        order.funds_unlocked = true;
        await order.save();    
      }

    } catch (err) {
      logger.warning(err);
    }
  }
};

const processReleasedOrder = async (bot, order, releasedByAdmin) => {
  // We look for a dispute for this order
  const dispute = await Dispute.findOne({ order_id: order._id });
  if (dispute) {
    if (releasedByAdmin) {
      dispute.status = 'ADMIN_RELEASED';
    } else {
      dispute.status = 'SELLER_RELEASED';
    }
    await dispute.save();
  }

  const buyer = await User.findOne({ _id: order.buyer_id });
  const seller = await User.findOne({ _id: order.seller_id });
  const i18nCtxBuyer = await getUserI18nContext(buyer);
  const i18nCtxSeller = await getUserI18nContext(seller);

  if (releasedByAdmin) {
    // Save updated state first, then publish messages.
    order.funds_unlocked = true;
    order.status = 'COMPLETED_BY_ADMIN';
    await order.save();

    await messages.successCompleteOrderByAdminMessages(bot, order, buyer, seller, i18nCtxBuyer, i18nCtxSeller);

  } else {

    // Save updated state first, then publish messages.
    order.funds_unlocked = true;
    order.status = 'RELEASED';
    await order.save();

    await messages.fundsReleasedMessages(bot, order, seller, buyer, i18nCtxBuyer, i18nCtxSeller);

    await handleReputationItems(buyer, seller, order);
    await messages.rateUserMessage(bot, buyer, order, i18nCtxBuyer);
    await messages.rateUserMessage(bot, seller, order, i18nCtxSeller);

    // If this is a range order, probably we need to created a new child range order
    const orderData = await ordersActions.getNewRangeOrderPayload(order);
    let i18nCtx;
    if (orderData) {
      let user;
      if (order.type === 'sell') {
        user = seller;
        i18nCtx = i18nCtxSeller;
      } else {
        user = buyer;
        i18nCtx = i18nCtxBuyer;
        orderData.walletAddress = order.buyer_address;
      }

      const newOrder = await ordersActions.createOrder(
        i18nCtx,
        bot,
        user,
        orderData
      );

      if (newOrder) {
        if (order.type === 'sell') {
          await messages.publishSellOrderMessage(
            bot,
            user,
            newOrder,
            i18nCtx,
            true
          );
        } else {
          await messages.publishBuyOrderMessage(
            bot,
            user,
            newOrder,
            i18nCtx,
            true
          );
        }
      }
    }
  }

};

const processRefundedOrder = async (bot, order, refundedByAdmin) => {
  if (!refundedByAdmin) {
    // If the seller initiated the refund, we just update the state.
    order.funds_unlocked = true;
    await order.save();  
    return;
  }

  // We look for a dispute for this order
  const dispute = await Dispute.findOne({ order_id: order._id });
  if (dispute) {
    dispute.status = 'ADMIN_REFUNDED';
    await dispute.save();
  }

  const buyer = await User.findOne({ _id: order.buyer_id });
  const seller = await User.findOne({ _id: order.seller_id });
  const i18nCtxBuyer = await getUserI18nContext(buyer);
  const i18nCtxSeller = await getUserI18nContext(seller);

  // Save updated state first, then publish messages.
  order.funds_unlocked = true;
  order.status = 'CANCELED_BY_ADMIN';
  await order.save();

  await messages.successCancelOrderByAdminMessages(bot, order, buyer, seller, i18nCtxBuyer, i18nCtxSeller);

};

module.exports = syncEscrowedOrders;
