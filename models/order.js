const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
  description: { type: String },
  amount: {
    // amount in satoshis
    type: Number,
    min: 0,
  },
  max_amount: {
    // max amount in fiat
    type: Number,
    min: 0,
  },
  min_amount: {
    // min amount in fiat
    type: Number,
    min: 0,
  },
  fee: { type: Number, min: 0 },
  bot_fee: { type: Number, min: 0 }, // bot MAX_FEE at the moment of order creation
  community_fee: { type: Number, min: 0 }, // community FEE_PERCENT at the moment of order creation
  routing_fee: { type: Number, min: 0, default: 0 },
  buyer_hash: {
    type: String,
    index: {
      unique: true,
      partialFilterExpression: { buyer_hash: { $type: 'string' } },
    },
  },
  buyer_secret: {
    type: String,
    index: {
      unique: true,
      partialFilterExpression: { buyer_secret: { $type: 'string' } },
    },
  }, 
  seller_hash: {
    type: String,
    index: {
      unique: true,
      partialFilterExpression: { seller_hash: { $type: 'string' } },
    },
  },
  seller_secret: {
    type: String,
    index: {
      unique: true,
      partialFilterExpression: { seller_secret: { $type: 'string' } },
    },
  }, 
  creator_id: { type: String },
  seller_id: { type: String },
  buyer_id: { type: String },
  buyer_address: { type: String },
  buyer_dispute: { type: Boolean, default: false },
  seller_dispute: { type: Boolean, default: false },
  buyer_cooperativecancel: { type: Boolean, default: false },
  seller_cooperativecancel: { type: Boolean, default: false },
  canceled_by: { type: String },
  status: {
    type: String,
    enum: [
      'WAITING_PAYMENT', // buyer waiting for seller to lock tokens
      'WAITING_BUYER_ADDRESS', // seller waiting for buyer inform the address where he/she will receive the tokens
      'PENDING', // order published on CHANNEL but not taken yet
      'ACTIVE', //  order taken
      'FIAT_SENT', // buyer indicates the fiat payment is already done
      'CLOSED', // order closed
      'DISPUTE', // one of the parties started a dispute
      'CANCELED',
      'SUCCESS',
      'PAID_HOLD_INVOICE', // seller released funds
      'CANCELED_BY_ADMIN',
      'EXPIRED', // Expired orders, stated changed by a job
      'COMPLETED_BY_ADMIN',
    ],
  },
  type: { type: String },
  token_code: { type: String },
  fiat_amount: { type: Number, min: 1 }, // amount in fiat
  fiat_code: { type: String },
  payment_method: { type: String },
  created_at: { type: Date, default: Date.now },
  tokens_held_at: { type: Date },
  taken_at: { type: Date },
  tg_chat_id: { type: String },
  tg_order_message: { type: String },
  tg_channel_message1: { type: String },
  range_parent_id: { type: String }, // If the order have a parent we save the Id
  price_from_api: { type: Boolean },
  price_margin: { type: Number, default: 0 },
  calculated: { type: Boolean, default: false },
  admin_warned: { type: Boolean, default: false }, // We set this to true when the bot warns admins the order is about to expire
  community_id: { type: String },
});

module.exports = mongoose.model('Order', OrderSchema);
