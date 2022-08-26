const { TelegramError } = require('telegraf');
const QR = require('qrcode');
const {
  getToken,
  getCurrency,
  numberFormat,
  formatUnit,
  getDetailedOrder,
  secondsToTime,
  getOrderChannel  
} = require('../util');
const logger = require('../logger');

const startMessage = async ctx => {
  try {
    const orderExpiration = parseInt(process.env.ORDER_EXPIRATION_WINDOW) / 60;
    const message = ctx.i18n.t('start', {
      orderExpiration,
      channel: process.env.CHANNEL,
    });
    await ctx.reply(message);
  } catch (error) {
    logger.error(error);
  }
};

const initBotErrorMessage = async (ctx, bot, user) => {
  try {
    await bot.telegram.sendMessage(user.tg_id, ctx.i18n.t('init_bot_error'));
  } catch (error) {
    // Ignore TelegramError - Forbidden request
    if (
      !(error instanceof TelegramError && error.response.error_code === 403)
    ) {
      logger.error(error);
    }
  }
};

const nonHandleErrorMessage = async ctx => {
  try {
    await ctx.reply(ctx.i18n.t('non_handle_error'));
  } catch (error) {
    logger.error(error);
  }
};

const lockTokensRequestMessage = async (
  ctx,
  user,
  order,
  i18n,
  rate
) => {
  try {
    let currency = getCurrency(order.fiat_code);
    let token = getToken(order.token_code);
    currency =
      !!currency && !!currency.symbol_native
        ? currency.symbol_native
        : order.fiat_code;
    const expirationTime = parseInt(process.env.PAYMENT_EXPIRATION_WINDOW) / 60;
    const formattedAmount = formatUnit(order.amount, token.decimals) + ' ' + token.code;
    const message = i18n.t('lock_tokens_request', {
      currency,
      order,
      expirationTime,
      rate,
      dappPage: process.env.DAPP_PAGE,
      formattedAmount: formattedAmount,
    });
    await ctx.telegram.sendMessage(user.tg_id, message, { parse_mode: 'markdown' });
  
  } catch (error) {
    logger.error(error);
  }
};

const pendingSellMessage = async (ctx, user, order, channel, i18n) => {
  try {
    const orderExpirationWindow =
      process.env.ORDER_PUBLISHED_EXPIRATION_WINDOW / 60 / 60;
    await ctx.telegram.sendMessage(
      user.tg_id,
      i18n.t('pending_sell', {
        channel,
        orderExpirationWindow: Math.round(orderExpirationWindow),
      })
    );
    await ctx.telegram.sendMessage(
      user.tg_id,
      i18n.t('cancel_order_cmd', { orderId: order._id }),
      { parse_mode: 'MarkdownV2' }
    );
  } catch (error) {
    logger.error(error);
  }
};

const pendingBuyMessage = async (bot, user, order, channel, i18n) => {
  try {
    const orderExpirationWindow =
      process.env.ORDER_PUBLISHED_EXPIRATION_WINDOW / 60 / 60;
    await bot.telegram.sendMessage(
      user.tg_id,
      i18n.t('pending_buy', {
        channel,
        orderExpirationWindow: Math.round(orderExpirationWindow),
      })
    );
    await bot.telegram.sendMessage(
      user.tg_id,
      i18n.t('cancel_order_cmd', { orderId: order._id }),
      { parse_mode: 'MarkdownV2' }
    );
  } catch (error) {
    logger.error(error);
  }
};

const sellOrderCorrectFormatMessage = async ctx => {
  try {
    await ctx.reply(ctx.i18n.t('sell_correct_format'), {
      parse_mode: 'MarkdownV2',
    });
  } catch (error) {
    logger.error(error);
  }
};

const buyOrderCorrectFormatMessage = async ctx => {
  try {
    await ctx.reply(ctx.i18n.t('buy_correct_format'), {
      parse_mode: 'MarkdownV2',
    });
  } catch (error) {
    logger.error(error);
  }
};

const errorParsingWalletAddressMessage = async ctx => {
  try {
    await ctx.reply(ctx.i18n.t('error_parsing_wallet_address'));
  } catch (error) {
    logger.error(error);
  }
};

const invalidWalletAddressMessage = async ctx => {
  try {
    await ctx.reply(ctx.i18n.t('invalid_wallet_address'));
  } catch (error) {
    logger.error(error);
  }
};

const invalidOrderMessage = async (ctx, bot, user) => {
  try {
    await bot.telegram.sendMessage(user.tg_id, ctx.i18n.t('order_id_invalid'));
  } catch (error) {
    logger.error(error);
  }
};

