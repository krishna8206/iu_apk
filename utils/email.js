const sgMail = require("@sendgrid/mail");
const { createTransport } = require("nodemailer");

// Initialize SendGrid with API key
const initializeSendGrid = () => {
  const hasSendGridKey = !!process.env.SENDGRID_API_KEY;

  if (hasSendGridKey) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    console.log("✉️  SendGrid API key configured successfully");
  } else {
    console.warn(
      "✉️  SENDGRID_API_KEY env not set. Using Gmail SMTP or dev mock email sender. OTPs will be logged and returned as devOtp."
    );
  }
};

// Ensure SendGrid is initialized when this module is loaded
initializeSendGrid();

// Create Gmail SMTP transporter (better for inbox delivery)
const createGmailTransporter = () => {
  return createTransport({
    service: "gmail",
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });
};

// Anti-spam email configuration
const getAntiSpamHeaders = () => {
  return {
    "X-Priority": "1",
    "X-MSMail-Priority": "High",
    Importance: "high",
    "X-Mailer": "Idhar Udhar App v1.0",
    "List-Unsubscribe": "<mailto:unsubscribe@idharudhar.com>",
    "X-Auto-Response-Suppress": "OOF",
    Precedence: "bulk",
    "X-Report-Abuse": "Please report abuse to abuse@idharudhar.com",
  };
};

// Create transporter with dev-safe fallback
const createTransporter = () => {
  const hasSendGridKey = !!process.env.SENDGRID_API_KEY;

  if (hasSendGridKey) {
    return {
      async sendMail(mailOptions) {
        const { to, subject, html, text } = mailOptions || {};

        // Safety: ensure API key is set (idempotent) in case initializeSendGrid wasn't called yet
        try { if (process.env.SENDGRID_API_KEY) sgMail.setApiKey(process.env.SENDGRID_API_KEY); } catch {}

        const msg = {
          to: to,
          from: {
            name: "Idhar Udhar",
            // Prefer a verified sender for SendGrid if provided
            email: process.env.SENDGRID_FROM || process.env.EMAIL_FROM || process.env.EMAIL_USER || "noreply@idharudhar.com",
          },
          subject: subject,
          text: text || "This is a text version of the email content.",
          html: html || "<p>This is the HTML version of the email content.</p>",
          headers: {
            "X-Priority": "1",
            "X-MSMail-Priority": "High",
            Importance: "high",
            "X-Mailer": "Idhar Udhar App",
          },
        };

        try {
          const result = await sgMail.send(msg);
          console.log(
            "✅ Email sent successfully via SendGrid:",
            result[0]?.headers?.["x-message-id"] || "sent"
          );
          return {
            messageId:
              result[0]?.headers?.["x-message-id"] || "sendgrid-message-id",
          };
        } catch (error) {
          // Provide clearer hints for common auth errors
          const code = error?.code || error?.response?.status;
          const sgDetails = {
            status: code,
            hasKey: !!process.env.SENDGRID_API_KEY,
            from: process.env.SENDGRID_FROM || process.env.EMAIL_FROM || process.env.EMAIL_USER,
          };
          if (code === 401 || code === 403) {
            console.error("❌ SendGrid email error (Unauthorized). Likely invalid SENDGRID_API_KEY or unverified sender.", sgDetails);
          } else {
            console.error("❌ SendGrid email error:", code, error?.message || error);
          }

          // Attempt fallback to Gmail SMTP if configured
          const hasGmailConfig = !!(process.env.EMAIL_USER && process.env.EMAIL_PASS);
          if (hasGmailConfig) {
            try {
              const gmailTransporter = createGmailTransporter();
              const gmailMsg = {
                from: {
                  name: "Idhar Udhar",
                  address: process.env.EMAIL_USER,
                },
                to: to,
                subject: subject,
                text: text || "This is a text version of the email content.",
                html: html || "<p>This is the HTML version of the email content.</p>",
                headers: {
                  "X-Priority": "1",
                  "X-MSMail-Priority": "High",
                  Importance: "high",
                  "X-Mailer": "Idhar Udhar App (Fallback)",
                  "Reply-To": process.env.EMAIL_USER,
                  "Return-Path": process.env.EMAIL_USER,
                },
              };
              const result = await gmailTransporter.sendMail(gmailMsg);
              console.warn("✉️  Fell back to Gmail SMTP due to SendGrid failure. MessageId:", result?.messageId);
              return { messageId: result?.messageId || "gmail-fallback-message-id" };
            } catch (gmailErr) {
              console.error("❌ Gmail SMTP fallback also failed:", gmailErr?.message || gmailErr);
              throw error; // throw original SendGrid error to keep semantics
            }
          }

          // As last resort, dev mock if nothing configured
          console.warn("✉️  No Gmail creds available for fallback (EMAIL_USER/PASS). Returning failure.");
          throw error;
        }
      },
    };
  }

  const hasGmailConfig = !!(process.env.EMAIL_USER && process.env.EMAIL_PASS);

  if (!hasGmailConfig) {
    return {
      async sendMail(mailOptions) {
        const { to, subject } = mailOptions || {};
        console.log("📨 [DEV] Email config missing. Simulating email send.");
        console.log("📧 To:", to);
        console.log("📝 Subject:", subject);
        return { messageId: "dev-mock-message-id" };
      },
    };
  }

  // Use Gmail SMTP for better inbox delivery
  const gmailTransporter = createGmailTransporter();

  return {
    async sendMail(mailOptions) {
      const { from, to, subject, html, text } = mailOptions || {};

      const msg = {
        from: {
          name: "Idhar Udhar",
          address: process.env.EMAIL_USER,
        },
        to: to,
        subject: subject,
        text: text || "This is a text version of the email content.",
        html: html || "<p>This is the HTML version of the email content.</p>",
        headers: {
          "X-Priority": "1",
          "X-MSMail-Priority": "High",
          Importance: "high",
          "X-Mailer": "Idhar Udhar App",
          "Reply-To": process.env.EMAIL_USER,
          "Return-Path": process.env.EMAIL_USER,
        },
      };

      try {
        const result = await gmailTransporter.sendMail(msg);
        console.log(
          "✅ Email sent successfully via Gmail SMTP:",
          result.messageId
        );
        return { messageId: result.messageId };
      } catch (error) {
        console.error("❌ Gmail SMTP email error:", error);
        throw error;
      }
    },
  };
};

