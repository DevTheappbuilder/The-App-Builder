const { Schema, model } = require('mongoose');

const invoiceSchema = new Schema(
  {
    invoiceId: { type: String, required: true, unique: true, index: true },
    dealId: { type: String, required: true, index: true },
    createdBy: { type: String, required: true, index: true },
    buyerId: { type: String, required: true },
    sellerId: { type: String, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
    method: { type: String, required: true },
    statusSnapshot: { type: String, required: true },
    stageSnapshot: { type: String, required: true },
    content: { type: String, required: true, maxlength: 4000 },
  },
  { timestamps: true }
);

module.exports = model('Invoice', invoiceSchema);