const invalidTypeOrderMessage = async (ctx, bot, user, type) => {
  try {
    await bot.telegram.sendMessage(
      user.tg_id,
      ctx.i18n.t('order_invalid_type', { type })
    );
  } catch (error) {
    logger.error(error);
  }
};

const alreadyTakenOrderMessage = async (ctx, bot, user) => {
  try {
    await bot.telegram.sendMessage(
      user.tg_id,
      ctx.i18n.t('order_already_taken')
    );
  } catch (error) {
    logger.error(error);
  }
};

const invalidDataMessage = async (ctx, bot, user) => {
  try {
    await bot.telegram.sendMessage(user.tg_id, ctx.i18n.t('invalid_data'));
  } catch (error) {
    logger.error(error);
  }
};

const genericErrorMessage = async (bot, user, i18n) => {
  try {
    await bot.telegram.sendMessage(user.tg_id, i18n.t('generic_error'));
  } catch (error) {
    logger.error(error);
  }
};

const beginTakeBuyMessage = async (ctx, bot, seller, order) => {
  try {
    const expirationTime =
      parseInt(process.env.PAYMENT_EXPIRATION_WINDOW) / 60;
    await bot.telegram.sendMessage(
      seller.tg_id,
      ctx.i18n.t('begin_take_buy', { expirationTime })
    );
    await bot.telegram.sendMessage(seller.tg_id, order._id, {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: ctx.i18n.t('continue'),
              callback_data: 'showHoldInvoiceBtn',
            },
            {
              text: ctx.i18n.t('cancel'),
              callback_data: 'cancelShowHoldInvoiceBtn',
            },
          ],
        ],
      },
    });
  } catch (error) {
    logger.error(error);
  }
};

const showHoldInvoiceMessage = async (
  ctx,
  request,
  amount,
  fiatCode,
  fiatAmount
) => {
  try {
    let currency = getCurrency(fiatCode);
    currency =
      !!currency && !!currency.symbol_native
        ? currency.symbol_native
        : fiatCode;
    await ctx.reply(
      ctx.i18n.t('pay_invoice', {
        amount: numberFormat(fiatCode, amount),
        fiatAmount: numberFormat(fiatCode, fiatAmount),
        currency,
      })
    );
    // Create QR code
    const qrBytes = await QR.toBuffer(request);
    // Send payment request in QR and text
    await ctx.replyWithMediaGroup([
      {
        type: 'photo',
        media: { source: qrBytes },
        caption: ['`', request, '`'].join(''),
        parse_mode: 'MarkdownV2',
      },
    ]);
  } catch (error) {
    logger.error(error);
  }
};

const onGoingTakeBuyMessage = async (
  bot,
  seller,
  buyer,
  order,
  i18nBuyer,
  i18nSeller,
  rate
) => {
  try {
    await bot.telegram.sendMessage(
      seller.tg_id,
      i18nSeller.t('payment_received')
    );
    const orderExpiration = parseInt(process.env.ORDER_EXPIRATION_WINDOW);
    const time = secondsToTime(orderExpiration);
    let expirationTime = time.hours + ' ' + i18nBuyer.t('hours');
    expirationTime +=
      time.minutes > 0 ? ' ' + time.minutes + ' ' + i18nBuyer.t('minutes') : '';
    await bot.telegram.sendMessage(
      buyer.tg_id,
      i18nBuyer.t('someone_took_your_order', { expirationTime, rate })
    );
    await bot.telegram.sendMessage(buyer.tg_id, order._id, {
      reply_markup: {
        inline_keyboard: [
          [{ text: i18nBuyer.t('continue'), callback_data: 'addWalletAddressBtn' }],
        ],
      },
    });
  } catch (error) {
    logger.error(error);
  }
};

const beginTakeSellMessage = async (ctx, bot, buyer, order) => {
  try {
    const orderExpiration = parseInt(process.env.ORDER_EXPIRATION_WINDOW);
    const time = secondsToTime(orderExpiration);
    let expirationTime = time.hours + ' ' + ctx.i18n.t('hours');
    expirationTime +=
      time.minutes > 0 ? ' ' + time.minutes + ' ' + ctx.i18n.t('minutes') : '';
    await bot.telegram.sendMessage(
      buyer.tg_id,
      ctx.i18n.t('you_took_someone_order', { expirationTime }),
      { parse_mode: 'MarkdownV2' }
    );
    await bot.telegram.sendMessage(buyer.tg_id, order._id, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: ctx.i18n.t('continue'), callback_data: 'addWalletAddressBtn' },
            {
              text: ctx.i18n.t('cancel'),
              callback_data: 'cancelAddWalletAddressBtn',
            },
          ],
        ],
      },
    });
  } catch (error) {
    logger.error(error);
  }
};

