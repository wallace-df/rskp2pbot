const {
  validateSeller,
  validateObjectId,
  validateTakeBuyOrder,
  validateTakeSellOrder,
  validateUserWaitingOrder,
  isBannedFromCommunity,
  validateFiatSentOrder,
  validateReleaseOrder,
  validateRefundOrder
} = require('./validations');
const { Order, User, Dispute } = require('../models');
const messages = require('./messages');
const {
  getTokenAmountFromMarketPrice,
  extractId,
  deleteOrderFromChannel,
  getUserI18nContext,
  getFee,
  getEmojiRate,
  decimalRound,
} = require('../util');
const ordersActions = require('./ordersActions');
const crypto = require('crypto');
const logger = require('../logger');

let takeOrderLock = {};

const takebuy = async (ctx, bot) => {
  const text = ctx.update.callback_query.message.text;
  if (!text) return;

  let orderId = extractId(text);
  if (!orderId) return;

  const { user } = ctx;

  // If there's some parallel request for taking this over, do not go on.
  if (takeOrderLock[orderId]) {
    await messages.alreadyTakenOrderMessage(ctx, bot, user);
    return;
  }

  try {
    if (!(await validateUserWaitingOrder(ctx, bot, user))) return;

    // Sellers with orders in status = FIAT_SENT, have to solve the order
    const isOnFiatSentStatus = await validateSeller(ctx, user);
    if (!isOnFiatSentStatus) return;

    if (!(await validateObjectId(ctx, orderId))) return;

    const order = await Order.findOne({ _id: orderId });
    if (!order) return;

    // We verify if the user is not banned on this community
    if (await isBannedFromCommunity(user, order.community_id))
      return await messages.bannedUserErrorMessage(ctx, user);

    if (!(await validateTakeBuyOrder(ctx, bot, user, order))) return;

    // Do not allow the same order ID to be took in parallel by several users.
    takeOrderLock[orderId] = true;

    // Save the updated state first, then publish messages.
    order.status = 'WAITING_PAYMENT';
    order.seller_id = user._id;
    order.taken_at = Date.now();
    await order.save();

    // We delete the messages related to that order from the channel
    await deleteOrderFromChannel(order, bot.telegram);
    await messages.beginTakeBuyMessage(ctx, bot, user, order);
  } catch (error) {
    logger.error(error);
  } finally {
    // Release lock.
    takeOrderLock[orderId] = false;
  }
};

const takesell = async (ctx, bot) => {
  const text = ctx.update.callback_query.message.text;
  if (!text) return;

  const orderId = extractId(text);
  if (!orderId) return;

  const { user } = ctx;

  // If there's some parallel request for taking this over, do not go on.
  if (takeOrderLock[orderId]) {
    await messages.alreadyTakenOrderMessage(ctx, bot, user);
    return;
  }
  
  try {
    if (!(await validateUserWaitingOrder(ctx, bot, user))) return;

    const order = await Order.findOne({ _id: orderId });
    if (!order) return;

    // We verify if the user is not banned on this community
    if (await isBannedFromCommunity(user, order.community_id))
      return await messages.bannedUserErrorMessage(ctx, user);

    if (!(await validateTakeSellOrder(ctx, bot, user, order))) return;

    // Do not allow the same order ID to be took in parallel by several users.
    takeOrderLock[orderId] = 1;

    // Save the updated state first, then publish messages.
    order.status = 'WAITING_BUYER_ADDRESS';
    order.buyer_id = user._id;
    order.taken_at = Date.now();
    await order.save();

    // We delete the messages related to that order from the channel
    await deleteOrderFromChannel(order, bot.telegram);
    await messages.beginTakeSellMessage(ctx, bot, user, order);
  } catch (error) {
    logger.error(error);
  } finally {
    // Release lock.
    takeOrderLock[orderId] = false;
  }
};

