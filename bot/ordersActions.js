const { ObjectId } = require('mongoose').Types;
const { Order } = require('../models');
const messages = require('./messages');
const {
  getToken,
  getCurrency,
  numberFormat,
  calculateExchangePrice,
  fetchFairMarketPrice,
  getEmojiRate,
  decimalRound,
  getFee,
  formatUnit
} = require('../util');
const logger = require('../logger');

const createOrder = async (
  i18n,
  bot,
  user,
  {
    type,
    amount,
    tokenCode,
    fiatAmount,
    fiatCode,
    paymentMethod,
    status,
    priceMargin,
    range_parent_id,
    tgChatId,
    tgOrderMessage,
    community_id,
    walletAddress
  }
) => {
  try {
    const fee = await getFee(amount, community_id);
    // Global fee values at the moment of the order creation
    // We will need this to calculate the final amount
    const botFee = parseFloat(process.env.MAX_FEE);
    const communityFee = parseFloat(process.env.FEE_PERCENT);
    const token = getToken(tokenCode);
    const currency = getCurrency(fiatCode);
    const priceFromAPI = (amount === '0');

    if (priceFromAPI && !token.api3FeedId) {
      await messages.noRateForToken(bot, user, i18n);
      return null;
    }

    if (priceFromAPI && !currency.price) {
      await messages.noRateForCurrency(bot, user, i18n);
      return null;
    }

    const fairPrice = await fetchFairMarketPrice(fiatCode, token.code);
    const fiatAmountData = getFiatAmountData(fiatAmount);

    const baseOrderData = {
      ...fiatAmountData,
      amount,
      fee,
      bot_fee: botFee,
      community_fee: communityFee,
      creator_id: user._id,
      type,
      status,
      token_code: tokenCode,
      fiat_code: fiatCode,
      payment_method: paymentMethod,
      tg_chat_id: tgChatId,
      tg_order_message: tgOrderMessage,
      price_from_api: priceFromAPI,
      price_margin: priceMargin || 0,
      description: await buildDescription(i18n, {
        user,
        type,
        amount,
        token,
        fiatAmount,
        fiatCode,
        paymentMethod,
        priceMargin,
        fairPrice,
        priceFromAPI,
        currency,
      }),
      range_parent_id,
      community_id,
    };

    let order;

    if (type === 'sell') {
      order = new Order({
        seller_id: user._id,
        ...baseOrderData,
      });
    } else {
      order = new Order({
        buyer_id: user._id,
        buyer_address: walletAddress,
        ...baseOrderData,
      });
    }
    await order.save();

    return order;
  } catch (error) {
    logger.error(error);
    return null;
  }
};

const getFiatAmountData = fiatAmount => {
  const response = {};
  if (fiatAmount.length === 2) {
    response.min_fiat_amount = fiatAmount[0];
    response.max_fiat_amount = fiatAmount[1];
  } else {
    response.fiat_amount = fiatAmount[0];
  }

  return response;
};

