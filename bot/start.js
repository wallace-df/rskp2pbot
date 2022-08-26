const { Telegraf, session } = require('telegraf');
const { I18n } = require('@grammyjs/i18n');
const { limit } = require('@grammyjs/ratelimiter');
const schedule = require('node-schedule');
const {
  Order,
  User,
  Community,
  Dispute,
} = require('../models');
const { getCurrenciesWithPrice, getTokensWithPrice, deleteOrderFromChannel } = require('../util');
const {
  commandArgsMiddleware,
  stageMiddleware,
  userMiddleware,
  adminMiddleware,
} = require('./middleware');
const ordersActions = require('./ordersActions');
const CommunityModule = require('./modules/community');
const LanguageModule = require('./modules/language');
const OrdersModule = require('./modules/orders');
const DisputeModule = require('./modules/dispute');
const {
  takebuy,
  takesell,
  rateUser,
  cancelAddWalletAddress,
  addWalletAddress,
  cancelShowHoldInvoice,
  showHoldInvoice,
  waitPayment,
  cancelOrder,
  fiatSent,
  release,
} = require('./commands');
const {
  settleHoldInvoice,
  payToBuyer,
} = require('../ln');
const {
  validateUser,
  validateParams,
  validateObjectId,
  validateWalletAddress,
} = require('./validations');
const messages = require('./messages');
const {
  syncEscrowedOrders,
  cancelOrders,
  deleteOrders,
  calculateEarnings,
} = require('../jobs');
const logger = require('../logger');

const askForConfirmation = async (user, command) => {
  try {
    const where = {};
    if (command == '/cancel') {
      where.$and = [
        { $or: [{ buyer_id: user._id }, { seller_id: user._id }] },
        {
          $or: [
            { status: 'ACTIVE' },
            { status: 'PENDING' },
            { status: 'FIAT_SENT' },
            { status: 'DISPUTE' },
          ],
        },
      ];
      const orders = await Order.find(where);

      return orders;
    } else if (command == '/fiatsent') {
      where.$and = [{ buyer_id: user._id }, { status: 'ACTIVE' }];
      const orders = await Order.find(where);

      return orders;
    } else if (command == '/release') {
      where.$and = [
        { seller_id: user._id },
        {
          $or: [
            { status: 'ACTIVE' },
            { status: 'FIAT_SENT' },
            { status: 'DISPUTE' },
          ],
        },
      ];
      const orders = await Order.find(where);

      return orders;
    } else if (command == '/refund') {
      where.$and = [
        { seller_id: user._id },
        {
          $or: [
            { status: 'CANCELED' },
          ],
        },
      ];
      const orders = await Order.find(where);

      return orders;
    }


    return [];
  } catch (error) {
    logger.error(error);
  }
};

