const axios = require('axios');
const { I18n } = require('@grammyjs/i18n');
const currencies = require('./fiat.json');
const tokens = require('./tokens.json');
const languages = require('./languages.json');
const { User, Order, Community } = require('../models');
const BN = require('bn.js');
const BigDecimal = require("js-big-decimal");
const dapiServerDeployment = require('@api3/operations/chain/deployments/polygon-testnet/DapiServer.json');
const { ethers } = require("ethers");

const dapiServer = new ethers.Contract(
  process.env.API3_FEED_CONTRACT,  
  dapiServerDeployment.abi,
  new ethers.providers.JsonRpcProvider(process.env.RSK_PROVIDER)
);

const logger = require('../logger');


let locked = false;

const acquireOrdersLock = () => {
  if (locked) {
    return false;
  }

  locked = true;
  return true;
};

const releaseOrdersLock = () => {
  locked = false;
};

// ISO 4217, all ISO currency codes are 3 letters but users can trade shitcoins
const isIso4217 = code => {
  if (code.length < 3 || code.length > 5) {
    return false;
  }
  const alphabet = 'abcdefghijklmnopqrstuvwxyz'.split('');
  code = code.toLowerCase().split('');
  return code.every(letter => {
    if (alphabet.indexOf(letter) == -1) {
      return false;
    }
    return true;
  });
};

const getToken = code => {
  const token = tokens[process.env.NODE_ENV][code];
  if (!token || (token.decimals === undefined || token.decimals === null)) return false;

  return token;
};

const getCurrency = code => {
  if (!isIso4217(code)) return false;
  const currency = currencies[code];
  if (!currency) return false;

  return currency;
};

const plural = n => {
  if (n === 1) {
    return '';
  }
  return 's';
};

const isAddress = (address) => {
  return ethers.utils.isAddress(address);
};

// This function formats a number to locale strings.
// If Iso code or locale code doesn´t exist, the function will return a number without format.
const numberFormat = (code, number) => {
  if (!isIso4217(code)) return false;

  if (!currencies[code]) return number;

  const locale = currencies[code].locale;
  const numberToLocaleString = Intl.NumberFormat(locale);

  if (!locale || isNaN(number)) return number;

  return numberToLocaleString.format(number);
};

const toBaseUnit = (value, decimals) => {
  value = String(value);
  const regexStr = "^(0|[1-9]\\d*)(\\.\\d{0," + decimals + "})?$";

  if (decimals === undefined || decimals === null) {
    throw Error("No decimals");
  }
  if (new RegExp(regexStr).test(value) === false) {
      throw new Error("INVALID_NUMBER")
  }

  const ten = new BN(10);
  const base = ten.pow(new BN(decimals));

  // Is it negative?
  let negative = (value.substring(0, 1) === "-");
  if (negative) {
      value = value.substring(1);
  }

  if (value === ".") {
      throw new Error(
          `Invalid value ${value} cannot be converted to`
          + ` base unit with ${decimals} decimals.`);
  }

  // Split it into a whole and fractional part
  let comps = value.split(".");
  if (comps.length > 2) { throw new Error("Too many decimal points"); }

  let whole = comps[0], fraction = comps[1];

  if (!whole) { whole = "0"; }
  if (!fraction) { fraction = "0"; }
  if (fraction.length > decimals) {
      throw new Error("Too many decimal places");
  }

  while (fraction.length < decimals) {
      fraction += "0";
  }

  whole = new BN(whole, 10);
  fraction = new BN(fraction, 10);
  let baseUnit = (whole.mul(base)).add(fraction);

  if (negative) {
    baseUnit = baseUnit.neg();
  }

  return new BN(baseUnit.toString(10), 10);
};


const getOrderTotalAmount = (order) => {
  return new BigDecimal(order.amount).add(new BigDecimal(order.fee)).getValue();
};

