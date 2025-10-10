const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const OTP = require("../models/OTP");
const { sendOTPEmail, sendWelcomeEmail } = require("../utils/email");
const { authenticateToken } = require("../middleware/auth");
const {
  validateUserSignup,
  validateUserLogin,
  validateOTP,
} = require("../middleware/validation");

const router = express.Router();

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || "7d",
  });
};

// ---------------------- SEND OTP ----------------------
router.post("/send-otp", validateUserSignup, async (req, res) => {
  try {
    const {
      email,
      fullName,
      phone,
      role,
      expectedRole,
      gender,
      dateOfBirth,
      vehicleType,
      vehicleNumber,
      licenseNumber,
      subDrivers,
      referralCode,
    } = req.body;
    const normalizedEmail = (email || "").trim().toLowerCase();

    // check duplicate user
    const existingUser = await User.findOne({
      $or: [{ email: normalizedEmail }, { phone }],
    });
    if (existingUser) {
      return res.status(400).json({
        status: "error",
        message: "User already exists with this email/phone",
      });
    }

    // Enforce role-context consistency
    if (expectedRole && role && expectedRole !== role) {
      return res.status(400).json({
        status: "error",
        message: "Role mismatch for signup: expectedRole does not match role",
      });
    }

    // If driver signup, require essential driver fields
    if (
      (role === "Driver" || expectedRole === "Driver") &&
      (!vehicleType || !vehicleNumber || !licenseNumber)
    ) {
      return res.status(400).json({
        status: "error",
        message:
          "Driver signup requires vehicleType, vehicleNumber, and licenseNumber",
      });
    }

    // referral check
    let referredBy = null;
    if (referralCode) {
      const referrer = await User.findOne({ referralCode });
      if (referrer) referredBy = referrer._id;
    }

    // remove old otp
    await OTP.deleteMany({
      email: normalizedEmail,
      type: "signup",
      isUsed: false,
    });

    // generate otp
    const otpCode = OTP.generateOTP();
    console.log(
      "🔑 Generated OTP for signup:",
      otpCode,
      "for email:",
      normalizedEmail
    );

    const otpRecord = await OTP.create({
      email: normalizedEmail,
      phone,
      otp: otpCode,
      type: "signup",
      userData: {
        fullName,
        email: normalizedEmail,
        phone,
        role: role || "User",
        gender,
        dateOfBirth,
        vehicleType,
        vehicleNumber,
        licenseNumber,
        subDrivers,
        referredBy,
      },
    });

    console.log("💾 OTP Record created:", {
      id: otpRecord._id,
      email: otpRecord.email,
      otp: otpRecord.otp,
      expiresAt: otpRecord.expiresAt,
    });

    await sendOTPEmail(normalizedEmail, otpCode, "signup");

    const devNoEmailCreds =
      !process.env.EMAIL_HOST ||
      !process.env.EMAIL_USER ||
      !process.env.EMAIL_PASS;
    const responsePayload = { status: "success", message: "OTP sent to email" };
    if (process.env.NODE_ENV !== "production" && devNoEmailCreds) {
      responsePayload.devOtp = otpCode;
    }
    res.status(200).json(responsePayload);
  } catch (err) {
    console.error("Send OTP error:", err);
    res.status(500).json({ status: "error", message: "Failed to send OTP" });
  }
});