const waitPayment = async (ctx, bot, buyer, seller, order, buyerAddress) => {
  try {
    // If there is not fiat amount the function don't do anything
    if (order.fiat_amount === undefined) {
      logger.debug(
        `waitPayment: fiat_amount === undefined, User Id ${ctx.user.id} order Id: ${order.id}`
      );
      return;
    }

    const i18nCtxSeller = await getUserI18nContext(seller);

    let buyerSecret = crypto.randomBytes(32);
    let sellerSecret = crypto.randomBytes(32);
    
    order.buyer_address = buyerAddress;
    order.buyer_secret = buyerSecret.toString('hex');
    order.buyer_hash = crypto.createHash('sha256').update(buyerSecret).digest('hex');
    order.seller_secret = sellerSecret.toString('hex');
    order.seller_hash = crypto.createHash('sha256').update(sellerSecret).digest('hex');
    order.taken_at = Date.now();
    order.status = 'WAITING_PAYMENT';

    // Save the updated state first, then publish messages.
    await order.save();

    // We need the buyer rate
    const buyer = await User.findById(order.buyer_id);
    const stars = getEmojiRate(buyer.total_rating);
    const rating = `${stars} (${buyer.total_reviews} ${buyer.total_reviews === 1 ? 'review' : 'reviews'})`;

    await messages.lockTokensForSellOrderMessage(ctx, seller, order, i18nCtxSeller, rating);
    await messages.takeSellWaitingSellerToPayMessage(ctx, bot, buyer, order);
    
  } catch (error) {
    logger.error(`Error in waitPayment: ${error}`);
  }
};

const addWalletAddress = async (ctx, bot, order) => {
  try {
    ctx.deleteMessage();
    ctx.scene.leave();
    if (!order) {
      const orderId = ctx.update.callback_query.message.text;
      if (!orderId) return;
      order = await Order.findOne({ _id: orderId });
      if (!order) return;
    }

    // Buyers only can take orders with status WAITING_BUYER_ADDRESS
    if (order.status !== 'WAITING_BUYER_ADDRESS') {
      return;
    }

    const buyer = await User.findOne({ _id: order.buyer_id });

    if (order.fiat_amount === undefined) {
      ctx.scene.enter('ADD_FIAT_AMOUNT_WIZARD_SCENE_ID', {
        bot,
        order,
        caller: buyer,
      });
      return;
    }

    if (order.amount === '0') {
      order.amount = await getTokenAmountFromMarketPrice(order.fiat_code, order.fiat_amount, order.token_code, order.price_margin);
    }

    // If the price API fails we can't continue with the process
    if (order.amount === '0') {
      await messages.priceApiFailedMessage(ctx, bot, buyer);
      return;
    }

    order.fee = await getFee(order.amount);

    // Save the updated state first, then publish messages.
    await order.save();

    const seller = await User.findOne({ _id: order.seller_id });
    ctx.scene.enter('ADD_WALLET_ADDRESS_WIZARD_SCENE_ID', {
      order,
      seller,
      buyer,
      bot,
    });

  } catch (error) {
    logger.error(error);
  }
};

const cancelAddWalletAddress = async (ctx, bot, order, userAction) => {
  try {
    if (ctx) {
      ctx.deleteMessage();
      ctx.scene.leave();
    }
    if (!order) {
      const orderId = !!ctx && ctx.update.callback_query.message.text;
      if (!orderId) return;
      order = await Order.findOne({ _id: orderId });
      if (!order) return;
    }

    const buyer = await User.findOne({ _id: order.buyer_id });
    const seller = await User.findOne({ _id: order.seller_id });

    if (!seller || !buyer) {
      return;
    }

    if (order.status !== 'WAITING_BUYER_ADDRESS') {
      return;
    }

    const i18nCtxBuyer = await getUserI18nContext(buyer);

    // Re-publish order
    if (userAction) {
      logger.info(
        `Buyer Id: ${buyer.id} cancelled Order Id: ${order._id}, republishing to the channel`
      );
    } else {
      logger.info(
        `Order Id: ${order._id} expired, republishing to the channel`
      );
    }

    republishOrder(bot, order, buyer, seller);

    if (!userAction) {
      await messages.toBuyerDidntAddWalletAddressMessage(bot, buyer, order, i18nCtxBuyer);
      await messages.toAdminChannelBuyerDidntAddWalletAddressMessage(bot, buyer, order, i18nCtxBuyer);
    } else {
      await messages.successCancelOrderMessage(ctx, buyer, order, i18nCtxBuyer);
    }
  } catch (error) {
    logger.error(error);
  }
};

