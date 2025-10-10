const mongoose = require("mongoose");

const otpSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
    },
    phone: {
      type: String,
      required: false,
    },
    // Stores signup context so we can create the user after OTP verification
    userData: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    otp: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ["signup", "login", "reset_password", "verify_phone"],
      required: true,
    },
    isUsed: {
      type: Boolean,
      default: false,
    },
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
    },
    attempts: {
      type: Number,
      default: 0,
      max: 3,
    },
  },
  {
    timestamps: true,
  }
);

// Index for cleanup
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
otpSchema.index({ email: 1, type: 1 });

// Method to verify OTP
otpSchema.methods.verifyOTP = function (inputOTP) {
  // Check if OTP is expired
  if (this.expiresAt < new Date()) {
    return { success: false, message: "OTP has expired" };
  }

  // Check if OTP is already used
  if (this.isUsed) {
    return { success: false, message: "OTP has already been used" };
  }

  // Check attempt limit
  if (this.attempts >= 3) {
    return { success: false, message: "Maximum attempts exceeded" };
  }

  // Increment attempts
  this.attempts += 1;

  // Verify OTP
  if (this.otp === inputOTP) {
    this.isUsed = true;
    return { success: true, message: "OTP verified successfully" };
  } else {
    return { success: false, message: "Invalid OTP" };
  }
};

// Static method to generate OTP
otpSchema.statics.generateOTP = function () {
  // Generate 4-digit OTP to align with mobile app (4 boxes)
  return Math.floor(1000 + Math.random() * 9000).toString();
};

// Static method to cleanup expired OTPs
otpSchema.statics.cleanupExpired = async function () {
  return await this.deleteMany({
    expiresAt: { $lt: new Date() },
  });
};

module.exports = mongoose.model("OTP", otpSchema);