// ---------------------- VERIFY OTP ----------------------
router.post("/verify-otp", validateOTP, async (req, res) => {
  try {
    const { email, otp } = req.body;
    const normalizedEmail = (email || "").trim().toLowerCase();

    console.log("🔍 VERIFY OTP - Email:", normalizedEmail, "OTP:", otp);

    const otpRecord = await OTP.findOne({
      email: normalizedEmail,
      type: "signup",
    }).sort({ createdAt: -1 });
    if (!otpRecord) {
      console.log("❌ No OTP record found for email:", normalizedEmail);
      return res
        .status(400)
        .json({ status: "error", message: "Invalid or expired OTP" });
    }

    console.log("📧 OTP Record found:", {
      email: otpRecord.email,
      otp: otpRecord.otp,
      isUsed: otpRecord.isUsed,
      expiresAt: otpRecord.expiresAt,
      attempts: otpRecord.attempts,
    });

    const verification = otpRecord.verifyOTP(otp);
    console.log("🔐 Verification result:", verification);

    if (!verification.success) {
      await otpRecord.save();
      return res
        .status(400)
        .json({ status: "error", message: verification.message });
    }

    // Mark as used after successful verification
    otpRecord.isUsed = true;
    await otpRecord.save();

    const userData = otpRecord.userData;
    if (!userData) {
      return res.status(400).json({
        status: "error",
        message: "User data missing. Please request OTP again.",
      });
    }

    // create user
    const user = new User({
      fullName: userData.fullName,
      email: normalizedEmail,
      phone: userData.phone,
      role: userData.role || "User",
      gender: userData.gender,
      dateOfBirth: userData.dateOfBirth,
      isVerified: true,
      referredBy: userData.referredBy,
    });

    if (userData.role === "Driver") {
      user.driverInfo = {
        vehicleType: userData.vehicleType,
        vehicleNumber: userData.vehicleNumber,
        licenseNumber: userData.licenseNumber,
      };
      if (userData.subDrivers?.length) {
        // Normalize sub-driver entries to match User schema
        user.subDrivers = userData.subDrivers.map((sd) => ({
          name: sd.name || sd.fullName || "",
          email: (sd.email || "").toLowerCase() || undefined,
          phone: sd.number || sd.phone || undefined,
          licenseNumber: sd.license || sd.licenseNumber || undefined,
          vehicleNumber: sd.vehicle || sd.vehicleNumber || undefined,
          vehicleType: sd.type || sd.vehicleType || undefined,
          isActive: true,
        }));
      }
    }

    await user.save();

    console.log(`✅ USER CREATED SUCCESSFULLY:`);
    console.log(`   - Name: ${user.fullName}`);
    console.log(`   - Role: ${user.role}`);
    console.log(`   - Phone: ${user.phone}`);
    if (user.role === "Driver") {
      console.log(
        `   - Vehicle Type: ${user.driverInfo?.vehicleType || "Not Set"}`
      );
      console.log(
        `   - Vehicle Number: ${user.driverInfo?.vehicleNumber || "Not Set"}`
      );
      console.log(
        `   - License: ${user.driverInfo?.licenseNumber || "Not Set"}`
      );
      console.log(`   - Available: ${user.driverInfo?.isAvailable || false}`);
      console.log(
        `   - Location: ${JSON.stringify(
          user.driverInfo?.currentLocation?.coordinates || "Not Set"
        )}`
      );
    }

    const token = generateToken(user._id);
    await sendWelcomeEmail(user.email, user.fullName);

    if (userData.referredBy) {
      await User.findByIdAndUpdate(userData.referredBy, {
        $inc: { referralEarnings: 50 },
      });
    }

    res.status(201).json({
      status: "success",
      message: "Account created successfully",
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isVerified: user.isVerified,
        referralCode: user.referralCode,
      },
    });
  } catch (err) {
    console.error("Verify OTP error:", err);
    res.status(500).json({ status: "error", message: "Failed to verify OTP" });
  }
});

// ---------------------- LOGIN OTP ----------------------
router.post("/login-otp", validateUserLogin, async (req, res) => {
  try {
    const { email, expectedRole } = req.body;
    const normalizedEmail = (email || "").trim().toLowerCase();

    const user = await User.findOne({
      $or: [
        { email: normalizedEmail },
        { "subDrivers.email": normalizedEmail },
      ],
    });
    if (!user)
      return res
        .status(404)
        .json({ status: "error", message: "User not found" });
    if (!user.isActive)
      return res
        .status(403)
        .json({ status: "error", message: "Account is deactivated" });

    // Role enforcement (optional backward compatible)
    if (expectedRole === "Driver") {
      const isSubDriver = (user.subDrivers || []).some(
        (sd) => (sd.email || "").toLowerCase() === normalizedEmail
      );
      const isMainDriver =
        user.role === "Driver" && user.email.toLowerCase() === normalizedEmail;
      if (!isMainDriver && !isSubDriver) {
        return res.status(403).json({
          status: "error",
          message: "Driver account required for driver app login",
        });
      }
    } else if (expectedRole === "User") {
      if (user.role !== "User") {
        return res.status(403).json({
          status: "error",
          message: "Customer account required for user app login",
        });
      }
    }

    const otpCode = OTP.generateOTP();
    console.log(
      "🔑 Generated OTP for login:",
      otpCode,
      "for email:",
      normalizedEmail
    );

    const otpRecord = await OTP.create({
      email: normalizedEmail,
      otp: otpCode,
      type: "login",
    });
    console.log("💾 Login OTP Record created:", {
      id: otpRecord._id,
      email: otpRecord.email,
      otp: otpRecord.otp,
      expiresAt: otpRecord.expiresAt,
    });

    await sendOTPEmail(normalizedEmail, otpCode, "login");

    res.status(200).json({ status: "success", message: "OTP sent to email" });
  } catch (err) {
    console.error("Login OTP error:", err);
    res
      .status(500)
      .json({ status: "error", message: "Failed to send login OTP" });
  }
});