const lockTokensRequest = async (ctx, bot, order) => {
  try {
    ctx.deleteMessage();
    if (!order) {
      const orderId = ctx.update.callback_query.message.text;
      if (!orderId) return;
      order = await Order.findOne({ _id: orderId });
      if (!order) return;
    }

    const user = await User.findOne({ _id: order.seller_id });
    if (!user) return;

    const i18nCtx = await getUserI18nContext(user);

    // Sellers only can take orders with status WAITING_PAYMENT
    if (order.status !== 'WAITING_PAYMENT') {
      return;
    }

    if (order.fiat_amount === undefined) {
      ctx.scene.enter('ADD_FIAT_AMOUNT_WIZARD_SCENE_ID', {
        bot,
        order,
        caller: user,
      });
      return;
    }
    
    if (order.amount === '0') {
      order.amount = await getTokenAmountFromMarketPrice(order.fiat_code, order.fiat_amount, order.token_code, order.price_margin);
    }

    // If the price API fails we can't continue with the process
    if (order.amount === '0') {
      await messages.priceApiFailedMessage(ctx, bot, buyer);
      return;
    }

    order.fee = await getFee(order.amount);

    let buyerSecret = crypto.randomBytes(32);
    let sellerSecret = crypto.randomBytes(32);
    
    order.buyer_secret = buyerSecret.toString('hex');
    order.buyer_hash = crypto.createHash('sha256').update(buyerSecret).digest('hex');
    order.seller_secret = sellerSecret.toString('hex');
    order.seller_hash = crypto.createHash('sha256').update(sellerSecret).digest('hex');
    order.taken_at = Date.now();
    order.status = 'WAITING_PAYMENT';

    // Save the updated state first, then publish messages.
    await order.save(); 

    await messages.lockTokensForBuyOrderMessage(ctx, user, order, i18nCtx);
  } catch (error) {
    logger.error(`Error in lockTokensRequest: ${error}`);
  }
};

const cancelLockTokensRequest = async (ctx, bot, order, userAction) => {
  try {
    if (ctx) {
      ctx.deleteMessage();
      ctx.scene.leave();
    }
    if (!order) {
      const orderId = !!ctx && ctx.update.callback_query.message.text;
      if (!orderId) return;
      order = await Order.findOne({ _id: orderId });
      if (!order) return;
    }

    const seller = await User.findOne({ _id: order.seller_id });
    const buyer = await User.findOne({ _id: order.buyer_id });

    if (!seller || !buyer) {
      return;
    }

    if (order.status !== 'WAITING_PAYMENT') {
      return;
    }

    const i18nCtxBuyer = await getUserI18nContext(buyer);
    const i18nCtxSeller = await getUserI18nContext(seller);

    // Save the updated state first, then publish messages.
    order.status = 'CANCELED';
    await order.save();

    if (order.type === 'buy') {
      // Re-publish order
      if (userAction) {
        logger.info(
          `Seller Id: ${seller.id} cancelled Order Id: ${order._id}, republishing to the channel`
        );
      } else {
        logger.info(
          `Order Id: ${order._id} expired, republishing to the channel`
        );
      }

      republishOrder(bot, order, buyer, seller);

      if (!userAction) {
        await messages.toSellerDidntLockTokensMessage(bot, seller, order, i18nCtxSeller);
        await messages.toAdminChannelSellerDidntLockTokensMessage(bot, seller, order, i18nCtxSeller);
      } else {
        await messages.successCancelOrderMessage(ctx, seller, order, i18nCtxSeller);
      }

    } else {
      await messages.toSellerDidntLockTokensMessage(bot, seller, order, i18nCtxSeller);
      await messages.toBuyerSellerDidntLockTokensMessage(bot, buyer, order, i18nCtxBuyer);
      await messages.toAdminChannelSellerDidntLockTokensMessage(bot, seller, order, i18nCtxSeller);
    }

  } catch (error) {
    logger.error(error);
  }
};

