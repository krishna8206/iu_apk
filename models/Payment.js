const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  ride: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ride',
    default: null
  },
  type: {
    type: String,
    enum: ['ride', 'wallet_topup', 'refund', 'bonus', 'referral', 'withdrawal'],
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'INR'
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded'],
    default: 'pending'
  },
  method: {
    type: String,
    enum: ['cash', 'card', 'upi', 'wallet', 'razorpay', 'netbanking'],
    required: true
  },
  // Razorpay specific fields
  razorpay: {
    orderId: String,
    paymentId: String,
    signature: String,
    receipt: String,
    notes: mongoose.Schema.Types.Mixed
  },
  // UPI specific fields
  upi: {
    vpa: String, // Virtual Payment Address
    transactionId: String
  },
  // Card specific fields
  card: {
    last4: String,
    brand: String,
    network: String
  },
  // Wallet transaction details
  wallet: {
    previousBalance: Number,
    newBalance: Number,
    transactionType: {
      type: String,
      enum: ['credit', 'debit']
    }
  },
  // Refund details
  refund: {
    originalPaymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment'
    },
    refundId: String,
    refundAmount: Number,
    reason: String,
    processedAt: Date
  },
  // Fee breakdown
  fees: {
    platformFee: {
      type: Number,
      default: 0
    },
    processingFee: {
      type: Number,
      default: 0
    },
    gst: {
      type: Number,
      default: 0
    }
  },
  // Additional information
  description: String,
  metadata: mongoose.Schema.Types.Mixed,
  // Timestamps
  initiatedAt: {
    type: Date,
    default: Date.now
  },
  completedAt: Date,
  failedAt: Date,
  // Error information
  error: {
    code: String,
    message: String,
    details: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true
});

// Indexes
paymentSchema.index({ user: 1, createdAt: -1 });
paymentSchema.index({ ride: 1 });
paymentSchema.index({ status: 1 });
paymentSchema.index({ 'razorpay.paymentId': 1 });
paymentSchema.index({ 'razorpay.orderId': 1 });

// Virtual for net amount (after fees)
paymentSchema.virtual('netAmount').get(function() {
  return this.amount - (this.fees.platformFee + this.fees.processingFee + this.fees.gst);
});

// Method to calculate fees
paymentSchema.methods.calculateFees = function() {
  const platformFeeRate = 0.05; // 5% platform fee
  const processingFeeRate = 0.02; // 2% processing fee
  const gstRate = 0.18; // 18% GST
  
  this.fees.platformFee = Math.round(this.amount * platformFeeRate * 100) / 100;
  this.fees.processingFee = Math.round(this.amount * processingFeeRate * 100) / 100;
  this.fees.gst = Math.round((this.fees.platformFee + this.fees.processingFee) * gstRate * 100) / 100;
  
  return this;
};

// Method to mark as completed
paymentSchema.methods.markCompleted = function(razorpayData = {}) {
  this.status = 'completed';
  this.completedAt = new Date();
  
  if (razorpayData.paymentId) {
    this.razorpay.paymentId = razorpayData.paymentId;
  }
  if (razorpayData.signature) {
    this.razorpay.signature = razorpayData.signature;
  }
  
  return this.save();
};

// Method to mark as failed
paymentSchema.methods.markFailed = function(error) {
  this.status = 'failed';
  this.failedAt = new Date();
  this.error = {
    code: error.code || 'PAYMENT_FAILED',
    message: error.message || 'Payment failed',
    details: error.details || {}
  };
  
  return this.save();
};

// Method to process refund
paymentSchema.methods.processRefund = function(refundAmount, reason) {
  this.status = 'refunded';
  this.refund = {
    refundAmount,
    reason,
    processedAt: new Date()
  };
  
  return this.save();
};

// Static method to get payment statistics
paymentSchema.statics.getPaymentStats = async function(userId, startDate, endDate) {
  const matchStage = {
    user: mongoose.Types.ObjectId(userId),
    status: 'completed'
  };
  
  if (startDate && endDate) {
    matchStage.createdAt = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };
  }
  
  const stats = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$type',
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 },
        averageAmount: { $avg: '$amount' }
      }
    }
  ]);
  
  return stats;
};

// Transform JSON output
paymentSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Payment', paymentSchema);
