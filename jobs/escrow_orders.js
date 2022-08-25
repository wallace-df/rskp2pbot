const { User, Order, Dispute } = require('../models');
const messages = require('../bot/messages');
const ordersActions = require('../bot/ordersActions');
const { handleReputationItems, getUserI18nContext, getToken } = require('../util');
const { ethers } = require("ethers");
const BN = require('bn.js');
const logger = require('../logger');

const rskEscrowContract = new ethers.Contract(
  process.env.RSK_ESCROW_CONTRACT,  
  require("../contracts/abis/RSKEscrow.json"),
  new ethers.providers.JsonRpcProvider(process.env.RSK_PROVIDER)
);

let running = false;


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

  if (("0x" + order.buyer_hash.toLowerCase()) !== escrow.buyerHash.toLowerCase()) {
    return false;
  }

  if (("0x" + order.seller_hash.toLowerCase()) !== escrow.sellerHash.toLowerCase()) {
    return false;
  }

  if (new BN(order.amount).toString() !== escrow.amount.toString()) {
    return false;
  }

  if (new BN(order.fee).toString() !== escrow.fee.toString()) {
    return false;
  }

  return true;


}

const escrowOrders = async bot => {

  try {

    if(running) {
      return;
    }

    running = true;

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
        
        const buyerUser = await User.findOne({ _id: order.buyer_id });
        const sellerUser = await User.findOne({ _id: order.seller_id });
        
        // This is the i18n context we need to pass to the message
        const i18nCtxBuyer = await getUserI18nContext(buyerUser);
        const i18nCtxSeller = await getUserI18nContext(sellerUser);

        order.status = 'ACTIVE';
        order.tokens_held_at = Date.now();
        order.save();

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
  
        order.status = 'RELEASED';
        await order.save();
  
  
        const buyerUser = await User.findOne({ _id: order.buyer_id });
        const sellerUser = await User.findOne({ _id: order.seller_id });
  
        // We need two i18n contexts to send messages to each user
        const i18nCtxBuyer = await getUserI18nContext(buyerUser);
        const i18nCtxSeller = await getUserI18nContext(sellerUser);
        await messages.fundsReleasedMessages(bot, sellerUser, buyerUser, i18nCtxBuyer, i18nCtxSeller);
  
        await handleReputationItems(buyerUser, sellerUser, order.amount);
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
    running = false;
  }
};

module.exports = escrowOrders;
