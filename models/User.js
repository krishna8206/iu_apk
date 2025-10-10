const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true,
    maxlength: [50, 'Name cannot be more than 50 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    unique: true,
    match: [/^[6-9]\d{9}$/, 'Please enter a valid 10-digit phone number']
  },
  // Primary address to show under phone in profile
  address: {
    type: String,
    default: ''
  },
  role: {
    type: String,
    enum: ['User', 'Driver', 'Admin'],
    default: 'User'
  },
  gender: {
    type: String,
    enum: ['Male', 'Female', 'Other'],
    required: [true, 'Gender is required']
  },
  dateOfBirth: {
    type: Date,
    required: [true, 'Date of birth is required']
  },
  profileImage: {
    type: String,
    default: null
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isOnline: {
    type: Boolean,
    default: false
  },
  lastSeen: {
    type: Date,
    default: Date.now
  },
  // Driver specific fields
  driverInfo: {
    vehicleType: {
      type: String,
      enum: ['Bike', 'Auto', 'Car', 'Truck'],
      default: null
    },
    vehicleNumber: {
      type: String,
      default: null
    },
    licenseNumber: {
      type: String,
      default: null
    },
    licenseExpiry: {
      type: Date,
      default: null
    },
    vehicleModel: {
      type: String,
      default: null
    },
    vehicleColor: {
      type: String,
      default: null
    },
    isAvailable: {
      type: Boolean,
      default: false
    },
    currentLocation: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: [0, 0]
      }
    },
    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    totalRides: {
      type: Number,
      default: 0
    },
    totalEarnings: {
      type: Number,
      default: 0
    },
    documents: {
      license: String,
      vehicleRC: String,
      insurance: String,
      pollution: String
    },
    bankDetails: {
      accountNumber: String,
      ifscCode: String,
      accountHolderName: String,
      bankName: String
    }
  },
  // Sub-driver information
  subDrivers: [{
    name: String,
    email: { type: String, lowercase: true },
    licenseNumber: String,
    vehicleNumber: String,
    vehicleType: String,
    phone: String,
    isActive: {
      type: Boolean,
      default: true
    }
  }],
  // Referral system
  referralCode: {
    type: String,
    unique: true,
    sparse: true
  },
  referredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  referralEarnings: {
    type: Number,
    default: 0
  },
  // Wallet and credits
  wallet: {
    balance: {
      type: Number,
      default: 0
    },
    transactions: [{
      type: {
        type: String,
        enum: ['credit', 'debit', 'refund', 'bonus', 'referral']
      },
      amount: Number,
      description: String,
      date: {
        type: Date,
        default: Date.now
      },
      rideId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Ride',
        default: null
      }
    }]
  },
  // Emergency contacts
  emergencyContacts: [{
    name: String,
    phone: String,
    relationship: String
  }],
  // Preferences
  preferences: {
    language: {
      type: String,
      default: 'en'
    },
    notifications: {
      email: {
        type: Boolean,
        default: true
      },
      sms: {
        type: Boolean,
        default: true
      },
      push: {
        type: Boolean,
        default: true
      }
    }
  },
  // Saved addresses for quick access
  addresses: [{
    id: {
      type: Number,
      required: true
    },
    label: {
      type: String,
      required: true,
      trim: true
    },
    detail: {
      type: String,
      required: true,
      trim: true
    },
    landmark: {
      type: String,
      default: '',
      trim: true
    },
    type: {
      type: String,
      enum: ['home', 'work', 'general'],
      default: 'general'
    },
    coordinates: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: null
      }
    },
    isDefault: {
      type: Boolean,
      default: false
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    updatedAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

// Index for geospatial queries
userSchema.index({ 'driverInfo.currentLocation': '2dsphere' });

// Generate referral code before saving
userSchema.pre('save', async function(next) {
  if (this.isNew && !this.referralCode) {
    this.referralCode = this.generateReferralCode();
  }
  next();
});

// Method to generate referral code
userSchema.methods.generateReferralCode = function() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// Method to update location
userSchema.methods.updateLocation = function(longitude, latitude) {
  this.driverInfo.currentLocation.coordinates = [longitude, latitude];
  return this.save();
};

// Method to calculate age
userSchema.methods.getAge = function() {
  const today = new Date();
  const birthDate = new Date(this.dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age;
};

// Virtual for full name
userSchema.virtual('displayName').get(function() {
  return this.fullName;
});

// Transform JSON output
userSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    if (!ret) return ret;
    delete ret.__v;
    if (ret.wallet && ret.wallet.transactions) {
      delete ret.wallet.transactions;
    }
    return ret;
  }
});

module.exports = mongoose.model('User', userSchema);