const formatUnit = (value, decimals) => {
  value = new BN(value, 10);
  let base = new BN('10',10).pow(new BN(String(decimals),10));
  let fraction = value.mod(base).toString(10);

  while (fraction.length < decimals) {
      fraction = `0${fraction}`;
  }

  fraction = fraction.match(/^([0-9]*[1-9]|0)(0*)/)[1];

  let whole = value.div(base).toString(10);
  value = `${whole}.${fraction}`.replace(/0+$/, '');

  if (value.endsWith(".")) {
    value = whole;
  }

  return value;
};

const handleReputationItems = async (buyer, seller, order) => {  
  try {
    const amount = new BigDecimal(order.amount);
    let buyerVolumeTraded = {};
    let sellerVolumeTraded = {};

    if (buyer.volume_traded_json) {
      try {
        buyerVolumeTraded = JSON.parse(buyer.volume_traded_json)
      } catch (err) {
        buyerVolumeTraded = {};
      }
    }

    if (seller.volume_traded_json) {
      try {
        sellerVolumeTraded = JSON.parse(seller.volume_traded_json)
      } catch (err) {
        sellerVolumeTraded = {};
      }
    }

    if (!buyerVolumeTraded[order.token_code]) {
      buyerVolumeTraded[order.token_code] = '0';
    }

    if (!sellerVolumeTraded[order.token_code]) {
      sellerVolumeTraded[order.token_code] = '0';
    }

    buyer.trades_completed++;
    seller.trades_completed++;

    buyerVolumeTraded[order.token_code] = new BigDecimal(buyerVolumeTraded[order.token_code]).add(amount).getValue();
    sellerVolumeTraded[order.token_code] = new BigDecimal(sellerVolumeTraded[order.token_code]).add(amount).getValue();

    buyer.volume_traded_json = JSON.stringify(buyerVolumeTraded);
    seller.volume_traded_json = JSON.stringify(sellerVolumeTraded);
    
    await buyer.save();
    await seller.save();
  } catch (error) {
    logger.error(error);
    return false;
  }

  return true;
};


const fetchFairMarketPrice = async (fiatCode, tokenCode) => {
  const currency = getCurrency(fiatCode);
  const token = getToken(tokenCode);

  if (!currency || !currency.price) {
    throw "Invalid currency: " + fiatCode;
  }

  if (!token || (!token.stablecoin && !token.api3FeedId) || !token.decimals) {
    throw "Invalid token: " + token;
  }

  let usdRate = 0;
  let base = new BigDecimal(new BN('10', 10).pow(new BN(String(token.decimals), 10)));

  if (token.stablecoin) {
    usdRate = new BigDecimal('1').multiply(base).getValue();
  } else {
    let response = await dapiServer.readDataFeedWithId(token.api3FeedId);
    usdRate = response.value;
  }

  let fiatRate;

  if (currency.code === 'USD') {
    fiatRate = new BigDecimal(usdRate);
  } else {
    // Before hit the endpoint we make sure the code have only 3 chars
    const code = currency.code.substring(0, 3);
    const response = await axios.get(`${process.env.FIAT_RATE_EP}/${code}/USD`);
    if (response.data.error) {
      throw response.data.error;
    }
    fiatRate = new BigDecimal(usdRate).multiply(new BigDecimal(String(response.data.rate)));
  }

  return fiatRate.divide(base, 8).getValue();  
};

const getTokenAmountFromMarketPrice = async (fiatCode, fiatAmount, tokenCode, priceMargin) => {
  try {

    const token = getToken(tokenCode);
    if (!token || !token.decimals) {
      throw "Invalid token: " + token;
    }

    let fiatRate = new BigDecimal(await fetchFairMarketPrice(fiatCode, tokenCode));

    let marginPercent = new BigDecimal(priceMargin).divide(new BigDecimal(100));
    let finalRate = fiatRate.add(fiatRate.multiply(marginPercent));
    let base = new BigDecimal(new BN('10', 10).pow(new BN(String(token.decimals), 10)).toString());

    return new BigDecimal(fiatAmount).multiply(base).divide(finalRate, 0).getValue();

  } catch (error) {
    logger.error(error);
    return 0;
  }
};

