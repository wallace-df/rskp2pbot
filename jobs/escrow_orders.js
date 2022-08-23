const { User, Order, Dispute } = require('../models');
const messages = require('../bot/messages');
const ordersActions = require('../bot/ordersActions');
const { handleReputationItems, getUserI18nContext } = require('../util');
const logger = require('../logger');

const escrowOrders = async bot => {
  try {
    // We get the orders where the seller must lock tokens before continuing.
    const waitingOrders = await Order.find({
      $or: [{ status: 'WAITING_PAYMENT' }]
    });

    for (const order of waitingOrders) {
      // FIXME: do web3 call to check if the seller has locked tokens for this order.
      const locked = true;
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

    }

    // We get the orders where the seller tokens have been locked but not released yet.
    const lockedOrders = await Order.find({
      $or: [{ status: 'ACTIVE' }, { status: 'FIAT_SENT' }, { status: 'DISPUTE' }]
    });

    for (const order of lockedOrders) {
      // FIXME: do web3 call to check if the seller has locked tokens for this order.
      const released = true;
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
    }
  } catch (error) {
    logger.error(error);
  }
};

module.exports = escrowOrders;
