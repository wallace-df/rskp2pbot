const { ObjectId } = require('mongoose').Types;
const messages = require('./messages');
const { Order, User, Community } = require('../models');
const { isIso4217, isDisputeSolver, getToken, toBaseUnit, isAddress } = require('../util');
const logger = require('../logger');

// We look in database if the telegram user exists,
// if not, it creates a new user
const validateUser = async (ctx, start) => {
  try {
    const tgUser = ctx.update.callback_query
      ? ctx.update.callback_query.from
      : ctx.update.message.from;
    let user = await User.findOne({ tg_id: tgUser.id });

    if (!user && start) {
      user = new User({
        tg_id: tgUser.id,
        username: tgUser.username,
        lang: ctx.i18n.locale(),
      });
      await user.save();
    } else if (!user) {
      return false;
    } else if (user.banned) {
      await messages.bannedUserErrorMessage(ctx, user);

      return false;
    }
    if (tgUser.username !== user.username) {
      user.username = tgUser.username;
      await user.save();
    }

    return user;
  } catch (error) {
    logger.error(error);
    return false;
  }
};

const validateAdmin = async (ctx, id) => {
  try {
    const tgUserId = id || ctx.update.message.from.id;
    const user = await User.findOne({ tg_id: tgUserId });
    if (!user) return await messages.notAuthorized(ctx);

    let community = null;
    if (user.default_community_id)
      community = await Community.findOne({ _id: user.default_community_id });

    const isSolver = isDisputeSolver(community, user);

    if (!user.admin && !isSolver) return await messages.notAuthorized(ctx);

    return user;
  } catch (error) {
    logger.error(error);
    return false;
  }
};