const onGoingTakeSellMessage = async (
  bot,
  sellerUser,
  buyerUser,
  order,
  i18nBuyer,
  i18nSeller
) => {
  try {
    let currency = getCurrency(order.fiat_code);
    currency =
      !!currency && !!currency.symbol_native
        ? currency.symbol_native
        : order.fiat_code;
    await bot.telegram.sendMessage(
      buyerUser.tg_id,
      i18nBuyer.t('get_in_touch_with_seller', {
        currency,
        sellerUsername: sellerUser.username,
        fiatAmount: numberFormat(order.fiat_code, order.fiat_amount),
        paymentMethod: order.payment_method,
      })
    );
    await bot.telegram.sendMessage(
      buyerUser.tg_id,
      i18nBuyer.t('fiatsent_order_cmd', { orderId: order._id }),
      { parse_mode: 'MarkdownV2' }
    );
    await bot.telegram.sendMessage(
      sellerUser.tg_id,
      i18nSeller.t('get_in_touch_with_buyer', {
        tokenCode: order.token_code,
        fiatAmount: order.fiat_amount,
        paymentMethod: order.payment_method,
        currency,
        buyerUsername: buyerUser.username,
      })
    );
  } catch (error) {
    logger.error(error);
  }
};

const takeSellWaitingSellerToPayMessage = async (
  ctx,
  bot,
  buyerUser,
  order
) => {
  try {
    await bot.telegram.sendMessage(
      buyerUser.tg_id,
      ctx.i18n.t('waiting_seller_to_pay', { orderId: order._id, tokenCode: order.token_code })
    );
  } catch (error) {
    logger.error(error);
  }
};

const releaseInstructionsMessage = async(ctx, user, order) => {
  try {
    const token = getToken(order.token_code);
    const formattedAmount = formatUnit(order.amount, token.decimals) + ' ' + token.code;
    await ctx.telegram.sendMessage(
      user.tg_id,
      ctx.i18n.t('release_instructions', { order: order, formattedAmount: formattedAmount, dappPage: process.env.DAPP_PAGE }),
      { parse_mode: 'markdown' }
    );
  } catch (error) {
    logger.error(error);
  }
};

const fundsReleasedMessages = async (
  bot,
  sellerUser,
  buyerUser,
  i18nBuyer,
  i18nSeller
) => {
  try {
    await bot.telegram.sendMessage(
      sellerUser.tg_id,
      i18nSeller.t('sell_success', { buyerUsername: buyerUser.username })
    );
    await bot.telegram.sendMessage(
      buyerUser.tg_id,
      i18nBuyer.t('your_purchase_is_completed', { sellerUsername: sellerUser.username })
    );
  } catch (error) {
    logger.error(error);
  }
};

const rateUserMessage = async (bot, caller, order, i18n) => {
  try {
    const starButtons = [];
    for (let num = 5; num > 0; num--) {
      starButtons.push([
        {
          text: '⭐'.repeat(num),
          callback_data: `showStarBtn(${num},${order._id})`,
        },
      ]);
    }
    await bot.telegram.sendMessage(caller.tg_id, i18n.t('rate_counterpart'), {
      reply_markup: {
        inline_keyboard: starButtons,
      },
    });
  } catch (error) {
    logger.error(error);
  }
};

const notActiveOrderMessage = async ctx => {
  try {
    await ctx.reply(ctx.i18n.t('cant_process_order'));
  } catch (error) {
    logger.error(error);
  }
};

const waitingForBuyerOrderMessage = async ctx => {
  try {
    await ctx.reply(ctx.i18n.t('cant_release_order'));
  } catch (error) {
    logger.error(error);
  }
};

const notOrderMessage = async ctx => {
  try {
    await ctx.reply(ctx.i18n.t('no_id_related'));
  } catch (error) {
    logger.error(error);
  }
};

const publishBuyOrderMessage = async (
  bot,
  user,
  order,
  i18n,
  messageToUser
) => {
  try {
    let publishMessage = `⚡️🍊⚡️\n${order.description}\n`;
    publishMessage += `:${order._id}:`;

    const channel = await getOrderChannel(order);
    // We send the message to the channel
    const message1 = await bot.telegram.sendMessage(channel, publishMessage, {
      reply_markup: {
        inline_keyboard: [
          [{ text: i18n.t('sell_tokens', {tokenCode: order.token_code}), callback_data: 'takebuy' }],
        ],
      },
    });
    // We save the id of the message in the order
    order.tg_channel_message1 =
      message1 && message1.message_id ? message1.message_id : null;

    await order.save();
    if (messageToUser) {
      // Message to user let know the order was published
      await pendingBuyMessage(bot, user, order, channel, i18n);
    }
  } catch (error) {
    logger.error(error);
  }
};