const initialize = (botToken, options) => {
  const i18n = new I18n({
    defaultLanguageOnMissing: true, // implies allowMissing = true
    directory: 'locales',
    useSession: true,
  });

  const bot = new Telegraf(botToken, options);
  bot.catch(err => {
    logger.error(err);
  });

  bot.use(session());
  bot.use(limit());
  bot.use(i18n.middleware());
  bot.use(stageMiddleware());
  bot.use(commandArgsMiddleware());

  schedule.scheduleJob(`*/10 * * * * *`, async () => {
    await syncEscrowedOrders(bot);
  });

  schedule.scheduleJob(`*/10 * * * * *`, async () => {
    await cancelOrders(bot);
  });

  schedule.scheduleJob(`*/10 * * * *`, async () => {
    await deleteOrders(bot);
  });

  schedule.scheduleJob(`*/10 * * * *`, async () => {
    await calculateEarnings();
  });

  bot.start(async ctx => {
    try {
      const tgUser = ctx.update.message.from;
      if (!tgUser.username) return await messages.nonHandleErrorMessage(ctx);

      messages.startMessage(ctx);
      await validateUser(ctx, true);
    } catch (error) {
      logger.error(error);
    }
  });

  bot.command('version', async ctx => {
    try {
      const pckg = require('../package.json');
      await ctx.reply(pckg.version);
    } catch (err) {
      logger.error(err);
    }
  });

  CommunityModule.configure(bot);
  LanguageModule.configure(bot);

  bot.action('takesell', userMiddleware, async ctx => {
    await takesell(ctx, bot);
  });

  bot.action('takebuy', userMiddleware, async ctx => {
    await takebuy(ctx, bot);
  });

  DisputeModule.configure(bot);

  // We allow users cancel pending orders,
  // pending orders are the ones that are not taken by another user
  bot.command('cancel', userMiddleware, async ctx => {
    try {
      const params = ctx.update.message.text.split(' ');
      const [command, orderId] = params.filter(el => el);

      if (!orderId) {
        const orders = await askForConfirmation(ctx.user, command);
        if (!orders.length) return await ctx.reply(`${command}  <order Id>`);

        return await messages.showConfirmationButtons(ctx, orders, command);
      } else if (!(await validateObjectId(ctx, orderId))) {
        return;
      } else {
        await cancelOrder(ctx, bot, orderId, ctx.user);
      }
    } catch (error) {
      logger.error(error);
    }
  });

  // We allow users cancel all pending orders,
  // pending orders are the ones that are not taken by another user
  bot.command('cancelall', userMiddleware, async ctx => {
    try {
      const orders = await ordersActions.getOrders(ctx, ctx.user, 'PENDING');

      if (!orders) return;

      for (const order of orders) {
        // Save updated state first, then publish messages.
        // No need for locks here, since no funds have been put under escrow for PENDING orders.
        order.status = 'CANCELED';
        order.canceled_by = ctx.user.id;
        await order.save();

        // We delete the messages related to that order from the channel
        await deleteOrderFromChannel(order, bot.telegram);
      }
      // we sent a private message to the user
      await messages.successCancelAllOrdersMessage(ctx);
    } catch (error) {
      logger.error(error);
    }
  });

  // Only buyers can use this command
  bot.command('setaddress', userMiddleware, async ctx => {
    try {
      const [orderId, walletAddress] = await validateParams(
        ctx,
        3,
        '\\<_order id_\\> \\<_wallet address_\\>'
      );

      if (!orderId) return;
      if (!(await validateObjectId(ctx, orderId))) return;
      const address = await validateWalletAddress(ctx, walletAddress);
      if (!address){
        return await messages.invalidWalletAddressMessage(ctx);
      };
      const order = await Order.findOne({
        _id: orderId,
        buyer_id: ctx.user.id,
      });
      if (!order) return await messages.notActiveOrderMessage(ctx);

      if (order.status === 'RELEASED')
        return await messages.successCompleteOrderMessage(ctx, order);

      if (order.status === 'WAITING_BUYER_ADDRESS') {
        const seller = await User.findOne({ _id: order.seller_id });
        await waitPayment(ctx, bot, ctx.user, seller, order, address);
      }

    } catch (error) {
      logger.error(error);
    }
  });

  bot.command('help', userMiddleware, async ctx => {
    try {
      await messages.helpMessage(ctx);
    } catch (error) {
      logger.error(error);
    }
  });

  // Only buyers can use this command
  bot.command('fiatsent', userMiddleware, async ctx => {
    try {
      const params = ctx.update.message.text.split(' ');
      const [command, orderId] = params.filter(el => el);

      if (!orderId) {
        const orders = await askForConfirmation(ctx.user, command);
        if (!orders.length) return await ctx.reply(`${command} <order Id>`);

        return await messages.showConfirmationButtons(ctx, orders, command);
      } else if (!(await validateObjectId(ctx, orderId))) {
        return;
      } else {
        await fiatSent(ctx, orderId, ctx.user);
      }
    } catch (error) {
      logger.error(error);
    }
  });

  bot.command('release', userMiddleware, async ctx => {
    try {
      const params = ctx.update.message.text.split(' ');
      const [command, orderId] = params.filter(el => el);

      if (!orderId) {
        const orders = await askForConfirmation(ctx.user, command);
        if (!orders.length) return await ctx.reply(`${command} <order Id>`);

        return await messages.showConfirmationButtons(ctx, orders, command);
      } else if (!(await validateObjectId(ctx, orderId))) {
        return;
      } else {
        await release(ctx, orderId, ctx.user);
      }
    } catch (error) {
      logger.error(error);
    }
  });

  // We allow sellers to get a refund link for their cancelled orders.
  bot.command('refund', userMiddleware, async ctx => {
    try {
      const params = ctx.update.message.text.split(' ');
      const [command, orderId] = params.filter(el => el);

      if (!orderId) {
        const orders = await askForConfirmation(ctx.user, command);
        if (!orders.length) return await ctx.reply(`${command}  <order Id>`);

        return await messages.showConfirmationButtons(ctx, orders, command);
      } else if (!(await validateObjectId(ctx, orderId))) {
        return;
      } else {
        await refund(ctx, orderId, ctx.user);
      }
    } catch (error) {
      logger.error(error);
    }
  });

  bot.command('checkorder', adminMiddleware, async ctx => {
    try {
      const [orderId] = await validateParams(ctx, 2, '\\<_order id_\\>');

      if (!orderId) return;
      if (!(await validateObjectId(ctx, orderId))) return;
      const order = await Order.findOne({ _id: orderId });

      if (!order) return;

      const buyer = await User.findOne({ _id: order.buyer_id });
      const seller = await User.findOne({ _id: order.seller_id });

      await messages.checkOrderMessage(ctx, order, buyer, seller);
    } catch (error) {
      logger.error(error);
    }
  });

  bot.command('ban', adminMiddleware, async ctx => {
    try {
      let [username] = await validateParams(ctx, 2, '\\<_username_\\>');

      if (!username) return;

      username = username[0] == '@' ? username.slice(1) : username;

      const user = await User.findOne({ username });
      if (!user) {
        await messages.notFoundUserMessage(ctx);
        return;
      }

      // We check if this is a solver, we ban the user only in the default community of the solver
      if (!ctx.admin.admin) {
        if (ctx.admin.default_community_id) {
          const community = await Community.findOne({
            _id: user.default_community_id,
          });
          community.banned_users.push({
            id: user._id,
            username: user.username,
          });
          await community.save();
        } else {
          return await ctx.reply(ctx.i18n.t('need_default_community'));
        }
      } else {
        user.banned = true;
        await user.save();
      }
      await messages.userBannedMessage(ctx);
    } catch (error) {
      logger.error(error);
    }
  });

  OrdersModule.configure(bot);

  bot.action('addWalletAddressBtn', userMiddleware, async ctx => {
    await addWalletAddress(ctx, bot);
  });

  bot.action('cancelAddWalletAddressBtn', userMiddleware, async ctx => {
    await cancelAddWalletAddress(ctx, bot, null, true);
  });

  bot.action('showHoldInvoiceBtn', userMiddleware, async ctx => {
    await showHoldInvoice(ctx, bot);
  });

  bot.action('cancelShowHoldInvoiceBtn', userMiddleware, async ctx => {
    await cancelShowHoldInvoice(ctx, bot);
  });

  bot.action(/^showStarBtn\(([1-5]),(\w{24})\)$/, userMiddleware, async ctx => {
    await rateUser(ctx, bot, ctx.match[1], ctx.match[2]);
  });

  bot.action(/^cancel_([0-9a-f]{24})$/, userMiddleware, async ctx => {
    ctx.deleteMessage();
    await cancelOrder(ctx, bot, ctx.match[1], null);
  });

  bot.action(/^fiatsent_([0-9a-f]{24})$/, userMiddleware, async ctx => {
    ctx.deleteMessage();
    await fiatSent(ctx, ctx.match[1]);
  });

  bot.action(/^release_([0-9a-f]{24})$/, userMiddleware, async ctx => {
    ctx.deleteMessage();
    await release(ctx, ctx.match[1]);
  });

  bot.command('listtokens', userMiddleware, async ctx => {
    try {
      const tokens = getTokensWithPrice();

      await messages.listTokensResponse(ctx, tokens);
    } catch (error) {
      logger.error(error);
    }
  });

  bot.command('listcurrencies', userMiddleware, async ctx => {
    try {
      const currencies = getCurrenciesWithPrice();

      await messages.listCurrenciesResponse(ctx, currencies);
    } catch (error) {
      logger.error(error);
    }
  });

  bot.command('info', userMiddleware, async ctx => {
    try {
      await messages.showInfoMessage(bot, ctx.user);
    } catch (error) {
      logger.error(error);
    }
  });

  bot.command('showusername', userMiddleware, async ctx => {
    try {
      let [show] = await validateParams(ctx, 2, '_yes/no_');
      if (!show) return;
      show = show === 'yes';
      ctx.user.show_username = show;
      await ctx.user.save();
      messages.updateUserSettingsMessage(ctx, 'showusername', show);
    } catch (error) {
      logger.error(error);
    }
  });

  bot.command('showvolume', userMiddleware, async ctx => {
    try {
      let [show] = await validateParams(ctx, 2, '_yes/no_');
      if (!show) return;
      show = show === 'yes';
      ctx.user.show_volume_traded = show;
      await ctx.user.save();
      messages.updateUserSettingsMessage(ctx, 'showvolume', show);
    } catch (error) {
      logger.error(error);
    }
  });

  bot.command('exit', userMiddleware, async ctx => {
    try {
      if (ctx.message.chat.type !== 'private') return;

      await ctx.reply(ctx.i18n.t('not_wizard'));
    } catch (error) {
      logger.error(error);
    }
  });

  bot.on('text', userMiddleware, async ctx => {
    try {
      if (ctx.message.chat.type !== 'private') return;

      const text = ctx.message.text;
      let message;
      // If the user is trying to enter a command with first letter uppercase
      if (text[0] === '/' && text[1] === text[1].toUpperCase()) {
        message = ctx.i18n.t('no_capital_letters');
      } else {
        message = ctx.i18n.t('unknown_command');
      }
      ctx.reply(message);
    } catch (error) {
      logger.error(error);
    }
  });

  return bot;
};

const start = (botToken, options) => {
  const bot = initialize(botToken, options);

  bot.launch();

  logger.notice('Bot launched.');

  // Enable graceful stop
  process.on('SIGINT', async () => { bot.stop('SIGINT'); await schedule.gracefulShutdown(); process.exit(0) } );
  process.on('SIGTERM', async () => { bot.stop('SIGINT'); await schedule.gracefulShutdown(); process.exit(0) } );

  return bot;
};

module.exports = { initialize, start };
