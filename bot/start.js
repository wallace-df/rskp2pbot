const { Telegraf, session } = require('telegraf');
const { I18n } = require('@grammyjs/i18n');
const { limit } = require('@grammyjs/ratelimiter');
const schedule = require('node-schedule');
const {
  Order,
  User,
  PendingPayment,
  Community,
  Dispute,
} = require('../models');
const { getCurrenciesWithPrice, deleteOrderFromChannel } = require('../util');
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
  attemptPendingPayments,
  cancelOrders,
  deleteOrders,
  calculateEarnings,
  attemptCommunitiesPendingPayments,
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

  // We schedule pending payments job
  schedule.scheduleJob(
    `*/${process.env.PENDING_PAYMENT_WINDOW} * * * *`,
    async () => {
      await attemptPendingPayments(bot);
    }
  );

  schedule.scheduleJob(`*/3 * * * *`, async () => {
    await cancelOrders(bot);
  });

  schedule.scheduleJob(`25 * * * *`, async () => {
    await deleteOrders(bot);
  });

  schedule.scheduleJob(`*/10 * * * *`, async () => {
    await calculateEarnings();
  });

  schedule.scheduleJob(`*/5 * * * *`, async () => {
    await attemptCommunitiesPendingPayments(bot);
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

  DisputeModule.configure(bot);

  bot.command('cancelorder', adminMiddleware, async ctx => {
    try {
      const [orderId] = await validateParams(ctx, 2, '\\<_order id_\\>');

      if (!orderId) return;
      if (!(await validateObjectId(ctx, orderId))) return;
      const order = await Order.findOne({ _id: orderId });

      if (!order) return;

      // We look for a dispute for this order
      const dispute = await Dispute.findOne({ order_id: order._id });

      // We check if this is a solver, the order must be from the same community
      if (!ctx.admin.admin) {
        if (!order.community_id) {
          logger.debug(
            `cancelorder ${order._id}: The order is not in a community`
          );
          return await messages.notAuthorized(ctx);
        }

        if (order.community_id != ctx.admin.default_community_id) {
          logger.debug(
            `cancelorder ${order._id}: The community and the default user community are not the same`
          );
          return await messages.notAuthorized(ctx);
        }

        // We check if this dispute is from a community we validate that
        // the solver is running this command
        if (dispute && dispute.solver_id != ctx.admin._id) {
          logger.debug(
            `cancelorder ${order._id}: @${ctx.admin.username} is not the solver of this dispute`
          );
          return await messages.notAuthorized(ctx);
        }
      }

      //if (order.hash) await cancelHoldInvoice({ hash: order.hash });

      if (dispute) {
        dispute.status = 'SELLER_REFUNDED';
        await dispute.save();
      }

      logger.info(`order ${order._id}: cancelled by admin`);

      order.status = 'CANCELED_BY_ADMIN';
      order.canceled_by = ctx.admin._id;
      const buyer = await User.findOne({ _id: order.buyer_id });
      const seller = await User.findOne({ _id: order.seller_id });
      await order.save();
      // we sent a private message to the admin
      await messages.successCancelOrderMessage(ctx, ctx.admin, order, ctx.i18n);
      // we sent a private message to the seller
      await messages.successCancelOrderByAdminMessage(ctx, bot, seller, order);
      // we sent a private message to the buyer
      await messages.successCancelOrderByAdminMessage(ctx, bot, buyer, order);
    } catch (error) {
      logger.error(error);
    }
  });

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
        await cancelOrder(ctx, orderId, ctx.user);
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

  bot.command('settleorder', adminMiddleware, async ctx => {
    try {
      const [orderId] = await validateParams(ctx, 2, '\\<_order id_\\>');

      if (!orderId) return;
      if (!(await validateObjectId(ctx, orderId))) return;

      const order = await Order.findOne({ _id: orderId });
      if (!order) return;

      // We look for a dispute for this order
      const dispute = await Dispute.findOne({ order_id: order._id });

      // We check if this is a solver, the order must be from the same community
      if (!ctx.admin.admin) {
        if (!order.community_id) {
          return await messages.notAuthorized(ctx);
        }

        if (order.community_id != ctx.admin.default_community_id) {
          return await messages.notAuthorized(ctx);
        }

        // We check if this dispute is from a community we validate that
        // the solver is running this command
        if (dispute && dispute.solver_id != ctx.admin.id) {
          return await messages.notAuthorized(ctx);
        }
      }

      if (order.secret) await settleHoldInvoice({ secret: order.secret });

      if (dispute) {
        dispute.status = 'SETTLED';
        await dispute.save();
      }

      order.status = 'COMPLETED_BY_ADMIN';
      const buyer = await User.findOne({ _id: order.buyer_id });
      const seller = await User.findOne({ _id: order.seller_id });
      await order.save();
      // we sent a private message to the admin
      await messages.successCompleteOrderMessage(ctx, order);
      // we sent a private message to the seller
      await messages.successCompleteOrderByAdminMessage(
        ctx,
        bot,
        seller,
        order
      );
      // we sent a private message to the buyer
      await messages.successCompleteOrderByAdminMessage(ctx, bot, buyer, order);
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

      if (order.status === 'SUCCESS')
        return await messages.successCompleteOrderMessage(ctx, order);


      if (order.status === 'WAITING_BUYER_ADDRESS') {
        order.buyer_address = address;
        const seller = await User.findOne({ _id: order.seller_id });
        await waitPayment(ctx, bot, ctx.user, seller, order, address);
      }

      await order.save();
    } catch (error) {
      logger.error(error);
    }
  });


  OrdersModule.configure(bot);

  bot.action('addWalletAddressBtn', userMiddleware, async ctx => {
    await addWalletAddress(ctx, bot);
  });

  bot.action('cancelAddWalletAddressBtn', userMiddleware, async ctx => {
    await cancelAddWalletAddress(ctx, bot);
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
    await cancelOrder(ctx, ctx.match[1]);
  });

  bot.action(/^fiatsent_([0-9a-f]{24})$/, userMiddleware, async ctx => {
    ctx.deleteMessage();
    await fiatSent(ctx, ctx.match[1]);
  });

  bot.action(/^release_([0-9a-f]{24})$/, userMiddleware, async ctx => {
    ctx.deleteMessage();
    await release(ctx, ctx.match[1]);
  });

  bot.command('paytobuyer', adminMiddleware, async ctx => {
    try {
      const [orderId] = await validateParams(ctx, 2, '\\<_order id_\\>');
      if (!orderId) return;
      if (!(await validateObjectId(ctx, orderId))) return;
      const order = await Order.findOne({
        _id: orderId,
      });
      if (!order) return await messages.notActiveOrderMessage(ctx);

      // We make sure the buyers invoice is not being paid
      const isPending = await PendingPayment.findOne({
        order_id: order._id,
        attempts: { $lt: process.env.PAYMENT_ATTEMPTS },
      });

      if (isPending) return;

      await payToBuyer(bot, order);
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
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));

  return bot;
};

module.exports = { initialize, start };