// Verify email transport configuration on startup
const verifyEmailTransport = async () => {
  const hasSendGridKey = !!process.env.SENDGRID_API_KEY;

  if (hasSendGridKey) {
    console.log("✉️  SendGrid API key configured for email transport");
    return { ok: true };
  }

  try {
    const hasGmailConfig = !!(process.env.EMAIL_USER && process.env.EMAIL_PASS);
    if (!hasGmailConfig) {
      console.warn(
        "✉️  Email config not set. Using dev mock email sender. OTPs will be logged and returned as devOtp."
      );
      return { ok: false, reason: "missing_creds" };
    }

    // Test Gmail SMTP connection
    const transporter = createGmailTransporter();
    await transporter.verify();
    console.log(
      "✉️  Gmail SMTP transport configured and verified successfully"
    );
    return { ok: true };
  } catch (err) {
    console.error("✉️  Gmail SMTP configuration failed:", err.message);
    return { ok: false, error: err.message };
  }
};

// Send OTP email
const sendOTPEmail = async (email, otp, type = "signup") => {
  try {
    const transporter = createTransporter();

    let subject, html, text;

    switch (type) {
      case "signup":
        subject = "Idhar Udhar Account Verification Code";
        text = `Hi there! Your Idhar Udhar verification code is: ${otp}. This code expires in 10 minutes. If you didn't request this, please ignore this email.`;
        html = `
          <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 20px auto; padding: 20px; border: 1px solid #ddd;">
            <h2 style="color: #333; text-align: center;">Idhar Udhar</h2>
            <h3 style="color: #555;">Account Verification</h3>
            <p style="color: #666; line-height: 1.5;">Hi there!</p>
            <p style="color: #666; line-height: 1.5;">Please use this verification code to complete your account setup:</p>
            <div style="background: #f5f5f5; border: 2px solid #007bff; padding: 20px; text-align: center; margin: 20px 0;">
              <h1 style="color: #007bff; font-size: 32px; margin: 0; letter-spacing: 4px;">${otp}</h1>
            </div>
            <p style="color: #666; font-size: 14px;">This code will expire in 10 minutes.</p>
            <p style="color: #666; font-size: 14px;">If you didn't request this verification, you can safely ignore this email.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="color: #999; font-size: 12px; text-align: center;">© ${new Date().getFullYear()} Idhar Udhar. All rights reserved.</p>
          </div>
        `;
        break;

      case "login":
        subject = "Idhar Udhar Login Verification Code";
        text = `Hi! Your Idhar Udhar login code is: ${otp}. This code expires in 10 minutes. If you didn't try to log in, please ignore this email.`;
        html = `
          <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 20px auto; padding: 20px; border: 1px solid #ddd;">
            <h2 style="color: #333; text-align: center;">Idhar Udhar</h2>
            <h3 style="color: #555;">Login Verification</h3>
            <p style="color: #666; line-height: 1.5;">Hi there!</p>
            <p style="color: #666; line-height: 1.5;">Use this code to complete your login:</p>
            <div style="background: #f5f5f5; border: 2px solid #28a745; padding: 20px; text-align: center; margin: 20px 0;">
              <h1 style="color: #28a745; font-size: 32px; margin: 0; letter-spacing: 4px;">${otp}</h1>
            </div>
            <p style="color: #666; font-size: 14px;">This code will expire in 10 minutes.</p>
            <p style="color: #666; font-size: 14px;">If you didn't try to log in, you can safely ignore this email.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="color: #999; font-size: 12px; text-align: center;">© ${new Date().getFullYear()} Idhar Udhar. All rights reserved.</p>
          </div>
        `;
        break;

      case "reset_password":
        subject = "Idhar Udhar - Reset Password";
        text = `Your Idhar Udhar password reset OTP is: ${otp}. This OTP will expire in 10 minutes.`;
        html = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #ff6b35, #f7931e); padding: 20px; text-align: center;">
              <h1 style="color: white; margin: 0;">Idhar Udhar</h1>
            </div>
            <div style="padding: 30px; background: #f9f9f9;">
              <h2 style="color: #333;">Reset Your Password</h2>
              <p style="color: #666; font-size: 16px;">Use the following OTP to reset your password:</p>
              <div style="background: #fff; border: 2px solid #ff6b35; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
                <h1 style="color: #ff6b35; font-size: 32px; margin: 0; letter-spacing: 5px;">${otp}</h1>
              </div>
              <p style="color: #666; font-size: 14px;">This OTP will expire in 10 minutes.</p>
            </div>
            <div style="background: #333; color: white; padding: 20px; text-align: center; font-size: 12px;">
              <p>© ${new Date().getFullYear()} Idhar Udhar. All rights reserved.</p>

            </div>
          </div>
        `;
        break;
    }

    const mailOptions = {
      from: process.env.EMAIL_FROM || "noreply@idharudhar.com",
      to: email,
      subject: subject,
      text: text,
      html: html,
    };

    console.log(`Sending ${type} OTP email to: ${email}`);
    const result = await transporter.sendMail(mailOptions);
    console.log("Email sent successfully:", result.messageId);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error("Email sending failed:", error);
    return { success: false, error: error.message };
  }
};

// Send welcome email
const sendWelcomeEmail = async (email, fullName) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: process.env.EMAIL_FROM || "noreply@idharudhar.com",
      to: email,
      subject: "Welcome to Idhar Udhar!",
      text: `Hi ${fullName}! Welcome to Idhar Udhar. Your account has been successfully created. You can now start booking rides and using our services. Thank you for joining us!`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 20px auto; padding: 20px; border: 1px solid #ddd;">
          <h2 style="color: #333; text-align: center;">Idhar Udhar</h2>
          <h3 style="color: #555;">Welcome ${fullName}!</h3>
          <p style="color: #666; line-height: 1.5;">Your account has been successfully created and verified.</p>
          <p style="color: #666; line-height: 1.5;">You can now:</p>
          <ul style="color: #666; line-height: 1.5;">
            <li>Book rides</li>
            <li>Request deliveries</li>
            <li>Track your trips</li>
            <li>Rate your experience</li>
          </ul>
          <div style="text-align: center; margin: 20px 0;">
            <a href="${
              process.env.FRONTEND_URL || "#"
            }" style="background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">Get Started</a>
          </div>
          <p style="color: #666; font-size: 14px;">Thank you for choosing Idhar Udhar!</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #999; font-size: 12px; text-align: center;">© ${new Date().getFullYear()} Idhar Udhar. All rights reserved.</p>
        </div>
      `,
    };

    const result = await transporter.sendMail(mailOptions);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error("Welcome email sending failed:", error);
    return { success: false, error: error.message };
  }
};