const cancelOrder = async (ctx, bot, orderId, user) => {
  try {
    if (!user) {
      const tgUser = ctx.update.callback_query.from;
      if (!tgUser) return;

      user = await User.findOne({ tg_id: tgUser.id });

      // If user didn't initialize the bot we can't do anything
      if (!user) return;
    }
    if (user.banned) return await messages.bannedUserErrorMessage(ctx, user);
    const order = await ordersActions.getOrder(ctx, user, orderId);

    if (!order) return;

    if (order.status === 'PENDING') {

      // Save the updated state first, then publish messages.
      // No need for locks here, since no funds have been put under escrow for PENDING orders.
      order.status = 'CLOSED';
      order.canceled_by = user._id;
      await order.save();

      // We delete the messages related to that order from the channel
      await deleteOrderFromChannel(order, ctx.telegram);

      // we sent a private message to the user
      return await messages.successCancelOrderMessage(ctx, user, order, ctx.i18n);
    }

    // If a buyer is taking a sell offer and accidentally touches continue button, we let the user to cancel it.
    if (order.buyer_id == user._id && order.type === 'sell' && order.status === 'WAITING_BUYER_ADDRESS') {
      return await cancelAddWalletAddress(ctx, bot, order, true);
    }

    // If a seller is taking a buy offer and accidentally touches continue button, we let the user to cancel it.
    if (order.seller_id == user._id && order.type === 'buy' && order.status === 'WAITING_PAYMENT') {
      return await cancelLockTokensRequest(ctx, bot, order, true);
    }

    if (
      !(
        order.status === 'ACTIVE' ||
        order.status === 'FIAT_SENT' ||
        order.status === 'DISPUTE'
      )
    )
      return await messages.badStatusOnCancelOrderMessage(ctx);

    // If the order is active we start a cooperative cancellation
    let counterPartyUser, initiator, counterParty;

    const initiatorUser = user;
    if (initiatorUser._id == order.buyer_id) {
      counterPartyUser = await User.findOne({ _id: order.seller_id });
      initiator = 'buyer';
      counterParty = 'seller';
    } else {
      counterPartyUser = await User.findOne({ _id: order.buyer_id });
      initiator = 'seller';
      counterParty = 'buyer';
    }

    if (order[`${initiator}_cooperativecancel`])
      return await messages.shouldWaitCooperativeCancelMessage(
        ctx,
        initiatorUser
      );

    // Save updated state first, then publish messages.
    order[`${initiator}_cooperativecancel`] = true;
    await order.save();

    const i18nCtxCP = await getUserI18nContext(counterPartyUser);
    // If the counter party already requested a cooperative cancel order
    if (order[`${counterParty}_cooperativecancel`]) {

      // Save updated state first, then publish messages.
      // No need for locks here, since the only other possible states here will come from escrow actions which will
      // unlock hunds held on escrow.
      order.status = 'CANCELED';
      await order.save();

      let seller = initiatorUser;
      let i18nCtxSeller = ctx.i18n;
      if (order.seller_id == counterPartyUser._id) {
        seller = counterPartyUser;
        i18nCtxSeller = i18nCtxCP;
      }
      // We sent a private message to the users
      await messages.successCancelOrderMessage(
        ctx,
        initiatorUser,
        order,
        ctx.i18n
      );
      await messages.okCooperativeCancelMessage(
        ctx,
        counterPartyUser,
        order,
        i18nCtxCP
      );
      await messages.refundCooperativeCancelMessage(ctx, order, seller, i18nCtxSeller);
      logger.info(`Order ${order._id} was cancelled!`);
    } else {
      await messages.initCooperativeCancelMessage(ctx, order);
      await messages.counterPartyWantsCooperativeCancelMessage(
        ctx,
        counterPartyUser,
        order,
        i18nCtxCP
      );
    }
  } catch (error) {
    logger.error(error);
  }
};

const fiatSent = async (ctx, orderId, buyer) => {
  try {
    if (!buyer) {
      const tgUser = ctx.update.callback_query.from;
      if (!tgUser) return;

      buyer = await User.findOne({ tg_id: tgUser.id });

      // If user didn't initialize the bot we can't do anything
      if (!buyer) return;
    }
    if (buyer.banned) return await messages.bannedUserErrorMessage(ctx, buyer);
    const order = await validateFiatSentOrder(ctx, buyer, orderId);
    if (!order) return;

    // Save updated state first, then publish messages.
    order.status = 'FIAT_SENT';
    const seller = await User.findOne({ _id: order.seller_id });
    await order.save();

    // We sent messages to both parties
    // We need to create i18n context for each user
    const i18nCtxBuyer = await getUserI18nContext(buyer);
    const i18nCtxSeller = await getUserI18nContext(seller);
    await messages.fiatSentMessages(ctx, buyer, seller, order, i18nCtxBuyer, i18nCtxSeller);
  } catch (error) {
    logger.error(error);
  }
};