const buildDescription = async (
  i18n,
  {
    user,
    type,
    amount,
    token,
    fiatAmount,
    fiatCode,
    paymentMethod,
    priceMargin,
    priceFromAPI,
    fairPrice,
    currency,
  }
) => {
  try {
    const action = type === 'sell' ? i18n.t('selling') : i18n.t('buying');
    const hashtag = `#${type.toUpperCase()}${fiatCode}\n`;
    const paymentAction =
      type === 'sell' ? i18n.t('receive_payment') : i18n.t('pay');
    const trades = user.trades_completed;
    const volume = numberFormat(fiatCode, user.volume_traded);
    const totalRating = user.total_rating;
    const totalReviews = user.total_reviews;
    const username = user.show_username
      ? `@${user.username} ` + i18n.t('is') + ` `
      : ``;
    const volumeTraded = user.show_volume_traded
      ? i18n.t('trading_volume', { volume }) + `\n`
      : ``;
    priceMargin =
      !!priceMargin && priceMargin > 0 ? `+${priceMargin}` : priceMargin;
    const priceMarginText = priceMargin ? `${priceMargin}%` : ``;

    const fiatAmountString = fiatAmount
      .map(amt => numberFormat(fiatCode, amt))
      .join(' - ');

    let currencyString = `${fiatCode} ${fiatAmountString}`;

    if (currency)
      currencyString = `${fiatAmountString} ${currency.name_plural} ${currency.emoji}`;
    let amountText = `${formatUnit(amount, token.decimals)} ${token.code}`;
    let tasaText = '';
    if (priceFromAPI) {
      amountText = `${token.code}`;
      tasaText = i18n.t('rate') + `: ${process.env.FIAT_RATE_NAME} ${priceMarginText}\n`;
    } else {
      const exchangePrice = calculateExchangePrice(fiatAmount[0], amount, token.decimals);
      const symbol = !!currency && !!currency.symbol_native ? currency.symbol_native : fiatCode;

      tasaText = i18n.t('order_price') + `: ${symbol} ${numberFormat(fiatCode, Number(exchangePrice))}\n`;
      tasaText += i18n.t('fair_price') + `: ${symbol} ${numberFormat(fiatCode, Number(fairPrice))}\n`;
    }

    let rateText = '';
    if (totalRating) {
      const stars = getEmojiRate(totalRating);
      const roundedRating = decimalRound(totalRating, -1);
      rateText = `${roundedRating} ${stars} (${totalReviews})\n`;
    }

    let description =
      `${username}${action} ${amountText}\n`;
    description += i18n.t('for') + ` ${currencyString}\n`;
    description += `${paymentAction} ` + i18n.t('by') + ` ${paymentMethod}\n`;
    description += i18n.t('has_successful_trades', { trades }) + `\n`;
    description += volumeTraded;
    description += hashtag;
    description += tasaText;
    description += rateText;

    return description;
  } catch (error) {
    logger.error(error);
  }
};

const getOrder = async (ctx, user, orderId) => {
  try {
    if (!ObjectId.isValid(orderId)) {
      await messages.notValidIdMessage(ctx);
      return false;
    }

    const where = {
      _id: orderId,
      $or: [{ seller_id: user._id }, { buyer_id: user._id }],
    };

    const order = await Order.findOne(where);
    if (!order) {
      await messages.notOrderMessage(ctx);
      return false;
    }

    return order;
  } catch (error) {
    logger.error(error);
    return false;
  }
};

const getOrders = async (ctx, user, status) => {
  try {
    const where = {
      $and: [
        {
          $or: [{ buyer_id: user._id }, { seller_id: user._id }],
        },
      ],
    };

    if (status) {
      where.$and.push({ status });
    } else {
      const $or = [
        { status: 'WAITING_PAYMENT' },
        { status: 'WAITING_BUYER_ADDRESS' },
        { status: 'PENDING' },
        { status: 'ACTIVE' },
        { status: 'FIAT_SENT' },
        { status: 'DISPUTE' },
      ];
      where.$and.push({ $or });
    }
    const orders = await Order.find(where);

    if (orders.length === 0) {
      await messages.notOrdersMessage(ctx);
      return false;
    }

    return orders;
  } catch (error) {
    logger.error(error);
  }
};

const getNewRangeOrderPayload = async order => {
  try {
    let newMaxAmount = 0;

    if (order.max_fiat_amount !== undefined) {
      newMaxAmount = order.max_fiat_amount - order.fiat_amount;
    }

    if (newMaxAmount >= order.min_fiat_amount) {
      const orderData = {
        type: order.type,
        amount: '0',
        tokenCode: order.token_code,
        // drop newMaxAmount if it is equal to min_fiat_amount and create a
        // not range order.
        // Set preserves insertion order, so min_fiat_amount will be always
        // before newMaxAmount
        fiatAmount: [...new Set([order.min_fiat_amount, newMaxAmount])],
        fiatCode: order.fiat_code,
        paymentMethod: order.payment_method,
        status: 'PENDING',
        priceMargin: order.price_margin,
        range_parent_id: order._id,
        tgChatId: order.tg_chat_id,
        tgOrderMessage: order.tg_order_message,
        community_id: order.community_id,
      };

      return orderData;
    }
  } catch (error) {
    logger.error(error);
  }
};

module.exports = {
  createOrder,
  getOrder,
  getOrders,
  getNewRangeOrderPayload,
};
