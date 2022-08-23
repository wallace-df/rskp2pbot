const { Scenes, Markup } = require('telegraf');
const logger = require('../../../logger');
const { getCurrency, getToken, toBaseUnit } = require('../../../util');
const ordersActions = require('../../ordersActions');
const {
  publishBuyOrderMessage,
  publishSellOrderMessage,
} = require('../../messages');
const messages = require('./messages');

const CREATE_ORDER = (exports.CREATE_ORDER = 'CREATE_ORDER_WIZARD');

exports.middleware = () => {
  const stage = new Scenes.Stage([createOrder]);
  return stage.middleware();
};

const createOrder = (exports.createOrder = new Scenes.WizardScene(
  CREATE_ORDER,
  async ctx => {
    try {
      const {
        user,
        community,
        statusMessage,
        type,
        tokenCode,
        currency,
        fiatAmount,
        tokenAmount,
        priceMargin,
        method,
      } = ctx.wizard.state;
      if (!statusMessage) {
        const { text } = messages.createOrderWizardStatus(
          ctx.i18n,
          ctx.wizard.state
        );
        const res = await ctx.reply(text);
        ctx.wizard.state.currentStatusText = text;
        ctx.wizard.state.statusMessage = res;
        ctx.wizard.state.updateUI = async () => {
          try {
            const { text } = messages.createOrderWizardStatus(
              ctx.i18n,
              ctx.wizard.state
            );
            if (ctx.wizard.state.currentStatusText === text) return;
            await ctx.telegram.editMessageText(
              res.chat.id,
              res.message_id,
              null,
              text
            );
            ctx.wizard.state.currentStatusText = text;
          } catch (err) {
            logger.error(err);
          }
        };
      }
      if (undefined === tokenCode) return createOrderSteps.token(ctx);
      if (undefined === currency) return createOrderSteps.currency(ctx);
      if (undefined === fiatAmount) return createOrderSteps.fiatAmount(ctx);
      if (undefined === tokenAmount) return createOrderSteps.tokenAmount(ctx);
      if (undefined === priceMargin && tokenAmount === 0)
        return createOrderSteps.priceMargin(ctx);
      if (undefined === method) return createOrderSteps.method(ctx);

      const order = await ordersActions.createOrder(ctx.i18n, ctx, user, {
        type,
        tokenCode,
        amount: tokenAmount,
        fiatAmount,
        fiatCode: currency,
        paymentMethod: method,
        status: 'PENDING',
        priceMargin,
        community_id: community && community.id,
      });
      if (order) {
        const publishFn =
          type === 'buy' ? publishBuyOrderMessage : publishSellOrderMessage;
        publishFn(ctx, user, order, ctx.i18n, true);
      }
      return ctx.scene.leave();
    } catch (err) {
      logger.error(err);
      return ctx.scene.leave();
    }
  },
  async ctx => {
    try {
      if (ctx.wizard.state.handler) {
        const ret = await ctx.wizard.state.handler(ctx);
        if (!ret) return;
        delete ctx.wizard.state.handler;
      }
      await ctx.wizard.selectStep(0);
      return ctx.wizard.steps[ctx.wizard.cursor](ctx);
    } catch (err) {
      logger.error(err);
      return ctx.scene.leave();
    }
  }
));

