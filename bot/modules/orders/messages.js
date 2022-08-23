const { getOrderChannel, sanitizeMD, getToken, formatUnit } = require('../../../util');

exports.listOrdersResponse = async orders => {
  const tasks = orders.map(async order => {
    const channel = await getOrderChannel(order);
    let amount = '\\-';
    const status = order.status.split('_').join('\\_');
    const fiatAmount =
      typeof order.fiat_amount !== 'undefined'
        ? sanitizeMD(order.fiat_amount)
        : [
            sanitizeMD(order.min_amount),
            ' \\- ',
            sanitizeMD(order.max_amount),
          ].join('');

    if (typeof order.amount !== 'undefined') amount = order.amount;
    return [
      [''].join(''),
      ['`Id          `: ', '`', order.id, '`'].join(''),
      ['`Status      `: ', '`', status, '`'].join(''),
      ['`Token amount`: ', '`', amount, '`'].join(''),
      ['`Fiat amount `: ', '`', fiatAmount, '`'].join(''),
      ['`Fiat        `: ', '`', order.fiat_code, '`'].join(''),
      ['`Channel     `: ', '`', sanitizeMD(channel), '`'].join(''),
      ['`_________________________________`'].join(''),
    ].join('\n');
  });
  const lines = await Promise.all(tasks);
  const body = lines.join('\n');
  return {
    text: body,
    extra: {
      parse_mode: 'MarkdownV2',
    },
  };
};

exports.createOrderWizardStatus = (i18n, state) => {
  const { type, priceMargin } = state;
  const action = type === 'sell' ? i18n.t('selling') : i18n.t('buying');
  const paymentAction =
    type === 'sell' ? i18n.t('receive_payment') : i18n.t('pay');
  const fiatAmount =
    undefined === state.fiatAmount ? '__' : state.fiatAmount.join('-');
  const currency = state.currency || '__';

  let formattedAmount = '';
  if (state.tokenAmount && state.tokenCode) {
    let token  = getToken(state.tokenCode);
    formattedAmount = `${formatUnit(state.tokenAmount, token.decimals)} ${token.code}`
  } else if (state.tokenCode) {
    formattedAmount = state.tokenCode;
  }

  
  const text = [
    `${action} ${formattedAmount}`,
    `${i18n.t('for')} ${fiatAmount} ${currency}.`,
    `${paymentAction} ${i18n.t('by')} ${state.method || '__'}`,
    priceMargin
      ? `${i18n.t('rate')}: ${process.env.FIAT_RATE_NAME} ${priceMargin}%`
      : ``,
    state.error && `Error: ${state.error}`,
    ` `,
    i18n.t('wizard_to_exit'),
  ]
    .filter(e => e)
    .join('\n');

  return { text };
};