const publishSellOrderMessage = async (
  ctx,
  user,
  order,
  i18n,
  messageToUser
) => {
  try {
    let publishMessage = `⚡️🍊⚡️\n${order.description}\n`;
    publishMessage += `:${order._id}:`;
    const channel = await getOrderChannel(order);

    // We send the message to the channel
    const message1 = await ctx.telegram.sendMessage(channel, publishMessage, {
      reply_markup: {
        inline_keyboard: [
          [{ text: i18n.t('buy_tokens',{tokenCode: order.token_code}), callback_data: 'takesell' }],
        ],
      },
    });
    // We save the id of the message in the order
    order.tg_channel_message1 =
      message1 && message1.message_id ? message1.message_id : null;

    await order.save();
    // Message to user let know the order was published
    if (messageToUser)
      await pendingSellMessage(ctx, user, order, channel, i18n);
  } catch (error) {
    logger.error(error);
  }
};

const customMessage = async (ctx, message) => {
  try {
    await ctx.reply(message, { parse_mode: 'MarkdownV2' });
  } catch (error) {
    logger.error(error);
  }
};

const checkOrderMessage = async (ctx, order, buyer, seller) => {
  try {
    let message = getDetailedOrder(ctx.i18n, order, buyer, seller);
    message += `\n\n`;
    await ctx.reply(message, { parse_mode: 'MarkdownV2' });
  } catch (error) {
    logger.error(error);
  }
};

const mustBeValidToken = async ctx => {
  try {
    await ctx.reply(ctx.i18n.t('must_be_valid_token'));
  } catch (error) {
    logger.error(error);
  }

};

const mustBeValidCurrency = async ctx => {
  try {
    await ctx.reply(ctx.i18n.t('must_be_valid_currency'));
  } catch (error) {
    logger.error(error);
  }
};

const mustBeANumberOrRange = async ctx => {
  try {
    await ctx.reply(ctx.i18n.t('must_be_number_or_range'));
  } catch (error) {
    logger.error(error);
  }
};

const helpMessage = async ctx => {
  try {
    await ctx.reply(ctx.i18n.t('help'), { parse_mode: 'Markdown' });
  } catch (error) {
    logger.error(error);
  }
};

const mustBeGreatherEqThan = async (ctx, fieldName, qty) => {
  try {
    await ctx.reply(
      ctx.i18n.t('must_be_gt_or_eq', {
        fieldName,
        qty,
      })
    );
  } catch (error) {
    logger.error(error);
  }
};

const bannedUserErrorMessage = async (ctx, user) => {
  try {
    await ctx.telegram.sendMessage(
      user.tg_id,
      ctx.i18n.t('you_have_been_banned')
    );
  } catch (error) {
    logger.error(error);
  }
};

const fiatSentMessages = async (
  ctx,
  buyer,
  seller,
  order,
  i18nBuyer,
  i18nSeller
) => {
  try {
    let token = getToken(order.token_code);
    let formattedAmount = formatUnit(order.amount, token.decimals) + ' ' + token.code;
    await ctx.telegram.sendMessage(
      buyer.tg_id,
      i18nBuyer.t('I_told_seller_you_sent_fiat', {
        sellerUsername: seller.username,
        formattedAmount: formattedAmount
      })
    );
    await ctx.telegram.sendMessage(
      seller.tg_id,
      i18nSeller.t('buyer_told_me_that_sent_fiat', {
        buyerUsername: buyer.username,
        order: order,
        formattedAmount: formattedAmount,
        dappPage: process.env.DAPP_PAGE
      }),
      { parse_mode: 'markdown' }
    );
  } catch (error) {
    logger.error(error);
  }
};

const orderOnfiatSentStatusMessages = async (ctx, user) => {
  try {
    await ctx.telegram.sendMessage(
      user.tg_id,
      ctx.i18n.t('you_have_orders_waiting')
    );
  } catch (error) {
    logger.error(error);
  }
};

const userBannedMessage = async ctx => {
  try {
    await ctx.reply(ctx.i18n.t('user_banned'));
  } catch (error) {
    logger.error(error);
  }
};

const notFoundUserMessage = async ctx => {
  try {
    await ctx.reply(ctx.i18n.t('user_not_found'));
  } catch (error) {
    logger.error(error);
  }
};

const notValidIdMessage = async ctx => {
  try {
    await ctx.reply(ctx.i18n.t('invalid_id'));
  } catch (error) {
    logger.error(error);
  }
};

const cantTakeOwnOrderMessage = async (ctx, bot, user) => {
  try {
    await bot.telegram.sendMessage(
      user.tg_id,
      ctx.i18n.t('cant_take_own_order')
    );
  } catch (error) {
    logger.error(error);
  }
};