const createOrderSteps = {
  async token(ctx) {
    const prompt = await createOrderPrompts.token(ctx);
    const deletePrompt = () =>
      ctx.telegram.deleteMessage(prompt.chat.id, prompt.message_id);
    ctx.wizard.state.handler = async ctx => {
      ctx.wizard.state.error = null;
      if (!ctx.wizard.state.tokens) {
        await ctx.deleteMessage();
        if (ctx.message === undefined) return ctx.scene.leave();
        const token = getToken(ctx.message.text.toUpperCase());
        if (!token) {
          ctx.wizard.state.error = ctx.i18n.t('invalid_token');
          return await ctx.wizard.state.updateUI();
        }
        ctx.wizard.state.tokenCode = token.code;
        ctx.wizard.state.tokenDecimals = token.decimals;
        await ctx.wizard.state.updateUI();
      } else {
        if (!ctx.callbackQuery) return;
        const tokenCode = ctx.callbackQuery.data;
        const tokenObj = getToken(tokenCode);
        if (!tokenObj) {
          ctx.wizard.state.error = ctx.i18n.t('invalid_token');
          return await ctx.wizard.state.updateUI();
        }
        ctx.wizard.state.tokenCode = tokenCode;
        ctx.wizard.state.tokenDecimals = tokenObj.decimals;
        await ctx.wizard.state.updateUI();
      }
      return deletePrompt();
    };
    return ctx.wizard.next();
  },

  async currency(ctx) {
    const prompt = await createOrderPrompts.currency(ctx);
    const deletePrompt = () =>
      ctx.telegram.deleteMessage(prompt.chat.id, prompt.message_id);
    ctx.wizard.state.handler = async ctx => {
      ctx.wizard.state.error = null;
      if (!ctx.wizard.state.currencies) {
        await ctx.deleteMessage();
        if (ctx.message === undefined) return ctx.scene.leave();
        const currency = getCurrency(ctx.message.text.toUpperCase());
        if (!currency) {
          ctx.wizard.state.error = ctx.i18n.t('invalid_currency');
          return await ctx.wizard.state.updateUI();
        }
        ctx.wizard.state.currency = currency.code;
        await ctx.wizard.state.updateUI();
      } else {
        if (!ctx.callbackQuery) return;
        const currency = ctx.callbackQuery.data;
        ctx.wizard.state.currency = currency;
        await ctx.wizard.state.updateUI();
      }
      return deletePrompt();
    };
    return ctx.wizard.next();
  },
  async fiatAmount(ctx) {
    ctx.wizard.state.handler = async ctx => {
      await createOrderHandlers.fiatAmount(ctx);
      return await ctx.telegram.deleteMessage(
        prompt.chat.id,
        prompt.message_id
      );
    };
    const prompt = await createOrderPrompts.fiatAmount(ctx);
    return ctx.wizard.next();
  },
  async method(ctx) {
    ctx.wizard.state.handler = async ctx => {
      if (ctx.message === undefined) return ctx.scene.leave();
      const { text } = ctx.message;
      if (!text) return;
      ctx.wizard.state.method = text;
      await ctx.wizard.state.updateUI();
      await ctx.deleteMessage();
      return await ctx.telegram.deleteMessage(
        prompt.chat.id,
        prompt.message_id
      );
    };
    const prompt = await ctx.reply(ctx.i18n.t('enter_payment_method'));
    return ctx.wizard.next();
  },
  async priceMargin(ctx) {
    const prompt = await createOrderPrompts.priceMargin(ctx);
    ctx.wizard.state.handler = async ctx => {
      ctx.wizard.state.error = null;
      if (!ctx.callbackQuery) {
        if (ctx.message === undefined) return ctx.scene.leave();
        const { text } = ctx.message;
        if (!text) return;
        await ctx.deleteMessage();
        if (isNaN(text)) {
          ctx.wizard.state.error = ctx.i18n.t('not_number');

          return await ctx.wizard.state.updateUI();
        }
        ctx.wizard.state.priceMargin = parseInt(text);
        await ctx.wizard.state.updateUI();
      } else {
        ctx.wizard.state.priceMargin = parseInt(ctx.callbackQuery.data);
        await ctx.wizard.state.updateUI();
      }
      return await ctx.telegram.deleteMessage(
        prompt.chat.id,
        prompt.message_id
      );
    };
    return ctx.wizard.next();
  },
  async tokenAmount(ctx) {
    const prompt = await createOrderPrompts.tokenAmount(ctx);
    ctx.wizard.state.handler = async ctx => {
      const ret = await createOrderHandlers.tokenAmount(ctx);
      if (!ret) return;
      return await ctx.telegram.deleteMessage(
        prompt.chat.id,
        prompt.message_id
      );
    };
    return ctx.wizard.next();
  },
};

