const { Schema, model } = require('mongoose');

const DEAL_STATUSES = [
  'INITIATED',
  'PAYMENT_PENDING',
  'PAID',
  'DELIVERED',
  'COMPLETED',
  'DISPUTE',
  'CANCELLED',
];

const dealSchema = new Schema(
  {
    dealId: { type: String, required: true, unique: true, index: true },
    buyerId: { type: String, required: true, index: true },
    sellerId: { type: String, required: true, index: true },
    product: { type: String, required: true, trim: true, maxlength: 500 },
    amount: { type: Number, required: true, min: 0.01 },
    currency: { type: String, required: true, enum: ['INR', 'USD'], default: 'USD' },
    method: { type: String, required: true, enum: ['UPI', 'LTC', 'USDT'] },
    status: { type: String, required: true, enum: DEAL_STATUSES, default: 'INITIATED' },
    paymentProof: { type: String, default: null },
    uniqueNote: { type: String, required: true },
    lockedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true, index: true },
    buyerConfirmedFinal: { type: Boolean, default: false },
    sellerConfirmedFinal: { type: Boolean, default: false },
    paymentConfirmedBySeller: { type: Boolean, default: false },
    deliveryConfirmedBySeller: { type: Boolean, default: false },
    deliveryConfirmedByBuyer: { type: Boolean, default: false },
    threadChannelId: { type: String, default: null },
    messageId: { type: String, default: null },
  },
  { timestamps: true }
);

dealSchema.index({ expiresAt: 1, status: 1 });

module.exports = {
  Deal: model('Deal', dealSchema),
  DEAL_STATUSES,
};