const noWalletAddressMessage = async (ctx, order) => {
  try {
    let token = getToken(order.token_code);
    let formattedAmount = formatUnit(order.amount, token.decimals) + ' ' + token.code;
    await ctx.reply(ctx.i18n.t('send_me_wallet_address', { formattedAmount }));
    await ctx.reply(
      ctx.i18n.t('setaddress_cmd_order', { orderId: order._id }),
      { parse_mode: 'MarkdownV2' }
    );
  } catch (error) {
    logger.error(error);
  }
};

const notOrdersMessage = async ctx => {
  try {
    await ctx.reply(ctx.i18n.t('you_have_no_orders'));
  } catch (error) {
    logger.error(error);
  }
};

const noRateForCurrency = async (bot, user, i18n) => {
  try {
    await bot.telegram.sendMessage(
      user.tg_id,
      i18n.t('no_rate_for_currency', {
        fiatRateProvider: process.env.FIAT_RATE_NAME,
      })
    );
  } catch (error) {
    logger.error(error);
  }
};

const noRateForToken = async (bot, user, i18n) => {
  try {
    await bot.telegram.sendMessage(
      user.tg_id,
      i18n.t('no_rate_for_token', {
        fiatRateProvider: process.env.FIAT_RATE_NAME,
      })
    );
  } catch (error) {
    logger.error(error);
  }
};


const badStatusOnCancelOrderMessage = async ctx => {
  try {
    await ctx.reply(ctx.i18n.t('cancel_error'));
  } catch (error) {
    logger.error(error);
  }
};

const successCancelOrderMessage = async (ctx, user, order, i18n) => {
  try {
    await ctx.telegram.sendMessage(
      user.tg_id,
      i18n.t('cancel_success', { orderId: order._id })
    );
  } catch (error) {
    logger.error(error);
  }
};

const successCancelAllOrdersMessage = async ctx => {
  try {
    await ctx.reply(ctx.i18n.t('cancelall_success'));
  } catch (error) {
    logger.error(error);
  }
};

const successCancelOrderByAdminMessage = async (i18nCtx, bot, user, order) => {
  try {
    await bot.telegram.sendMessage(
      user.tg_id,
      i18nCtx.t('order_cancelled_by_admin', { orderId: order._id })
    );
  } catch (error) {
    logger.error(error);
  }
};

const successCompleteOrderMessage = async (ctx, order) => {
  try {
    await ctx.reply(ctx.i18n.t('order_completed', { orderId: order._id }));
  } catch (error) {
    logger.error(error);
  }
};

const successCompleteOrderByAdminMessage = async (i18nCtx, bot, user, order) => {
  try {
    await bot.telegram.sendMessage(
      user.tg_id,
      i18nCtx.t('order_completed_by_admin', { orderId: order._id })
    );
  } catch (error) {
    logger.error(error);
  }
};

const shouldWaitCooperativeCancelMessage = async (ctx, user) => {
  try {
    await ctx.telegram.sendMessage(
      user.tg_id,
      ctx.i18n.t('have_to_wait_for_counterpart')
    );
  } catch (error) {
    logger.error(error);
  }
};

const okCooperativeCancelMessage = async (ctx, user, order, i18n) => {
  try {
    await ctx.telegram.sendMessage(
      user.tg_id,
      i18n.t('ok_cooperativecancel', { orderId: order._id })
    );
  } catch (error) {
    logger.error(error);
  }
};

const refundCooperativeCancelMessage = async (ctx, order, user, i18n) => {
  try {
    let token = getToken(order.token_code);
    const formattedAmount = formatUnit(order.amount, token.decimals) + ' ' + token.code;
    await ctx.telegram.sendMessage(
      user.tg_id,
      i18n.t('refund_cooperativecancel', { orderId: order._id, order: order, formattedAmount: formattedAmount, dappPage: process.env.DAPP_PAGE }),
      { parse_mode: 'markdown' }
    );
  } catch (error) {
    logger.error(error);
  }
};

const initCooperativeCancelMessage = async (ctx, order) => {
  try {
    await ctx.reply(
      ctx.i18n.t('init_cooperativecancel', { orderId: order._id })
    );
  } catch (error) {
    logger.error(error);
  }
};

const counterPartyWantsCooperativeCancelMessage = async (
  ctx,
  user,
  order,
  i18n
) => {
  try {
    await ctx.telegram.sendMessage(
      user.tg_id,
      i18n.t('counterparty_wants_cooperativecancel', { orderId: order._id })
    );
    await ctx.telegram.sendMessage(
      user.tg_id,
      i18n.t('cancel_order_cmd', { orderId: order._id }),
      { parse_mode: 'MarkdownV2' }
    );
  } catch (error) {
    logger.error(error);
  }
};