const calculateExchangePrice = (fiatAmount, tokenAmount, tokenDecimals) => {

  try {
    let base = new BN('10', 10).pow(new BN(String(tokenDecimals), 10));
    let rate = new BigDecimal(base.toString()).multiply(new BigDecimal(fiatAmount)).divide(new BigDecimal(tokenAmount), 2);
    return rate.getValue();
  } catch (error) {
    logger.error(error);
    return "Unknown";
  }
};

const objectToArray = object => {
  const array = [];

  for (const i in object) array.push(object[i]);

  return array;
};

const getTokensWithPrice = () => {
  const tokensArr = objectToArray(tokens[process.env.NODE_ENV]);
  const withPrice = tokensArr.filter(token => (token.stablecoin || token.api3FeedId));

  return withPrice;
};

const getCurrenciesWithPrice = () => {
  const currenciesArr = objectToArray(currencies);
  const withPrice = currenciesArr.filter(currency => currency.price);

  return withPrice;
};

const getEmojiRate = rate => {
  const star = '⭐';
  const roundedRate = Math.round(rate);
  const output = [];
  for (let i = 0; i < roundedRate; i++) output.push(star);

  return output.join('');
};

// Round number to exp decimal digits
// Source: https://developer.mozilla.org/es/docs/Web/JavaScript/Reference/Global_Objects/Math/round#redondeo_decimal
const decimalRound = (value, exp) => {
  if (typeof exp === 'undefined' || +exp === 0) {
    return Math.round(value);
  }
  value = +value;
  exp = +exp;

  if (isNaN(value) || !(typeof exp === 'number' && exp % 1 === 0)) {
    return NaN;
  }
  // Shift
  value = value.toString().split('e');
  value = Math.round(+(value[0] + 'e' + (value[1] ? +value[1] - exp : -exp)));
  // Shift back
  value = value.toString().split('e');
  return +(value[0] + 'e' + (value[1] ? +value[1] + exp : exp));
};

const extractId = text => {
  const matches = text.match(/:([a-f0-9]{24}):$/);

  return matches[1];
};