const release = async (ctx, orderId, user) => {
  try {
    if (!user) {
      const tgUser = ctx.update.callback_query.from;
      if (!tgUser) return;

      user = await User.findOne({ tg_id: tgUser.id });

      // If user didn't initialize the bot we can't do anything
      if (!user) return;
    }
    if (user.banned) return await messages.bannedUserErrorMessage(ctx, user);
    const order = await validateReleaseOrder(ctx, user, orderId);
    if (!order) return;

    await messages.releaseInstructionsMessage(ctx, user, order);
  } catch (error) {
    logger.error(error);
  }
};

const refund = async (ctx, orderId, user) => {
  try {
    if (!user) {
      const tgUser = ctx.update.callback_query.from;
      if (!tgUser) return;

      user = await User.findOne({ tg_id: tgUser.id });

      // If user didn't initialize the bot we can't do anything
      if (!user) return;
    }
    const order = await validateRefundOrder(ctx, user, orderId);
    if (!order) return;

    await messages.refundInstructionsMessage(ctx, user, order);
  } catch (error) {
    logger.error(error);
  }
};

const rateUser = async (ctx, bot, rating, orderId) => {
  try {
    ctx.deleteMessage();
    ctx.scene.leave();
    const callerId = ctx.from.id;

    if (!orderId) return;
    const order = await Order.findOne({ _id: orderId });

    if (!order) return;
    const buyer = await User.findOne({ _id: order.buyer_id });
    const seller = await User.findOne({ _id: order.seller_id });

    let targetUser = buyer;
    if (callerId == buyer.tg_id) {
      targetUser = seller;
    }

    // User can only rate other after a successful exchange
    if (order.status !== 'RELEASED') {
      await messages.invalidDataMessage(ctx, bot, targetUser);
      return;
    }

    await saveUserReview(targetUser, rating);
  } catch (error) {
    logger.error(error);
  }
};

const saveUserReview = async (targetUser, rating) => {
  try {
    let totalReviews = targetUser.total_reviews
      ? targetUser.total_reviews
      : targetUser.reviews.length;
    totalReviews++;

    const oldRating = targetUser.total_rating;
    let lastRating = targetUser.reviews.length
      ? targetUser.reviews[targetUser.reviews.length - 1].rating
      : rating;

    lastRating = targetUser.last_rating ? targetUser.last_rating : lastRating;

    // newRating is an average of all the ratings given to the user.
    // Its formula is based on the iterative method to compute mean,
    // as in:
    // https://math.stackexchange.com/questions/2148877/iterative-calculation-of-mean-and-standard-deviation
    const newRating = oldRating + (lastRating - oldRating) / totalReviews;
    targetUser.total_rating = newRating;
    targetUser.last_rating = rating;
    targetUser.total_reviews = totalReviews;

    await targetUser.save();
  } catch (error) {
    logger.error(error);
  }
};

async function republishOrder(bot, order, buyer, seller) {

  const i18nCtxBuyer = await getUserI18nContext(buyer);
  const i18nCtxSeller = await getUserI18nContext(seller);

  order.taken_at = null;
  order.status = 'PENDING';
  if (!!order.min_fiat_amount && !!order.max_fiat_amount) {
    order.fiat_amount = undefined;
  }
  if (order.price_from_api) {
    order.amount = '0';
    order.fee = 0;
  }

  order.buyer_hash = null;
  order.buyer_secret = null;
  order.seller_hash = null;
  order.seller_secret = null;

  if (order.type === 'buy') {
    order.seller_id = null;
  } else {
    order.buyer_id = null;
  }

  order.tg_channel_message1 = null;
  
  // Save the updated state first, then publish messages.
  if (order.type === 'sell') {
    await order.save();
  } else {
    let orderData = {...order._doc};
    delete orderData['_id'];
    order = new Order(orderData);
    await order.save();
  }

  // Then publish the messages.
  if (order.type === 'buy') {
    await messages.publishBuyOrderMessage(bot, buyer, order, i18nCtxBuyer);
  } else {
    await messages.publishSellOrderMessage(bot, seller, order, i18nCtxSeller);
  }

};


module.exports = {
  takebuy,
  takesell,
  addWalletAddress,
  cancelAddWalletAddress,
  lockTokensRequest,
  cancelLockTokensRequest,
  waitPayment,
  rateUser,
  saveUserReview,
  cancelOrder,
  fiatSent,
  release,
  refund
};
