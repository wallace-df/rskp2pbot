const { cancelHoldInvoice } = require('../ln');
const { User, Order } = require('../models');
const { cancelShowHoldInvoice, cancelAddWalletAddress } = require('../bot/commands');
const messages = require('../bot/messages');
const { getUserI18nContext } = require('../util');
const logger = require('../logger');

const cancelOrders = async bot => {
  try {
    const holdInvoiceTime = new Date();
    holdInvoiceTime.setSeconds(
      holdInvoiceTime.getSeconds() -
        parseInt(process.env.HOLD_INVOICE_EXPIRATION_WINDOW)
    );
    // We get the orders where the seller didn't lock the tokens 
    // or where the buyer didn't add the wallet address before the timeout
    const waitingPaymentOrders = await Order.find({
      $or: [{ status: 'WAITING_PAYMENT' }, { status: 'WAITING_BUYER_ADDRESS' }],
      taken_at: { $lte: holdInvoiceTime },
    });
    for (const order of waitingPaymentOrders) {
      await cancelHoldInvoice({ hash: order.hash });
      if (order.status === 'WAITING_PAYMENT') {
        await cancelShowHoldInvoice(null, bot, order);
      } else {
        await cancelAddWalletAddress(null, bot, order);
      }
    }
    // We get the expired order where the seller sent the sats but never released the order
    // In this case we use another time field, `invoice_held_at` is the time when the
    // seller sent the money to the hold invoice, this is an important moment cause
    // we don't want to have a CLTV timeout
    const orderTime = new Date();
    orderTime.setSeconds(
      orderTime.getSeconds() - parseInt(process.env.ORDER_EXPIRATION_WINDOW)
    );
    const activeOrders = await Order.find({
      invoice_held_at: { $lte: orderTime },
      $or: [
        {
          // status: 'ACTIVE',
          status: 'FIAT_SENT',
        },
      ],
      admin_warned: false,
    });
    for (const order of activeOrders) {
      const buyerUser = await User.findOne({ _id: order.buyer_id });
      const sellerUser = await User.findOne({ _id: order.seller_id });
      const i18nCtxBuyer = await getUserI18nContext(buyerUser);
      const i18nCtxSeller = await getUserI18nContext(sellerUser);
      // Instead of cancel this order we should send this to the admins
      // and they decide what to do
      await messages.expiredOrderMessage(
        bot,
        order,
        buyerUser,
        sellerUser,
        i18nCtxBuyer
      );
      // We send messages about the expired order to each party
      await messages.toBuyerExpiredOrderMessage(bot, buyerUser, i18nCtxBuyer);
      await messages.toSellerExpiredOrderMessage(
        bot,
        sellerUser,
        i18nCtxSeller
      );
      order.admin_warned = true;
      await order.save();
    }
  } catch (error) {
    logger.error(error);
  }
};

module.exports = cancelOrders;
