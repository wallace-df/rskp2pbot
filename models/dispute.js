const mongoose = require('mongoose');

const DisputeSchema = new mongoose.Schema({
  initiator: { type: String, required: true },
  seller_id: { type: String },
  buyer_id: { type: String },
  status: {
    type: String,
    enum: [
      'WAITING_FOR_SOLVER', // set when the buyer or the seller initiates a dispute
      'IN_PROGRESS', // taken by a solver
      'ADMIN_RELEASED', // admin/solver released funds to the buyer
      'ADMIN_REFUNDED', // canceled by admin/solver and refunded to seller
      'SELLER_RELEASED', // released by the seller
    ],
  },
  community_id: { type: String, default: null },
  order_id: { type: String, default: null },
  solver_id: { type: String, default: null },
  created_at: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Dispute', DisputeSchema);
