const express = require('express');
const Payment = require('../models/Payment');
const User = require('../models/User');
const Ride = require('../models/Ride');
const { authenticateToken } = require('../middleware/auth');
const { validatePayment } = require('../middleware/validation');
const { 
  createOrder, 
  verifyPayment, 
  createRefund, 
  getPaymentDetails,
  verifyWebhookSignature 
} = require('../utils/razorpay');

const router = express.Router();

// Create payment order
router.post('/create-order', authenticateToken, validatePayment, async (req, res) => {
  try {
    const { amount, currency = 'INR', rideId, method = 'razorpay' } = req.body;

    // Create Razorpay order
    const orderResult = await createOrder(
      amount,
      currency,
      `order_${req.user._id}_${Date.now()}`,
      {
        userId: req.user._id.toString(),
        rideId: rideId || null,
        method: method
      }
    );

    if (!orderResult.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Failed to create payment order',
        error: orderResult.error
      });
    }

    // Create payment record
    const payment = new Payment({
      user: req.user._id,
      ride: rideId || null,
      type: rideId ? 'ride' : 'wallet_topup',
      amount: amount,
      currency: currency,
      method: method,
      status: 'pending',
      razorpay: {
        orderId: orderResult.order.id,
        receipt: orderResult.order.receipt,
        notes: orderResult.order.notes
      }
    });

    await payment.save();

    res.status(200).json({
      status: 'success',
      message: 'Payment order created successfully',
      order: {
        id: orderResult.order.id,
        amount: orderResult.order.amount,
        currency: orderResult.order.currency,
        receipt: orderResult.order.receipt
      },
      paymentId: payment._id
    });

  } catch (error) {
    console.error('Create payment order error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to create payment order'
    });
  }
});

// Verify payment
router.post('/verify', authenticateToken, async (req, res) => {
  try {
    const { 
      paymentId, 
      razorpay_order_id, 
      razorpay_payment_id, 
      razorpay_signature 
    } = req.body;

    // Verify payment signature
    const verification = verifyPayment(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    );

    if (!verification.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Payment verification failed'
      });
    }

    // Find payment record
    const payment = await Payment.findById(paymentId);
    if (!payment) {
      return res.status(404).json({
        status: 'error',
        message: 'Payment record not found'
      });
    }

    if (payment.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        status: 'error',
        message: 'Unauthorized access to payment'
      });
    }

    // Mark payment as completed
    await payment.markCompleted({
      paymentId: razorpay_payment_id,
      signature: razorpay_signature
    });

    // Update user wallet if it's a top-up
    if (payment.type === 'wallet_topup') {
      const user = await User.findById(req.user._id);
      const previousBalance = user.wallet.balance;
      const newBalance = previousBalance + payment.amount;

      user.wallet.balance = newBalance;
      user.wallet.transactions.push({
        type: 'credit',
        amount: payment.amount,
        description: 'Wallet top-up via Razorpay',
        date: new Date()
      });

      await user.save();

      // Update payment with wallet details
      payment.wallet = {
        previousBalance: previousBalance,
        newBalance: newBalance,
        transactionType: 'credit'
      };
      await payment.save();
    }

    // Update ride payment status if applicable
    if (payment.ride) {
      await Ride.findByIdAndUpdate(payment.ride, {
        'payment.status': 'completed',
        'payment.razorpayPaymentId': razorpay_payment_id,
        'payment.razorpayOrderId': razorpay_order_id,
        'payment.razorpaySignature': razorpay_signature
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Payment verified and completed successfully',
      payment: {
        id: payment._id,
        amount: payment.amount,
        status: payment.status,
        type: payment.type
      }
    });

  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to verify payment'
    });
  }
});

// Get payment history
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 10, type } = req.query;
    const skip = (page - 1) * limit;

    const filter = { user: req.user._id };
    if (type) {
      filter.type = type;
    }

    const payments = await Payment.find(filter)
      .populate('ride', 'pickup destination status')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Payment.countDocuments(filter);

    res.status(200).json({
      status: 'success',
      data: {
        payments,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total
        }
      }
    });

  } catch (error) {
    console.error('Get payment history error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get payment history'
    });
  }
});