const userCantTakeMoreThanOneWaitingOrderMessage = async (ctx, bot, user) => {
  try {
    await bot.telegram.sendMessage(
      user.tg_id,
      ctx.i18n.t('cant_take_more_orders')
    );
  } catch (error) {
    logger.error(error);
  }
};

const sellerReleasedMessage = async (ctx, user) => {
  try {
    await ctx.telegram.sendMessage(user.tg_id, ctx.i18n.t('seller_released'));
  } catch (error) {
    logger.error(error);
  }
};

const showInfoMessage = async (bot, user, info) => {
  try {
    // const status = !!info.public_key;
    // const statusEmoji = status ? '🟢' : '🔴';
    let fee = (process.env.MAX_FEE * 100).toString();
    fee = fee.replace('.', '\\.');
    await bot.telegram.sendMessage(user.tg_id, `*Bot fee*: ${fee}%`, {
      parse_mode: 'MarkdownV2',
    });
    // if (status) {
    //   await bot.telegram.sendMessage(user.tg_id, `*Node pubkey*: ${info.public_key}\n`, { parse_mode: "MarkdownV2" });
    // }
  } catch (error) {
    logger.error(error);
  }
};

const listTokensResponse = async (ctx, tokens) => {
  try {
    let response = `Code  | Symbol | Name \n`;
    tokens.forEach(token => {
      response += `${token.code} |\t ${token.symbol} |\t ${token.name}\n`;
    });
    await ctx.reply(response);
  } catch (error) {
    logger.error(error);
  }
};

const listCurrenciesResponse = async (ctx, currencies) => {
  try {
    let response = `Code |   Name   |\n`;
    currencies.forEach(currency => {
      response += `${currency.code} | ${currency.name} | ${currency.emoji}\n`;
    });
    await ctx.reply(response);
  } catch (error) {
    logger.error(error);
  }
};

const priceApiFailedMessage = async (ctx, bot, user) => {
  try {
    await bot.telegram.sendMessage(
      user.tg_id,
      ctx.i18n.t('problem_getting_price')
    );
  } catch (error) {
    logger.error(error);
  }
};

const updateUserSettingsMessage = async (ctx, field, newState) => {
  try {
    await ctx.reply(
      ctx.i18n.t('update_user_setting', {
        field,
        newState,
      })
    );
  } catch (error) {
    logger.error(error);
  }
};

const invalidRangeWithAmount = async ctx => {
  try {
    await ctx.reply(ctx.i18n.t('invalid_range_with_amount'));
  } catch (error) {
    logger.error(error);
  }
};

const tooManyPendingOrdersMessage = async (ctx, user, i18n) => {
  try {
    ctx.telegram.sendMessage(user.tg_id, i18n.t('too_many_pending_orders'));
  } catch (error) {
    logger.error(error);
  }
};

const wizardAddWalletAddressInitMessage = async (
  ctx,
  order,
  currency,
  expirationTime
) => {
  try {
    let token = getToken(order.token_code);
    await ctx.reply(
      ctx.i18n.t('wizard_add_wallet_address_init', {
        expirationTime,
        currency,
        fiatAmount: numberFormat(order.fiat_code, order.fiat_amount),
        formattedAmount: formatUnit(order.amount, token.decimals) + ' ' + token.code 
      })
    );
  } catch (error) {
    logger.error(error);
  }
};

const wizardAddWalletExitMessage = async (ctx, order) => {
  try {
    await ctx.reply(
      ctx.i18n.t('wizard_add_wallet_exit', {
        orderId: order._id,
      }),
      { parse_mode: 'MarkdownV2' }
    );
  } catch (error) {
    logger.error(error);
  }
};

const wizardExitMessage = async ctx => {
  try {
    await ctx.reply(ctx.i18n.t('wizard_exit'));
  } catch (error) {
    logger.error(error);
  }
};

const orderExpiredMessage = async ctx => {
  try {
    await ctx.reply(ctx.i18n.t('order_expired'));
  } catch (error) {
    logger.error(error);
  }
};

const cantAddWalletAddressMessage = async ctx => {
  try {
    await ctx.reply(ctx.i18n.t('cant_add_wallet_address'));
  } catch (error) {
    logger.error(error);
  }
};

const wizardAddFiatAmountMessage = async (ctx, currency, action, order) => {
  console.log(order);
  try {
    await ctx.reply(
      ctx.i18n.t('wizard_add_fiat_amount', {
        action,
        currency,
        fiatAmount: numberFormat(order.fiat_code, order.fiat_amount),
        minAmount: numberFormat(order.fiat_code, order.min_fiat_amount),
        maxAmount: numberFormat(order.fiat_code, order.max_fiat_amount),
      })
    );
  } catch (error) {
    logger.error(error);
  }
};

