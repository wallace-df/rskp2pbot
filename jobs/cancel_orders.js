const { User, Order } = require('../models');
const { cancelAddWalletAddress, cancelLockTokensRequest } = require('../bot/commands');
const messages = require('../bot/messages');
const { getUserI18nContext,  acquireOrdersLock, releaseOrdersLock } = require('../util');
const logger = require('../logger');

const cancelOrders = async bot => {
  try {

    // We don't want to run together with other tasks that update the order status.
    //
    // In special, we want  avoid cases like:
    // (1) Seller locks tokens in escrow.
    // (2) The cancel job runs before the escrow job, giving the seller the option to get a refund.
    // (3) The sync escrow runs in parallel, sees that the order hasn't been cancelled yet and informs the buyer to go on with the trade.
    // 
    // In the scenario above, the seller could trick the buyer for sending fiat, while also holding the power to refund tokens.
    // We want either the refund option available for the seller, or the option to go on with the trade.
    //
    if (!acquireOrdersLock()) {
      return;
    }

    const takenTimeThreshold = new Date();
    takenTimeThreshold.setSeconds(takenTimeThreshold.getSeconds() - parseInt(process.env.PAYMENT_EXPIRATION_WINDOW));
    // We get the orders where the seller didn't lock the tokens 
    // or where the buyer didn't add the wallet address before the timeout
    const waitingOrders = await Order.find({
      $or: [{ status: 'WAITING_PAYMENT' }, { status: 'WAITING_BUYER_ADDRESS' }],
      taken_at: { $lte: takenTimeThreshold },
    });
    for (const order of waitingOrders) {
      if (order.status === 'WAITING_PAYMENT') {
        await cancelLockTokensRequest(null, bot, order, false);
      } else if(order.status === 'WAITING_BUYER_ADDRESS') {
        await cancelAddWalletAddress(null, bot, order, false);
      }
    }
    // We get orders where the seller locked the tokens but never released them.
    const orderTime = new Date();
    orderTime.setSeconds(orderTime.getSeconds() - parseInt(process.env.ORDER_EXPIRATION_WINDOW));
    const activeOrders = await Order.find({
      tokens_held_at: { $lte: orderTime },
      $or: [
        {
          status: 'ACTIVE',
        },
        {
          status: 'FIAT_SENT',
        }
      ],
      admin_warned: false,
    });
    for (const order of activeOrders) {
      const buyerUser = await User.findOne({ _id: order.buyer_id });
      const sellerUser = await User.findOne({ _id: order.seller_id });
      const i18nCtxBuyer = await getUserI18nContext(buyerUser);
      const i18nCtxSeller = await getUserI18nContext(sellerUser);

      // We send messages about the expired order to each party
      await messages.toBuyerExpiredOrderMessage(bot, order, buyerUser, i18nCtxBuyer);
      await messages.toSellerExpiredOrderMessage(bot, order, sellerUser, i18nCtxSeller);

      // Instead of cancel this order we should send this to the admins
      // and they decide what to do
      await messages.expiredOrderMessage(bot, order, buyerUser, sellerUser, i18nCtxBuyer);

      // It is okay to save the state after publishing the messages above.
      // In the worst case, users will simply get an extra reminder.
      order.admin_warned = true;
      await order.save();
    }
  } catch (error) {
    logger.error(error);
  } finally {
    releaseOrdersLock();
  }
};

module.exports = cancelOrders;