// ---------------------- VERIFY LOGIN OTP ----------------------
router.post("/verify-login-otp", validateOTP, async (req, res) => {
  try {
    const { email, otp, expectedRole } = req.body;
    const normalizedEmail = (email || "").trim().toLowerCase();

    console.log("🔍 VERIFY LOGIN OTP - Email:", normalizedEmail, "OTP:", otp);

    const otpRecord = await OTP.findOne({
      email: normalizedEmail,
      type: "login",
    }).sort({
      createdAt: -1,
    });
    if (!otpRecord) {
      console.log("❌ No login OTP record found for email:", email);
      return res
        .status(400)
        .json({ status: "error", message: "Invalid or expired OTP" });
    }

    console.log("📧 Login OTP Record found:", {
      email: otpRecord.email,
      otp: otpRecord.otp,
      isUsed: otpRecord.isUsed,
      expiresAt: otpRecord.expiresAt,
      attempts: otpRecord.attempts,
    });

    const verification = otpRecord.verifyOTP(otp);
    console.log("🔐 Login verification result:", verification);

    if (!verification.success) {
      await otpRecord.save();
      return res
        .status(400)
        .json({ status: "error", message: verification.message });
    }

    // Mark as used after successful verification
    otpRecord.isUsed = true;
    await otpRecord.save();

    const user = await User.findOne({
      $or: [
        { email: normalizedEmail },
        { "subDrivers.email": normalizedEmail },
      ],
    });
    if (!user)
      return res
        .status(404)
        .json({ status: "error", message: "User not found" });

    user.lastSeen = new Date();
    user.isOnline = true;
    await user.save();

    const token = generateToken(user._id);

    let sessionRole = user.role;
    let subDriverInfo = null;

    console.log(`🔍 Role detection for email: ${normalizedEmail}`);
    console.log(`👤 User role: ${user.role}`);
    console.log(`📋 Sub-drivers count: ${user.subDrivers?.length || 0}`);

    if (user.subDrivers?.length) {
      console.log(
        `🔍 Checking sub-drivers:`,
        user.subDrivers.map((sd) => ({
          name: sd.name,
          email: sd.email,
          isActive: sd.isActive,
        }))
      );

      const matched = user.subDrivers.find(
        (sd) =>
          (sd.email || "").toLowerCase() ===
          (normalizedEmail || "").toLowerCase()
      );

      if (matched) {
        sessionRole = "SubDriver";
        subDriverInfo = {
          id: matched._id,
          name: matched.name,
          email: matched.email,
          vehicleType: matched.vehicleType,
          vehicleNumber: matched.vehicleNumber,
          licenseNumber: matched.licenseNumber,
          isActive: matched.isActive,
          parentDriverId: user._id,
          parentDriverName: user.fullName,
        };
        console.log(
          `✅ Sub-driver match found: ${matched.name} (${matched.email})`
        );
        console.log(`🎯 Session role set to: ${sessionRole}`);
      } else {
        console.log(
          `❌ No sub-driver match found for email: ${normalizedEmail}`
        );
      }
    }

    // Role enforcement prior to responding
    if (expectedRole === "Driver") {
      const isSubDriver = sessionRole === "SubDriver";
      const isMainDriver =
        user.role === "Driver" && user.email.toLowerCase() === normalizedEmail;
      if (!isMainDriver && !isSubDriver) {
        return res.status(403).json({
          status: "error",
          message: "Driver account required for driver app login",
        });
      }
    } else if (expectedRole === "User") {
      if (user.role !== "User") {
        return res.status(403).json({
          status: "error",
          message: "Customer account required for user app login",
        });
      }
    }

    const response = {
      status: "success",
      message: "Login successful",
      token,
      user,
      role: sessionRole,
    };

    // Add sub-driver info if applicable
    if (subDriverInfo) {
      response.subDriverInfo = subDriverInfo;
      response.isSubDriver = true;
    }

    console.log(`📤 Login response role: ${sessionRole}`);
    res.status(200).json(response);
  } catch (err) {
    console.error("Verify login OTP error:", err);
    res
      .status(500)
      .json({ status: "error", message: "Failed to verify login OTP" });
  }
});

// ---------------------- LOGOUT ----------------------
router.post("/logout", authenticateToken, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, {
      isOnline: false,
      lastSeen: new Date(),
    });
    res
      .status(200)
      .json({ status: "success", message: "Logged out successfully" });
  } catch (err) {
    console.error("Logout error:", err);
    res.status(500).json({ status: "error", message: "Failed to logout" });
  }
});

// ---------------------- CURRENT USER ----------------------
router.get("/me", authenticateToken, async (req, res) => {
  try {
    res.status(200).json({ status: "success", user: req.user });
  } catch (err) {
    console.error("Get current user error:", err);
    res
      .status(500)
      .json({ status: "error", message: "Failed to get user data" });
  }
});

// ---------------------- REFRESH TOKEN ----------------------
router.post("/refresh-token", authenticateToken, async (req, res) => {
  try {
    const token = generateToken(req.user._id);
    res.status(200).json({ status: "success", token });
  } catch (err) {
    console.error("Refresh token error:", err);
    res
      .status(500)
      .json({ status: "error", message: "Failed to refresh token" });
  }
});

module.exports = router;