const wizardAddFiatAmountWrongAmountMessage = async (ctx, order) => {
  try {
    ctx.deleteMessage();
    await ctx.reply(
      ctx.i18n.t('wizard_add_fiat_wrong_amount', {
        minAmount: numberFormat(order.fiat_code, order.min_fiat_amount),
        maxAmount: numberFormat(order.fiat_code, order.max_fiat_amount),
      })
    );
  } catch (error) {
    logger.error(error);
  }
};

const wizardAddFiatAmountCorrectMessage = async (ctx, currency, fiatAmount) => {
  try {
    await ctx.reply(
      ctx.i18n.t('wizard_add_fiat_correct_amount', {
        currency: currency.symbol_native,
        fiatAmount,
      })
    );
  } catch (error) {
    logger.error(error);
  }
};

const expiredOrderMessage = async (bot, order, buyerUser, sellerUser, i18n) => {
  try {
    const detailedOrder = getDetailedOrder(i18n, order, buyerUser, sellerUser);
    await bot.telegram.sendMessage(
      process.env.ADMIN_CHANNEL,
      i18n.t('expired_order', {
        detailedOrder,
        buyerUser,
        sellerUser,
      }),
      { parse_mode: 'MarkdownV2' }
    );
  } catch (error) {
    logger.error(error);
  }
};

const toBuyerExpiredOrderMessage = async (bot, user, i18n) => {
  try {
    await bot.telegram.sendMessage(
      user.tg_id,
      i18n.t('expired_order_to_buyer', { order: order, helpGroup: process.env.HELP_GROUP })
    );
  } catch (error) {
    logger.error(error);
  }
};

const toSellerExpiredOrderMessage = async (bot, order, user, i18n) => {
  try {
    const token = getToken(order.token_code);
    const formattedAmount = formatUnit(order.amount, token.decimals) + ' ' + token.code;
    await bot.telegram.sendMessage(
      user.tg_id,
      i18n.t('expired_order_to_seller', { helpGroup: process.env.HELP_GROUP, order: order, formattedAmount, dappPage: process.env.DAPP_PAGE }),
      { parse_mode: 'markdown' }
    );
  } catch (error) {
    logger.error(error);
  }
};

const toBuyerDidntAddWalletAddressMessage = async (bot, user, order, i18n) => {
  try {
    await bot.telegram.sendMessage(
      user.tg_id,
      i18n.t('didnt_add_wallet_address', { orderId: order._id, tokenCode: order.token_code })
    );
  } catch (error) {
    logger.error(error);
  }
};

const toSellerBuyerDidntAddWalletAddressMessage = async (bot, user, order, i18n) => {
  try {
    await bot.telegram.sendMessage(
      user.tg_id,
      i18n.t('buyer_havent_added_wallet_address', { orderId: order._id, tokenCode: order.token_code })
    );
  } catch (error) {
    logger.error(error);
  }
};

const toAdminChannelBuyerDidntAddWalletAddressMessage = async (
  bot,
  user,
  order,
  i18n
) => {
  try {
    await bot.telegram.sendMessage(
      process.env.ADMIN_CHANNEL,
      i18n.t('buyer_havent_added_wallet_address_to_admin_channel', {
        orderId: order._id,
        username: user.username,
      })
    );
  } catch (error) {
    logger.error(error);
  }
};

const toSellerDidntLockTokensMessage = async (bot, user, order, i18n) => {
  try {
    let token = getToken(order.token_code);
    const formattedAmount = formatUnit(order.amount, token.decimals) + ' ' + token.code;

    await bot.telegram.sendMessage(
      user.tg_id,
      i18n.t('havent_locked_tokens', { order: order, formattedAmount: formattedAmount, dappPage: process.env.DAPP_PAGE }),
      { parse_mode: 'markdown' }
    );
  } catch (error) {
    logger.error(error);
  }
};

const toBuyerSellerDidntLockTokensMessage = async (bot, user, order, i18n) => {
  try {
    await bot.telegram.sendMessage(
      user.tg_id,
      i18n.t('seller_havent_locked_tokens', { orderId: order._id })
    );
  } catch (error) {
    logger.error(error);
  }
};

const toAdminChannelSellerDidntLockTokensMessage = async (
  bot,
  user,
  order,
  i18n
) => {
  try {
    await bot.telegram.sendMessage(
      process.env.ADMIN_CHANNEL,
      i18n.t('seller_havent_added_wallet_address_to_admin_channel', {
        orderId: order._id,
        username: user.username,
      })
    );
  } catch (error) {
    logger.error(error);
  }
};

const currencyNotSupportedMessage = async (ctx, currencies) => {
  try {
    currencies = currencies.join(', ');
    await ctx.reply(ctx.i18n.t('currency_not_supported', { currencies }));
  } catch (error) {
    logger.error(error);
  }
};