// Send ride confirmation email
const sendRideConfirmationEmail = async (email, rideDetails) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: `"Idhar Udhar" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Ride Confirmed - Idhar Udhar",
      text: `Ride Confirmed! Ride ID: ${rideDetails.rideId}, Vehicle: ${rideDetails.rideType}, From: ${rideDetails.pickup}, To: ${rideDetails.destination}, Fare: ₹${rideDetails.fare}, Driver: ${rideDetails.driverName}, Phone: ${rideDetails.driverPhone}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #ff6b35, #f7931e); padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">Idhar Udhar</h1>
          </div>
          <div style="padding: 30px; background: #f9f9f9;">
            <h2 style="color: #333;">Ride Confirmed!</h2>
            <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Ride ID:</strong> ${rideDetails.rideId}</p>
              <p><strong>Vehicle Type:</strong> ${rideDetails.rideType}</p>
              <p><strong>Pickup:</strong> ${rideDetails.pickup}</p>
              <p><strong>Destination:</strong> ${rideDetails.destination}</p>
              <p><strong>Fare:</strong> ₹${rideDetails.fare}</p>
              <p><strong>Driver:</strong> ${rideDetails.driverName}</p>
              <p><strong>Driver Phone:</strong> ${rideDetails.driverPhone}</p>
            </div>
            <p style="color: #666; font-size: 14px;">Your driver will arrive shortly. Thank you for choosing Idhar Udhar!</p>
          </div>
          <div style="background: #333; color: white; padding: 20px; text-align: center; font-size: 12px;">
            <p>© 2024 Idhar Udhar. All rights reserved.</p>
          </div>
        </div>
      `,
    };

    const result = await transporter.sendMail(mailOptions);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error("Ride confirmation email sending failed:", error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendOTPEmail,
  sendRideConfirmationEmail,
  sendWelcomeEmail,
  verifyEmailTransport,
};
