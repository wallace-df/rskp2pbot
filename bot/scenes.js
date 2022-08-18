const { Scenes } = require('telegraf');
const { isValidInvoice } = require('./validations');
const { Order, PendingPayment } = require('../models');
const { waitPayment, addWalletAddress, showHoldInvoice } = require('./commands');
const { getCurrency, getUserI18nContext } = require('../util');
const messages = require('./messages');
const { isPendingPayment } = require('../ln');
const logger = require('../logger');

const addInvoiceWizard = new Scenes.WizardScene(
  'ADD_INVOICE_WIZARD_SCENE_ID',
  async ctx => {
    try {V
      const { order } = ctx.wizard.state;
      const expirationTime =
        parseInt(process.env.HOLD_INVOICE_EXPIRATION_WINDOW) / 60;
      const currency = getCurrency(order.fiat_code);
      const symbol =
        !!currency && !!currency.symbol_native
          ? currency.symbol_native
          : order.fiat_code;
      await messages.wizardAddInvoiceInitMessage(
        ctx,
        order,
        symbol,
        expirationTime
      );

      order.status = 'WAITING_BUYER_ADDRESS';
      await order.save();
      return ctx.wizard.next();
    } catch (error) {
      logger.error(error);
    }
  },
  async ctx => {
    try {
      if (ctx.message === undefined) return ctx.scene.leave();
      if (ctx.message.document)
        return await ctx.reply(ctx.i18n.t('must_enter_text'));

      const walletAddress = ctx.message.text.trim();
      let { bot, buyer, seller, order } = ctx.wizard.state;
      // We get an updated order from the DB
      order = await Order.findOne({ _id: order._id });
      if (!order) {
        await ctx.reply(ctx.i18n.t('generic_error'));
        return ctx.scene.leave();
      }

      const res = await isValidInvoice(ctx, lnInvoice);
      if (!res.success) {
        return;
      }

      if (order.status === 'EXPIRED') {
        await messages.orderExpiredMessage(ctx);
        return ctx.scene.leave();
      }

      if (order.status !== 'WAITING_BUYER_ADDRESS') {
        await messages.cantAddInvoiceMessage(ctx);
        return ctx.scene.leave();
      }

      if (res.invoice.tokens && res.invoice.tokens !== order.amount)
        return await messages.incorrectAmountInvoiceMessage(ctx);

      await waitPayment(ctx, bot, buyer, seller, order, lnInvoice);

      return ctx.scene.leave();
    } catch (error) {
      logger.error(error);
      ctx.scene.leave();
    }
  }
);

const addFiatAmountWizard = new Scenes.WizardScene(
  'ADD_FIAT_AMOUNT_WIZARD_SCENE_ID',
  async ctx => {
    try {
      const { order } = ctx.wizard.state;
      const currency = getCurrency(order.fiat_code);
      const action =
        order.type === 'buy' ? ctx.i18n.t('receive') : ctx.i18n.t('send');
      const currencyName =
        !!currency && !!currency.name_plural
          ? currency.name_plural
          : order.fiat_code;
      await messages.wizardAddFiatAmountMessage(
        ctx,
        currencyName,
        action,
        order
      );

      return ctx.wizard.next();
    } catch (error) {
      logger.error(error);
    }
  },
  async ctx => {
    try {
      const { bot, order } = ctx.wizard.state;

      if (ctx.message === undefined) return ctx.scene.leave();

      const fiatAmount = parseInt(ctx.message.text.trim());
      if (!Number.isInteger(fiatAmount))
        return await messages.wizardAddFiatAmountWrongAmountMessage(ctx, order);

      if (fiatAmount < order.min_amount || fiatAmount > order.max_amount)
        return await messages.wizardAddFiatAmountWrongAmountMessage(ctx, order);

      order.fiat_amount = fiatAmount;
      const currency = getCurrency(order.fiat_code);
      await messages.wizardAddFiatAmountCorrectMessage(
        ctx,
        currency,
        fiatAmount
      );

      if (order.type === 'sell') {
        await addWalletAddress(ctx, bot, order);
      } else {
        await showHoldInvoice(ctx, bot, order);
      }

      return ctx.scene.leave();
    } catch (error) {
      logger.error(error);
    }
  }
);

module.exports = {
  addInvoiceWizard,
  addFiatAmountWizard
};
