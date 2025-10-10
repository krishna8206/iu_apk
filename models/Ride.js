const mongoose = require('mongoose');

const rideSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  driver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  // If accepted/completed by a sub-driver of the main driver, store sub-driver entry _id
  subDriver: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  declinedDrivers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  rideType: {
    type: String,
    enum: ['bike', 'auto', 'car', 'truck', 'delivery', 'Bike', 'Auto', 'Car', 'Truck', 'Delivery'],
    required: true
  },
  serviceType: {
    type: String,
    enum: ['ride', 'delivery', 'intercity', 'rental', 'Ride', 'Delivery', 'Intercity', 'Rental'],
    default: 'ride'
  },
  status: {
    type: String,
    enum: ['pending', 'searching', 'accepted', 'arrived', 'started', 'completed', 'cancelled'],
    default: 'pending'
  },
  // Location details
  pickup: {
    address: {
      type: String,
      required: true
    },
    coordinates: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true
      }
    },
    landmark: String,
    instructions: String
  },
  destination: {
    address: {
      type: String,
      required: true
    },
    coordinates: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true
      }
    },
    landmark: String,
    instructions: String
  },
  // Route information
  route: {
    distance: {
      type: Number, // in kilometers
      default: 0
    },
    duration: {
      type: Number, // in minutes
      default: 0
    },
    polyline: String, // Google Maps polyline
    waypoints: [{
      address: String,
      coordinates: {
        type: [Number]
      }
    }]
  },
  // Pricing
  pricing: {
    baseFare: {
      type: Number,
      required: true
    },
    distanceFare: {
      type: Number,
      default: 0
    },
    timeFare: {
      type: Number,
      default: 0
    },
    surgeMultiplier: {
      type: Number,
      default: 1
    },
    totalFare: {
      type: Number,
      required: true
    },
    discount: {
      type: Number,
      default: 0
    },
    finalAmount: {
      type: Number,
      required: true
    }
  },
  // Timing
  scheduledTime: {
    type: Date,
    default: null
  },
  actualPickupTime: {
    type: Date,
    default: null
  },
  actualStartTime: {
    type: Date,
    default: null
  },
  actualEndTime: {
    type: Date,
    default: null
  },
  // Payment
  payment: {
    method: {
      type: String,
      enum: ['cash', 'card', 'upi', 'wallet', 'credits'],
      default: 'cash'
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'refunded'],
      default: 'pending'
    },
    razorpayOrderId: String,
    razorpayPaymentId: String,
    razorpaySignature: String,
    transactionId: String
  },
  // Ratings and feedback
  rating: {
    userRating: {
      rating: {
        type: Number,
        min: 1,
        max: 5
      },
      feedback: String,
      date: Date
    },
    driverRating: {
      rating: {
        type: Number,
        min: 1,
        max: 5
      },
      feedback: String,
      date: Date
    }
  },
  // Additional details
  passengers: {
    type: Number,
    default: 1,
    min: 1,
    max: 6
  },
  luggage: {
    type: Boolean,
    default: false
  },
  specialRequests: String,
  // Delivery specific fields
  delivery: {
    itemType: String,
    itemDescription: String,
    itemWeight: Number,
    itemValue: Number,
    recipientName: String,
    recipientPhone: String,
    deliveryInstructions: String,
    requiresSignature: {
      type: Boolean,
      default: false
    }
  },
  // Cancellation
  cancellation: {
    cancelledBy: {
      type: String,
      enum: ['user', 'driver', 'system']
    },
    reason: String,
    cancellationFee: {
      type: Number,
      default: 0
    },
    refundAmount: {
      type: Number,
      default: 0
    },
    cancelledAt: Date
  },
  // Tracking
  tracking: {
    isTracked: {
      type: Boolean,
      default: false
    },
    locations: [{
      coordinates: [Number],
      timestamp: {
        type: Date,
        default: Date.now
      },
      speed: Number,
      heading: Number
    }]
  },
  // Emergency
  emergency: {
    isEmergency: {
      type: Boolean,
      default: false
    },
    emergencyType: String,
    reportedAt: Date,
    resolvedAt: Date
  },
  // OTP Verification for pickup
  verificationOtp: {
    type: String,
    default: null
  },
  otpGeneratedAt: {
    type: Date,
    default: null
  },
  otpVerified: {
    type: Boolean,
    default: false
  },
  otpVerifiedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Indexes for better performance
rideSchema.index({ user: 1, createdAt: -1 });
rideSchema.index({ driver: 1, createdAt: -1 });
rideSchema.index({ subDriver: 1, createdAt: -1 });
rideSchema.index({ status: 1 });
rideSchema.index({ 'pickup.coordinates': '2dsphere' });
rideSchema.index({ 'destination.coordinates': '2dsphere' });
rideSchema.index({ createdAt: -1 });

// Virtual for ride duration
rideSchema.virtual('rideDuration').get(function() {
  if (this.actualStartTime && this.actualEndTime) {
    return Math.round((this.actualEndTime - this.actualStartTime) / (1000 * 60)); // in minutes
  }
  return null;
});

// Method to calculate fare
rideSchema.methods.calculateFare = function() {
  const { baseFare, distanceFare, timeFare, surgeMultiplier } = this.pricing;
  const total = (baseFare + distanceFare + timeFare) * surgeMultiplier;
  this.pricing.totalFare = Math.round(total * 100) / 100;
  this.pricing.finalAmount = Math.max(0, this.pricing.totalFare - this.pricing.discount);
  return this.pricing.finalAmount;
};

// Method to update status
rideSchema.methods.updateStatus = function(newStatus) {
  this.status = newStatus;
  
  // Update timestamps based on status
  const now = new Date();
  switch (newStatus) {
    case 'accepted':
      this.actualPickupTime = now;
      break;
    case 'started':
      this.actualStartTime = now;
      break;
    case 'completed':
      this.actualEndTime = now;
      break;
  }
  
  return this.save();
};

// Method to add tracking location
rideSchema.methods.addTrackingLocation = function(coordinates, speed = 0, heading = 0) {
  this.tracking.locations.push({
    coordinates,
    speed,
    heading,
    timestamp: new Date()
  });
  
  // Keep only last 100 locations to prevent document size issues
  if (this.tracking.locations.length > 100) {
    this.tracking.locations = this.tracking.locations.slice(-100);
  }
  
  return this.save();
};

// Method to cancel ride
rideSchema.methods.cancelRide = function(cancelledBy, reason, cancellationFee = 0) {
  this.status = 'cancelled';
  this.cancellation = {
    cancelledBy,
    reason,
    cancellationFee,
    refundAmount: Math.max(0, this.pricing.finalAmount - cancellationFee),
    cancelledAt: new Date()
  };
  
  return this.save();
};

// Transform JSON output
rideSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Ride', rideSchema);
