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

  if (order.buyer_address.toLowerCase() !== escrow.buyerAddress.toLowerCase()) {
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

const escrowOrders = async bot => {

  try {

    // We don't want to run together with other tasks that update the order status.
    //
    // In special, we want  avoid cases like:
    // (1) Seller locks tokens in escrow.
    // (2) The cancel job runs before the escrow job, giving the seller the option to get a refund.
    // (3) The escrow jobs runsin parallel, sees that the order hasn't been cancelled yet and informs the buyer to go on with the trade.
    // 
    // In the scenario above, the seller could trick the buyer for sending fiat, while also holding the power to refund tokens.
    // We want either the refund option available for the seller, or the option to go on with the trade.
    //
    if (!acquireOrdersLock()) {
      return;
    }

    // We get the orders where the seller must lock tokens before continuing.
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
        
        const buyerUser = await User.findOne({ _id: order.buyer_id });
        const sellerUser = await User.findOne({ _id: order.seller_id });
        
        // This is the i18n context we need to pass to the message
        const i18nCtxBuyer = await getUserI18nContext(buyerUser);
        const i18nCtxSeller = await getUserI18nContext(sellerUser);

        if (order.type === 'sell') {
          await messages.onGoingTakeSellMessage(
            bot,
            sellerUser,
            buyerUser,
            order,
            i18nCtxBuyer,
            i18nCtxSeller
          );
      
        } else if (order.type === 'buy') {
          // FIXME: handle.
        }

      } catch(err) {
        logger.warning(err);
      }
    }

    // We get the orders where the seller tokens have been locked but not released yet.
    const lockedOrders = await Order.find({
      $or: [{ status: 'ACTIVE' }, { status: 'FIAT_SENT' }, { status: 'DISPUTE' }]
    });

    for (const order of lockedOrders) {
      try {
        let released = false;
        let escrow = await rskEscrowContract.orderById(order._id.toString());
        if (escrow.status === 2 && isMatchingOrder(order, escrow)) {
          released = true;
        }
  
        if (!released) {
          continue;
        }
  
        // We look for a dispute for this order
        const dispute = await Dispute.findOne({ order_id: order._id });
        if (dispute) {
          dispute.status = 'RELEASED';
          await dispute.save();
        } 
  
        // Save updated state first, then publish messages.
        order.status = 'RELEASED';
        await order.save();
  
        const buyerUser = await User.findOne({ _id: order.buyer_id });
        const sellerUser = await User.findOne({ _id: order.seller_id });
  
        // We need two i18n contexts to send messages to each user
        const i18nCtxBuyer = await getUserI18nContext(buyerUser);
        const i18nCtxSeller = await getUserI18nContext(sellerUser);
        await messages.fundsReleasedMessages(bot, sellerUser, buyerUser, i18nCtxBuyer, i18nCtxSeller);
  
        //await handleReputationItems(buyerUser, sellerUser, order.amount);
        await messages.rateUserMessage(bot, buyerUser, order, i18nCtxBuyer);
        await messages.rateUserMessage(bot, sellerUser, order, i18nCtxSeller);
  
        // If this is a range order, probably we need to created a new child range order
        const orderData = await ordersActions.getNewRangeOrderPayload(order);
        let i18nCtx;
        if (orderData) {
          let user;
          if (order.type === 'sell') {
            user = sellerUser;
            i18nCtx = i18nCtxSeller;
          } else {
            user = buyerUser;
            i18nCtx = i18nCtxBuyer;
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
  
      } catch(err) {
        logger.warning(err);
      }
    }

  } catch (error) {
    logger.error(error);
  } finally {
    releaseOrdersLock();
  }
};

module.exports = escrowOrders;