const notAuthorized = async ctx => {
  try {
    await ctx.reply(ctx.i18n.t('not_authorized'));
  } catch (error) {
    logger.error(error);
  }
};

const mustBeANumber = async ctx => {
  try {
    await ctx.reply(ctx.i18n.t('not_number'));
  } catch (error) {
    logger.error(error);
  }
};

const showConfirmationButtons = async (ctx, orders, commandString) => {
  try {
    commandString = commandString.slice(1);
    const inlineKeyboard = [];
    while (orders.length > 0) {
      const lastTwo = orders.splice(-2);
      const lineBtn = lastTwo
        .map(ord => {
          return {
            _id: ord._id.toString(),
            fiat: ord.fiat_code,
            amount: ord.fiat_amount || '-',
            type: ord.type,
          };
        })
        .map(ord => ({
          text: `${ord._id.slice(0, 2)}..${ord._id.slice(-2)} - ${ord.type} - ${
            ord.fiat
          } ${ord.amount}`,
          callback_data: `${commandString}_${ord._id}`,
        }));
      inlineKeyboard.push(lineBtn);
    }

    const message =
      commandString === 'release'
        ? ctx.i18n.t('tap_release')
        : ctx.i18n.t('tap_button');

    await ctx.reply(message, {
      reply_markup: { inline_keyboard: inlineKeyboard },
    });
  } catch (error) {
    logger.error(error);
  }
};

module.exports = {
  startMessage,
  initBotErrorMessage,
  lockTokensRequestMessage,
  sellOrderCorrectFormatMessage,
  buyOrderCorrectFormatMessage,
  errorParsingWalletAddressMessage,
  invalidWalletAddressMessage,
  publishBuyOrderMessage,
  invalidOrderMessage,
  invalidTypeOrderMessage,
  alreadyTakenOrderMessage,
  onGoingTakeSellMessage,
  invalidDataMessage,
  beginTakeBuyMessage,
  notActiveOrderMessage,
  publishSellOrderMessage,
  onGoingTakeBuyMessage,
  pendingSellMessage,
  pendingBuyMessage,
  notOrderMessage,
  customMessage,
  nonHandleErrorMessage,
  checkOrderMessage,
  mustBeValidToken,
  mustBeValidCurrency,
  mustBeANumberOrRange,
  helpMessage,
  mustBeGreatherEqThan,
  bannedUserErrorMessage,
  fiatSentMessages,
  orderOnfiatSentStatusMessages,
  takeSellWaitingSellerToPayMessage,
  userBannedMessage,
  notFoundUserMessage,
  notValidIdMessage,
  cantTakeOwnOrderMessage,
  noWalletAddressMessage,
  notOrdersMessage,
  noRateForCurrency,
  noRateForToken,
  beginTakeSellMessage,
  counterPartyWantsCooperativeCancelMessage,
  initCooperativeCancelMessage,
  okCooperativeCancelMessage,
  shouldWaitCooperativeCancelMessage,
  successCompleteOrderByAdminMessage,
  successCompleteOrderMessage,
  successCancelOrderByAdminMessage,
  successCancelOrderMessage,
  badStatusOnCancelOrderMessage,
  userCantTakeMoreThanOneWaitingOrderMessage,
  releaseInstructionsMessage,
  fundsReleasedMessages,
  rateUserMessage,
  listTokensResponse,
  listCurrenciesResponse,
  priceApiFailedMessage,
  showHoldInvoiceMessage,
  waitingForBuyerOrderMessage,
  sellerReleasedMessage,
  showInfoMessage,
  updateUserSettingsMessage,
  successCancelAllOrdersMessage,
  invalidRangeWithAmount,
  tooManyPendingOrdersMessage,
  wizardAddWalletAddressInitMessage,
  wizardAddWalletExitMessage,
  orderExpiredMessage,
  cantAddWalletAddressMessage,
  wizardExitMessage,
  wizardAddFiatAmountMessage,
  wizardAddFiatAmountWrongAmountMessage,
  wizardAddFiatAmountCorrectMessage,
  expiredOrderMessage,
  toBuyerDidntAddWalletAddressMessage,
  toSellerBuyerDidntAddWalletAddressMessage,
  toAdminChannelBuyerDidntAddWalletAddressMessage,
  toSellerDidntLockTokensMessage,
  toBuyerSellerDidntLockTokensMessage,
  toAdminChannelSellerDidntLockTokensMessage,
  genericErrorMessage,
  refundCooperativeCancelMessage,
  toBuyerExpiredOrderMessage,
  toSellerExpiredOrderMessage,
  currencyNotSupportedMessage,
  notAuthorized,
  mustBeANumber,
  showConfirmationButtons,
};
