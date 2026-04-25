const { Schema, model } = require('mongoose');

const userSchema = new Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },
    upiId: { type: String, default: null },
    ltcAddress: { type: String, default: null },
    usdtAddress: { type: String, default: null },
    reputation: { type: Number, default: 0, min: 0 },
    totalDeals: { type: Number, default: 0, min: 0 },
    scamReports: { type: Number, default: 0, min: 0 },
    completedDeals: { type: Number, default: 0, min: 0 },
    cancelledDeals: { type: Number, default: 0, min: 0 },
    disputes: { type: Number, default: 0, min: 0 },
    ratingScore: { type: Number, default: 5, min: 0, max: 5 },
  },
  { timestamps: true }
);

module.exports = model('User', userSchema);