// Clean strings that are going to be rendered with markdown
const sanitizeMD = text => {
  if (!text) return '';

  return text.toString().replace(/(?=[|(){}[\]\-_#.`=+])/g, '\\');
};

const secondsToTime = secs => {
  const hours = Math.floor(secs / (60 * 60));

  const divisor = secs % (60 * 60);
  const minutes = Math.floor(divisor / 60);

  return {
    hours,
    minutes,
  };
};

const isGroupAdmin = async (groupId, user, telegram) => {
  try {
    const member = await telegram.getChatMember(groupId, parseInt(user.tg_id));
    if (
      member &&
      (member.status === 'creator' || member.status === 'administrator')
    ) {
      return true;
    }

    return false;
  } catch (error) {
    logger.error(error);
    return false;
  }
};

const deleteOrderFromChannel = async (order, telegram) => {
  try {
    let channel = process.env.OFFERS_CHANNEL;
    if (order.community_id) {
      const community = await Community.findOne({ _id: order.community_id });
      if (!community) {
        return channel;
      }
      if (community.order_channels.length === 1) {
        channel = community.order_channels[0].name;
      } else {
        for await (const c of community.order_channels) {
          if (c.type === order.type) {
            channel = c.name;
          }
        }
      }
    }
    await telegram.deleteMessage(channel, order.tg_channel_message1);
  } catch (error) {
    logger.error(error);
  }
};

const getOrderChannel = async order => {
  let channel = process.env.OFFERS_CHANNEL;
  if (order.community_id) {
    const community = await Community.findOne({ _id: order.community_id });
    if (!community) {
      return channel;
    }
    if (community.order_channels.length === 1) {
      channel = community.order_channels[0].name;
    } else {
      community.order_channels.forEach(async c => {
        if (c.type === order.type) {
          channel = c.name;
        }
      });
    }
  }

  return channel;
};

const getDisputeChannel = async order => {
  let channel = process.env.DISPUTE_CHANNEL;
  if (order.community_id) {
    const community = await Community.findOne({ _id: order.community_id });
    channel = community.dispute_channel;
  }

  return channel;
};

/**
 * Returns a i18n context
 * @param {*} user
 * @returns i18n context
 */
const getUserI18nContext = async user => {
  const language = user.language || 'en';
  const i18n = new I18n({
    locale: language,
    defaultLanguageOnMissing: true,
    directory: 'locales',
  });

  return i18n.createContext(user.lang);
};

const getDetailedOrder = (i18n, order, buyer, seller) => {
  try {
    const buyerUsername = buyer ? sanitizeMD(buyer.username) : '';
    const sellerUsername = seller ? sanitizeMD(seller.username) : '';
    const buyerId = buyer ? buyer._id : '';
    const paymentMethod = sanitizeMD(order.payment_method);
    const priceMargin = sanitizeMD(order.price_margin.toString());
    let createdAt = order.created_at.toISOString();
    let takenAt = order.taken_at ? order.taken_at.toISOString() : '';
    createdAt = sanitizeMD(createdAt);
    takenAt = sanitizeMD(takenAt);
    const status = sanitizeMD(order.status);
    const fee = order.fee;
    const creator =
      order.creator_id === buyerId ? buyerUsername : sellerUsername;
    
    const token = getToken(order.token_code);
    const formattedAmount = sanitizeMD(formatUnit(order.amount, token.decimals));
    const message = i18n.t('order_detail', {
      order,
      creator,
      buyerUsername,
      sellerUsername,
      createdAt,
      takenAt,
      status,
      fee,
      paymentMethod,
      priceMargin,
      formattedAmount
    });

    return message;
  } catch (error) {
    logger.error(error);
  }
};

// We need to know if this user is a dispute solver for this community
const isDisputeSolver = (community, user) => {
  if (!community || !user) {
    return false;
  }

  return community.solvers.some(solver => solver.id == user._id);
};

// Return the fee the bot will charge to the seller
const getFee = async (amount) => {
  let feeRatio = new BigDecimal(process.env.FEE_PERCENT).divide(new BigDecimal("100"), 4);
  return feeRatio.multiply(new BigDecimal(amount)).round(0).getValue();
};

const itemsFromMessage = str => {
  return str
    .split(' ')
    .map(e => e.trim())
    .filter(e => !!e);
};

// Check if a number is int
const isInt = n => parseInt(n) === n;

// Check if a number is float
const isFloat = n => typeof n === 'number' && !isInt(n);

// Returns an emoji flag for a language
const getLanguageFlag = code => {
  return languages[code];
};

module.exports = {
  acquireOrdersLock,
  releaseOrdersLock,
  isIso4217,
  plural,
  getToken,
  getCurrency,
  toBaseUnit,
  formatUnit,
  isAddress,
  handleReputationItems,
  getTokenAmountFromMarketPrice,
  calculateExchangePrice,
  fetchFairMarketPrice,
  getTokensWithPrice,
  getCurrenciesWithPrice,
  getEmojiRate,
  decimalRound,
  extractId,
  sanitizeMD,
  secondsToTime,
  isGroupAdmin,
  deleteOrderFromChannel,
  getOrderChannel,
  getUserI18nContext,
  numberFormat,
  getDisputeChannel,
  getDetailedOrder,
  isDisputeSolver,
  getFee,
  itemsFromMessage,
  isInt,
  isFloat,
  getLanguageFlag,
  getOrderTotalAmount
};
