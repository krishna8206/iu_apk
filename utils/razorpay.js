const Razorpay = require('razorpay');
const crypto = require('crypto');

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Create order
const createOrder = async (amount, currency = 'INR', receipt = null, notes = {}) => {
  try {
    const options = {
      amount: Math.round(amount * 100), // Convert to paise
      currency: currency,
      receipt: receipt || `receipt_${Date.now()}`,
      notes: notes
    };

    const order = await razorpay.orders.create(options);
    return {
      success: true,
      order: order
    };
  } catch (error) {
    console.error('Razorpay order creation error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Verify payment signature
const verifyPayment = (razorpay_order_id, razorpay_payment_id, razorpay_signature) => {
  try {
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest("hex");

    const isAuthentic = expectedSignature === razorpay_signature;
    
    return {
      success: isAuthentic,
      message: isAuthentic ? 'Payment verified successfully' : 'Payment verification failed'
    };
  } catch (error) {
    console.error('Payment verification error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Capture payment
const capturePayment = async (paymentId, amount) => {
  try {
    const payment = await razorpay.payments.capture(
      paymentId,
      Math.round(amount * 100), // Convert to paise
      'INR'
    );
    
    return {
      success: true,
      payment: payment
    };
  } catch (error) {
    console.error('Payment capture error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Create refund
const createRefund = async (paymentId, amount, notes = {}) => {
  try {
    const refund = await razorpay.payments.refund(paymentId, {
      amount: Math.round(amount * 100), // Convert to paise
      notes: notes
    });
    
    return {
      success: true,
      refund: refund
    };
  } catch (error) {
    console.error('Refund creation error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Get payment details
const getPaymentDetails = async (paymentId) => {
  try {
    const payment = await razorpay.payments.fetch(paymentId);
    return {
      success: true,
      payment: payment
    };
  } catch (error) {
    console.error('Get payment details error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Get order details
const getOrderDetails = async (orderId) => {
  try {
    const order = await razorpay.orders.fetch(orderId);
    return {
      success: true,
      order: order
    };
  } catch (error) {
    console.error('Get order details error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Create customer
const createCustomer = async (customerData) => {
  try {
    const customer = await razorpay.customers.create({
      name: customerData.name,
      email: customerData.email,
      contact: customerData.phone,
      notes: customerData.notes || {}
    });
    
    return {
      success: true,
      customer: customer
    };
  } catch (error) {
    console.error('Create customer error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Create virtual account
const createVirtualAccount = async (customerId, description = 'Idhar Udhar Wallet') => {
  try {
    const virtualAccount = await razorpay.virtualAccounts.create({
      customer_id: customerId,
      description: description,
      close_by: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) // 30 days from now
    });
    
    return {
      success: true,
      virtualAccount: virtualAccount
    };
  } catch (error) {
    console.error('Create virtual account error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Get settlement details
const getSettlementDetails = async (settlementId) => {
  try {
    const settlement = await razorpay.settlements.fetch(settlementId);
    return {
      success: true,
      settlement: settlement
    };
  } catch (error) {
    console.error('Get settlement details error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Webhook signature verification
const verifyWebhookSignature = (body, signature, secret) => {
  try {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex');
    
    return signature === expectedSignature;
  } catch (error) {
    console.error('Webhook signature verification error:', error);
    return false;
  }
};

module.exports = {
  razorpay,
  createOrder,
  verifyPayment,
  capturePayment,
  createRefund,
  getPaymentDetails,
  getOrderDetails,
  createCustomer,
  createVirtualAccount,
  getSettlementDetails,
  verifyWebhookSignature
};
