const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
  description: { type: String },
  amount: {
    // amount in tokens (we use string to handle big numbers)
    type: String
  },
  fee: { 
    // fee in tokens (we use string to handle big numbers)
    type: String 
  },
  max_fiat_amount: {
    // max amount in fiat
    type: Number,
    min: 0,
  },
  min_fiat_amount: {
    // min amount in fiat
    type: Number,
    min: 0,
  },
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
      'CLOSED', // order closed before being accepted
      'ACTIVE', //  order taken
      'CANCELED', // order cancelled
      'FIAT_SENT', // buyer indicates the fiat payment is already done
      'RELEASED', // seller released funds
      'DISPUTE', // one of the parties started a dispute
      'CANCELED_BY_ADMIN', // set when admin refunds the seller on a dispute
      'COMPLETED_BY_ADMIN', // set when the admin releases funds to the buyer on a dispute
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
  funds_unlocked: {type: Boolean, default: false },
  community_id: { type: String },
}, { optimisticConcurrency: true });

module.exports = mongoose.model('Order', OrderSchema);