// Get payment details
router.get('/:paymentId', authenticateToken, async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.paymentId)
      .populate('ride', 'pickup destination status')
      .populate('user', 'fullName email phone');

    if (!payment) {
      return res.status(404).json({
        status: 'error',
        message: 'Payment not found'
      });
    }

    if (payment.user._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        status: 'error',
        message: 'Unauthorized access to payment'
      });
    }

    res.status(200).json({
      status: 'success',
      data: payment
    });

  } catch (error) {
    console.error('Get payment details error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get payment details'
    });
  }
});

// Request refund
router.post('/refund', authenticateToken, async (req, res) => {
  try {
    const { paymentId, amount, reason } = req.body;

    const payment = await Payment.findById(paymentId);
    if (!payment) {
      return res.status(404).json({
        status: 'error',
        message: 'Payment not found'
      });
    }

    if (payment.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        status: 'error',
        message: 'Unauthorized access to payment'
      });
    }

    if (payment.status !== 'completed') {
      return res.status(400).json({
        status: 'error',
        message: 'Only completed payments can be refunded'
      });
    }

    const refundAmount = amount || payment.amount;

    // Create Razorpay refund
    const refundResult = await createRefund(
      payment.razorpay.paymentId,
      refundAmount,
      { reason: reason || 'User requested refund' }
    );

    if (!refundResult.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Failed to process refund',
        error: refundResult.error
      });
    }

    // Update payment record
    await payment.processRefund(refundAmount, reason);

    // Update user wallet if applicable
    if (payment.type === 'wallet_topup') {
      const user = await User.findById(req.user._id);
      user.wallet.balance -= refundAmount;
      user.wallet.transactions.push({
        type: 'debit',
        amount: refundAmount,
        description: `Refund for payment ${payment._id}`,
        date: new Date()
      });
      await user.save();
    }

    res.status(200).json({
      status: 'success',
      message: 'Refund processed successfully',
      refund: {
        id: refundResult.refund.id,
        amount: refundAmount,
        status: refundResult.refund.status
      }
    });

  } catch (error) {
    console.error('Refund request error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to process refund'
    });
  }
});

// Razorpay webhook
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const body = req.body;

    // Verify webhook signature
    const isValid = verifyWebhookSignature(
      body,
      signature,
      process.env.RAZORPAY_WEBHOOK_SECRET
    );

    if (!isValid) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid webhook signature'
      });
    }

    const event = JSON.parse(body);

    // Handle different webhook events
    switch (event.event) {
      case 'payment.captured':
        console.log('Payment captured:', event.payload.payment.entity.id);
        break;
      
      case 'payment.failed':
        console.log('Payment failed:', event.payload.payment.entity.id);
        break;
      
      case 'refund.created':
        console.log('Refund created:', event.payload.refund.entity.id);
        break;
      
      default:
        console.log('Unhandled webhook event:', event.event);
    }

    res.status(200).json({ status: 'success' });

  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Webhook processing failed'
    });
  }
});

// Get wallet balance
router.get('/wallet/balance', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('wallet.balance');
    
    res.status(200).json({
      status: 'success',
      data: {
        balance: user.wallet.balance
      }
    });

  } catch (error) {
    console.error('Get wallet balance error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get wallet balance'
    });
  }
});

// Get wallet transactions
router.get('/wallet/transactions', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const user = await User.findById(req.user._id)
      .select('wallet.transactions')
      .populate('wallet.transactions.rideId', 'pickup destination');

    const transactions = user.wallet.transactions
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(skip, skip + parseInt(limit));

    const total = user.wallet.transactions.length;

    res.status(200).json({
      status: 'success',
      data: {
        transactions,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total
        }
      }
    });

  } catch (error) {
    console.error('Get wallet transactions error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get wallet transactions'
    });
  }
});

module.exports = router;