const createOrderPrompts = {
  async priceMargin(ctx) {
    const margin = ['-5', '-4', '-3', '-2', '-1', '+1', '+2', '+3', '+4', '+5'];
    const buttons = margin.map(m => Markup.button.callback(m + '%', m));
    const rows = [];
    const chunkSize = 5;
    for (let i = 0; i < buttons.length; i += chunkSize) {
      const chunk = buttons.slice(i, i + chunkSize);
      rows.push(chunk);
    }
    const noMargin = [
      {
        text: ctx.i18n.t('no_premium_or_discount'),
        callback_data: '0',
        hide: false,
      },
    ];
    rows.splice(1, 0, noMargin);
    return ctx.reply(
      ctx.i18n.t('enter_premium_discount'),
      Markup.inlineKeyboard(rows)
    );
  },
  async token(ctx) {
    const { tokens } = ctx.wizard.state;
    if (!tokens) return ctx.reply(ctx.i18n.t('enter_currency'));
    const buttons = tokens.map(token =>
      Markup.button.callback(token, token)
    );
    const rows = [];
    const chunkSize = 3;
    for (let i = 0; i < buttons.length; i += chunkSize) {
      const chunk = buttons.slice(i, i + chunkSize);
      rows.push(chunk);
    }
    return ctx.reply(
      ctx.i18n.t('choose_currency'),
      Markup.inlineKeyboard(rows)
    );
  },
  async currency(ctx) {
    const { currencies } = ctx.wizard.state;
    if (!currencies) return ctx.reply(ctx.i18n.t('enter_currency'));
    const buttons = currencies.map(currency =>
      Markup.button.callback(currency, currency)
    );
    const rows = [];
    const chunkSize = 3;
    for (let i = 0; i < buttons.length; i += chunkSize) {
      const chunk = buttons.slice(i, i + chunkSize);
      rows.push(chunk);
    }
    return ctx.reply(
      ctx.i18n.t('choose_currency'),
      Markup.inlineKeyboard(rows)
    );
  },
  async fiatAmount(ctx) {
    const { currency } = ctx.wizard.state;
    return ctx.reply(ctx.i18n.t('enter_currency_amount', { currency }));
  },
  async tokenAmount(ctx) {
    const { tokenCode } = ctx.wizard.state;
    const button = Markup.button.callback(
      ctx.i18n.t('market_price'),
      'marketPrice'
    );
    return ctx.reply(
      ctx.i18n.t('enter_token_amount', {tokenCode}),
      Markup.inlineKeyboard([button])
    );
  },
};

const createOrderHandlers = {
  async fiatAmount(ctx) {
    if (ctx.message === undefined) return ctx.scene.leave();
    ctx.wizard.state.error = null;
    const inputs = ctx.message.text.split('-').map(Number);
    const notNumbers = inputs.filter(isNaN);
    await ctx.deleteMessage();
    if (notNumbers.length) {
      ctx.wizard.state.error = ctx.i18n.t('not_number');
      await ctx.wizard.state.updateUI();
      return;
    }
    const zeros = inputs.filter(n => n === 0);
    if (zeros.length) {
      ctx.wizard.state.error = ctx.i18n.t('not_zero');
      await ctx.wizard.state.updateUI();
      return;
    }
    ctx.wizard.state.fiatAmount = inputs;
    await ctx.wizard.state.updateUI();

    return true;
  },
  async tokenAmount(ctx) {
    const { tokenDecimals } = ctx.wizard.state;

    if (ctx.callbackQuery) {
      ctx.wizard.state.tokenAmount = 0;
      await ctx.wizard.state.updateUI();
      return true;
    }
    let input = ctx.message.text;
    await ctx.deleteMessage();

    try {
      input = Number(toBaseUnit(input, tokenDecimals).toString());
    } catch(err) {
      console.log(err);
      ctx.wizard.state.error = ctx.i18n.t('invalid_amount');
      await ctx.wizard.state.updateUI();
      return;
    }
    if (isNaN(input)) {
      ctx.wizard.state.error = ctx.i18n.t('not_number');
      await ctx.wizard.state.updateUI();
      return;
    }
    if (input < 0) {
      ctx.wizard.state.error = ctx.i18n.t('not_negative');
      await ctx.wizard.state.updateUI();
      return;
    }
    ctx.wizard.state.tokenAmount = parseInt(input);
    await ctx.wizard.state.updateUI();
    return true;
  },
};