const validateSellOrder = async ctx => {
  try {
    const args = ctx.state.command.args;
    if (args.length < 5) {
      await messages.sellOrderCorrectFormatMessage(ctx);
      return false;
    }

    let [amount, tokenCode, fiatAmount, fiatCode, paymentMethod, priceMargin] = args;

    if (priceMargin && isNaN(priceMargin)) {
      await ctx.reply(
        ctx.i18n.t('must_be_numeric', {
          fieldName: ctx.i18n.t('premium_discount'),
        })
      );
      return false;
    }

    let token = getToken(tokenCode.toUpperCase());
    if (!token) {
      await messages.mustBeValidToken(ctx);
      return false;
    }

    try {
      amount = toBaseUnit(amount, token.decimals).toString();
    } catch(err) {
      console.log(err);
      await ctx.reply(ctx.i18n.t('invalid_amount'));
      return false;
    }

    // for ranges like 100--2, the result will be [100, 0, 2]
    fiatAmount = fiatAmount.split('-');
    fiatAmount = fiatAmount.map(Number);

    if (fiatAmount.length === 2 && amount !== '0') {
      await messages.invalidRangeWithAmount(ctx);
      return false;
    }

    // ranges like [100, 0, 2] (originate from ranges like 100--2)
    // will make this conditional fail
    if (fiatAmount.length > 2) {
      await messages.mustBeANumberOrRange(ctx);
      return false;
    }

    if (fiatAmount.length === 2 && fiatAmount[1] <= fiatAmount[0]) {
      await messages.mustBeANumberOrRange(ctx);
      return false;
    }

    if (fiatAmount.some(isNaN)) {
      await messages.mustBeANumberOrRange(ctx);
      return false;
    }

    if (fiatAmount.some(x => x < 1)) {
      await messages.mustBeGreatherEqThan(ctx, 'monto_en_fiat', 1);
      return false;
    }

    if (!isIso4217(fiatCode)) {
      await messages.mustBeValidCurrency(ctx);
      return false;
    }

    paymentMethod = paymentMethod.replace(/[&/\\#,+~%.'":*?<>{}]/g, '');

    return {
      amount,
      tokenCode: tokenCode.toUpperCase(),
      fiatAmount,
      fiatCode: fiatCode.toUpperCase(),
      paymentMethod,
      priceMargin,
    };
  } catch (error) {
    logger.error(error);
    return false;
  }
};

const validateBuyOrder = async ctx => {
  try {
    const args = ctx.state.command.args;
    if (args.length < 4) {
      await messages.buyOrderCorrectFormatMessage(ctx);
      return false;
    }
    let [amount, fiatAmount, fiatCode, paymentMethod, priceMargin] = args;

    if (priceMargin && isNaN(priceMargin)) {
      await ctx.reply(
        ctx.i18n.t('must_be_numeric', {
          fieldName: ctx.i18n.t('premium_discount'),
        })
      );
      return false;
    }

    amount = parseInt(amount);
    if (isNaN(amount)) {
      await ctx.reply(
        ctx.i18n.t('must_be_int', { fieldName: ctx.i18n.t('token_amount') })
      );
      return false;
    }

    // for ranges like 100--2, the result will be [100, 0, 2]
    fiatAmount = fiatAmount.split('-');
    fiatAmount = fiatAmount.map(Number);

    if (fiatAmount.length === 2 && amount) {
      await messages.invalidRangeWithAmount(ctx);
      return false;
    }

    // ranges like [100, 0, 2] (originate from ranges like 100--2)
    // will make this conditional fail
    if (fiatAmount.length > 2) {
      await messages.mustBeANumberOrRange(ctx);
      return false;
    }

    if (amount !== '0' && amount < process.env.MIN_PAYMENT_AMT) {
      await messages.mustBeGreatherEqThan(
        ctx,
        'monto_en_sats',
        process.env.MIN_PAYMENT_AMT
      );
      return false;
    }

    if (fiatAmount.length === 2 && fiatAmount[1] <= fiatAmount[0]) {
      await messages.mustBeANumberOrRange(ctx);
      return false;
    }

    if (fiatAmount.some(isNaN)) {
      await messages.mustBeANumberOrRange(ctx);
      return false;
    }

    if (fiatAmount.some(x => x < 1)) {
      await messages.mustBeGreatherEqThan(ctx, 'monto_en_fiat', 1);
      return false;
    }

    if (!isIso4217(fiatCode)) {
      await messages.mustBeValidCurrency(ctx);
      return false;
    }

    paymentMethod = paymentMethod.replace(/[&/\\#,+~%.'":*?<>{}]/g, '');

    return {
      amount,
      fiatAmount,
      fiatCode: fiatCode.toUpperCase(),
      paymentMethod,
      priceMargin,
    };
  } catch (error) {
    logger.error(error);
    return false;
  }
};

const validateWalletAddress = async (ctx, walletAddress) => {
  try {

    if (!isAddress(walletAddress)) {
      return false;   
    }

    return walletAddress;
  } catch (error) {
    logger.error(error);
    logger.debug(walletAddress);
    return false;
  }
};

const isValidWalletAddress = async (ctx, walletAddress) => {
  try {

    if (!isAddress(walletAddress)) {
      throw "Invalid wallet address.";
    }

    return {
      success: true,
      walletAddress
    };
  } catch (error) {
    await messages.errorParsingWalletAddressMessage(ctx);
    return {
      success: false,
    };
  }
};

const isOrderCreator = (user, order) => {
  try {
    return user._id == order.creator_id;
  } catch (error) {
    logger.error(error);
    return false;
  }
};

const validateTakeSellOrder = async (ctx, bot, user, order) => {
  try {
    if (!order) {
      await messages.invalidOrderMessage(ctx, bot, user);
      return false;
    }

    if (isOrderCreator(user, order)) {
      await messages.cantTakeOwnOrderMessage(ctx, bot, user);
      return false;
    }

    if (order.type === 'buy') {
      await messages.invalidTypeOrderMessage(ctx, bot, user, order.type);
      return false;
    }

    if (order.status !== 'PENDING') {
      await messages.alreadyTakenOrderMessage(ctx, bot, user);
      return false;
    }

    return true;
  } catch (error) {
    logger.error(error);
    return false;
  }
};

const validateTakeBuyOrder = async (ctx, bot, user, order) => {
  try {
    if (!order) {
      await messages.invalidOrderMessage(bot, user);
      return false;
    }
    if (isOrderCreator(user, order)) {
      await messages.cantTakeOwnOrderMessage(ctx, bot, user);
      return false;
    }
    if (order.type === 'sell') {
      await messages.invalidTypeOrderMessage(ctx, bot, user, order.type);
      return false;
    }
    if (order.status !== 'PENDING') {
      await messages.alreadyTakenOrderMessage(ctx, bot, user);
      return false;
    }
    return true;
  } catch (error) {
    logger.error(error);
    return false;
  }
};

const validateReleaseOrder = async (ctx, user, orderId) => {
  try {
    let where = {
      seller_id: user._id,
      status: 'WAITING_BUYER_ADDRESS',
      _id: orderId,
    };
    let order = await Order.findOne(where);
    if (order) {
      await messages.waitingForBuyerOrderMessage(ctx);
      return false;
    }

    where = {
      $and: [
        { seller_id: user._id },
        {
          $or: [
            { status: 'ACTIVE' },
            { status: 'FIAT_SENT' },
            { status: 'DISPUTE' },
          ],
        },
      ],
    };

    if (orderId) {
      where._id = orderId;
    }
    order = await Order.findOne(where);

    if (!order) {
      await messages.notActiveOrderMessage(ctx);
      return false;
    }

    return order;
  } catch (error) {
    logger.error(error);
    return false;
  }
};

const validateRefundOrder = async (ctx, user, orderId) => {
  try {
    let where = {
      seller_id: user._id,
      status: 'CANCELED',
      _id: orderId,
    };
    let order = await Order.findOne(where);

    if (!order) {
      await messages.notActiveOrderMessage(ctx);
      return false;
    }

    return order;
  } catch (error) {
    logger.error(error);
    return false;
  }
};

const validateDisputeOrder = async (ctx, user, orderId) => {
  try {
    const where = {
      $and: [
        { _id: orderId },
        { $or: [{ status: 'ACTIVE' }, { status: 'FIAT_SENT' }] },
        { $or: [{ seller_id: user._id }, { buyer_id: user._id }] },
      ],
    };

    const order = await Order.findOne(where);

    if (!order) {
      await messages.notActiveOrderMessage(ctx);
      return false;
    }

    return order;
  } catch (error) {
    logger.error(error);
    return false;
  }
};

const validateFiatSentOrder = async (ctx, user, orderId) => {
  try {
    const where = {
      $and: [
        { buyer_id: user._id },
        { $or: [{ status: 'ACTIVE' }, { status: 'RELEASED' }] },
      ],
    };

    if (orderId) {
      where._id = orderId;
    }
    const order = await Order.findOne(where);
    if (!order) {
      await messages.notActiveOrderMessage(ctx);
      return false;
    }

    if (order.status === 'RELEASED') {
      await messages.sellerReleasedMessage(ctx, user);
      return false;
    }

    if (!order.buyer_address) {
      await messages.noWalletAddressMessage(ctx, order);
      return false;
    }

    return order;
  } catch (error) {
    await messages.customMessage(ctx, '/fiatsent <order_id>');
    return false;
  }
};

// If a seller have an order with status FIAT_SENT, return false
const validateSeller = async (ctx, user) => {
  try {
    const where = {
      seller_id: user._id,
      status: 'FIAT_SENT',
    };

    const order = await Order.findOne(where);

    if (order) {
      await messages.orderOnfiatSentStatusMessages(ctx, user);
      return false;
    }

    return true;
  } catch (error) {
    logger.error(error);
    return false;
  }
};

const validateParams = async (ctx, paramNumber, errOutputString) => {
  try {
    const paramsArray = ctx.update.message.text.split(' ');
    const params = paramsArray.filter(el => el !== '');
    if (params.length !== paramNumber) {
      await messages.customMessage(
        ctx,
        `${params[0].toLowerCase()} ${errOutputString}`
      );

      return [];
    }

    return params.slice(1);
  } catch (error) {
    logger.error(error);
    return false;
  }
};

const validateObjectId = async (ctx, id) => {
  try {
    if (!ObjectId.isValid(id)) {
      await messages.notValidIdMessage(ctx);
      return false;
    }

    return true;
  } catch (error) {
    logger.error(error);
    return false;
  }
};

const validateUserWaitingOrder = async (ctx, bot, user) => {
  try {
    // If is a seller
    let where = {
      seller_id: user._id,
      status: 'WAITING_PAYMENT',
    };
    let orders = await Order.find(where);
    if (orders.length > 0) {
      await messages.userCantTakeMoreThanOneWaitingOrderMessage(ctx, bot, user);
      return false;
    }
    // If is a buyer
    where = {
      buyer_id: user._id,
      status: 'WAITING_BUYER_ADDRESS',
    };
    orders = await Order.find(where);
    if (orders.length > 0) {
      await messages.userCantTakeMoreThanOneWaitingOrderMessage(ctx, bot, user);
      return false;
    }
    return true;
  } catch (error) {
    logger.error(error);
    return false;
  }
};

// We check if the user is banned from the community in the order
const isBannedFromCommunity = async (user, communityId) => {
  try {
    if (!communityId) return false;
    const community = await Community.findOne({ _id: communityId });
    if (!community) return false;
    return community.banned_users.some(buser => buser.id == user._id);
  } catch (error) {
    logger.error(error);
    return false;
  }
};

module.exports = {
  validateSellOrder,
  validateBuyOrder,
  validateUser,
  validateAdmin,
  validateWalletAddress,
  validateTakeSellOrder,
  validateTakeBuyOrder,
  validateReleaseOrder,
  validateRefundOrder,
  validateDisputeOrder,
  validateFiatSentOrder,
  validateSeller,
  validateParams,
  validateObjectId,
  isValidWalletAddress,
  validateUserWaitingOrder,
  isBannedFromCommunity,
};
