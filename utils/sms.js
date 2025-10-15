const twilio = require('twilio');

// Initialize Twilio client safely
const getTwilioClient = () => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) return null;
  try {
    return twilio(accountSid, authToken);
  } catch (err) {
    console.error('❌ Failed to initialize Twilio client:', err?.message || err);
    return null;
  }
};

// Validate E.164 phone formatting, add + if missing (basic safety)
const normalizePhone = (phone) => {
  if (!phone) return null;
  let p = String(phone).trim();
  if (!p.startsWith('+')) {
    // Assume India if no country code given; adjust if needed
    if (p.length === 10 && /^\d{10}$/.test(p)) {
      p = `+91${p}`;
    } else {
      // As-is, Twilio may reject invalid formats
      p = `+${p.replace(/[^\d]/g, '')}`;
    }
  }
  return p;
};

// Send OTP via SMS using Twilio
const sendOTPSMS = async (phone, otp, type = 'signup') => {
  try {
    const client = getTwilioClient();
    const fromNumber = process.env.TWILIO_FROM_NUMBER;

    if (!client || !fromNumber) {
      console.warn('📱 Twilio not fully configured (missing SID/TOKEN or FROM). In dev, simulating SMS send.');
      console.log('📲 [DEV SMS] To:', phone, 'OTP:', otp, 'Type:', type);
      return { success: true, simulated: true };
    }

    const to = normalizePhone(phone);
    if (!to) throw new Error('Invalid phone number');

    let heading = 'Account Verification';
    if (type === 'login') heading = 'Login Verification';
    else if (type === 'reset_password') heading = 'Password Reset';

    const body = `Idhar Udhar - ${heading}: Your OTP is ${otp}. It expires in 10 minutes. Do not share this code.`;

    const result = await client.messages.create({
      from: fromNumber,
      to,
      body,
    });

    console.log('✅ SMS sent via Twilio:', {
      sid: result.sid,
      status: result.status,
      to: result.to,
    });

    return { success: true, sid: result.sid, status: result.status };
  } catch (error) {
    console.error('❌ Twilio SMS send failed:', error?.message || error);
    return { success: false, error: error?.message || String(error) };
  }
};

// Optional: verify Twilio config on startup
const verifySMSConfig = () => {
  const ok = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER);
  if (ok) console.log('📱 Twilio SMS configured.');
  else console.warn('📱 Twilio SMS not fully configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER');
  return ok;
};

module.exports = { sendOTPSMS, verifySMSConfig };
