const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
// Robust .env loading with diagnostics
const dotenv = require('dotenv');
// Load from backend folder first
dotenv.config({ path: path.resolve(__dirname, '.env'), override: true });
// Fallback: also attempt CWD .env (sometimes nodemon starts with different CWD)
if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
  dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: false });
}

// Diagnostics for env loading (prints only safe prefixes)
try {
  const mask = (v) => (v ? String(v).slice(0, 6) + '***' : '');
  console.log('🧪 ENV CHECK:', {
    cwd: process.cwd(),
    envDir: __dirname,
    RZP_ID: mask(process.env.RAZORPAY_KEY_ID),
    RZP_SEC_SET: !!process.env.RAZORPAY_KEY_SECRET,
    SG_SET: !!process.env.SENDGRID_API_KEY,
  });
} catch {}

// Hard guard to provide clear error early
if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
  console.error('❌ Missing Razorpay env vars. Ensure iu_apk/.env exists and is UTF-8 encoded with keys RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.');
}
const { verifyEmailTransport } = require('./utils/email');
const { verifySMSConfig } = require('./utils/sms');

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const rideRoutes = require('./routes/ride');
const driverRoutes = require('./routes/driver');
const deliveryRoutes = require('./routes/delivery');
const paymentRoutes = require('./routes/payment');
const adminRoutes = require('./routes/admin');
const locationRoutes = require('./routes/location');

// Import middleware
const errorHandler = require('./middleware/errorHandler');
const { initializeSocket } = require('./utils/socket');

const app = express();
const server = createServer(app);

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Security middleware
app.use(helmet());

// Rate limiting - DISABLED for development to prevent 429 errors
// const limiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 100,
//   message: 'Too many requests from this IP, please try again later.'
// });
// app.use(limiter); // DISABLED

// CORS configuration - Allow multiple origins including mobile apps
const allowedOrigins = [
  process.env.FRONTEND_URL || "http://localhost:3000",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://10.63.27.220:3000",
  "http://192.168.1.6:3000",
  // Allow mobile app requests (React Native doesn't send origin header)
  null,
  undefined
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl requests, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('🚫 CORS blocked origin:', origin);
      callback(null, true); // Allow all for now to debug
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-subdriver-id', 'X-Subdriver-Id']
}));

// ✅ CONFIGURABLE RATE LIMITING FOR DASHBOARD ENDPOINTS (DISABLED BY DEFAULT)
const dashboardRateLimit = {};
const RATE_LIMIT_MS = parseInt(process.env.DASHBOARD_RATE_LIMIT_MS || '0', 10); // 0 disables
app.use((req, res, next) => {
  // If disabled, skip entirely
  if (!RATE_LIMIT_MS || RATE_LIMIT_MS <= 0) return next();

  const clientIP = req.ip || req.connection.remoteAddress;
  const isDashboardEndpoint = req.path.includes('/api/user/') ||
                              req.path.includes('/api/delivery/debug/') ||
                              req.path.includes('/api/ride/history') ||
                              req.path.includes('/api/driver/');

  if (!isDashboardEndpoint) return next();

  const now = Date.now();
  const key = `${clientIP}_${req.path}`;

  if (dashboardRateLimit[key] && (now - dashboardRateLimit[key] < RATE_LIMIT_MS)) {
    const waitSec = Math.ceil((RATE_LIMIT_MS - (now - dashboardRateLimit[key])) / 1000);
    console.log(`⚠️ RATE LIMITED: ${req.method} ${req.path} from ${clientIP}`);
    return res.status(429).json({
      status: 'error',
      message: `Too many requests. Please wait ${waitSec} seconds between dashboard API calls.`,
      retryAfter: waitSec
    });
  }

  dashboardRateLimit[key] = now;

  // Clean old entries every minute
  if (Math.random() < 0.01) {
    Object.keys(dashboardRateLimit).forEach(k => {
      if (now - dashboardRateLimit[k] > 60000) {
        delete dashboardRateLimit[k];
      }
    });
  }

  next();
});

// Request logging middleware for debugging
app.use((req, res, next) => {
  console.log(`📡 ${req.method} ${req.path} - Origin: ${req.get('origin') || 'none'}`);
  if (req.path.includes('verify-otp') || req.path.includes('store-otp')) {
    console.log('🔐 OTP Request Body:', req.body);
    console.log('🔐 OTP Request Headers:', {
      'content-type': req.get('content-type'),
      'authorization': req.get('authorization') ? 'Bearer ***' : 'none'
    });
  }
  next();
});

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use('/uploads', express.static('uploads'));

// ==========================
// Database Connection
// ==========================
const createGeospatialIndexes = async () => {
  try {
    console.log('🔍 Creating geospatial indexes...');
    
    const db = mongoose.connection.db;
    
    // Create geospatial index for rides collection
    try {
      await db.collection('rides').createIndex({ 'pickup.coordinates': '2dsphere' });
      console.log('✅ Created pickup coordinates index');
    } catch (pickupError) {
      console.log('Pickup index might already exist:', pickupError.message);
    }
    
    try {
      await db.collection('rides').createIndex({ 'destination.coordinates': '2dsphere' });
      console.log('✅ Created destination coordinates index');
    } catch (destError) {
      console.log('Destination index might already exist:', destError.message);
    }
    
    // Create geospatial index for users collection (driver locations)
    try {
      await db.collection('users').createIndex({ 'driverInfo.currentLocation': '2dsphere' });
      console.log('✅ Created driver location index');
    } catch (locationError) {
      console.log('Driver location index might already exist:', locationError.message);
    }
    
    // Also create regular indexes for better performance
    try {
      await db.collection('rides').createIndex({ status: 1, rideType: 1 });
      console.log('✅ Created status+rideType index');
    } catch (statusError) {
      console.log('Status index might already exist:', statusError.message);
    }
    
    console.log('✅ All geospatial indexes processed');
  } catch (error) {
    console.error('❌ Error creating geospatial indexes:', error.message);
    // Don't exit process, just log the error
  }
};

// ==========================
// Database Connection
// ==========================
const connectDB = async () => {
  try {
    console.log("🔗 Connecting to MongoDB...");
    console.log("📡 Connection URI:", (process.env.MONGODB_URI || '').replace(/:[^:]*@/, ":*****@")); // hide password

    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/idhar-udhar', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('✅ MongoDB connected successfully');
    
    // Create geospatial indexes for location-based queries
    await createGeospatialIndexes();
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);

    // Debugging hints
    if (err.message.includes("bad auth")) {
      console.error("👉 Wrong username or password. Check MONGODB_URI in .env");
    }
    if (err.message.includes("ENOTFOUND") || err.message.includes("getaddrinfo")) {
      console.error("👉 Could not reach MongoDB. Check your cluster URI or internet connection.");
    }
    if (err.message.includes("IP")) {
      console.error("👉 IP not whitelisted. Go to Atlas > Network Access and allow your IP.");
    }

    process.exit(1); // stop server if DB fails
  }
};

connectDB();

// ==========================
// Make io accessible to routes
// ==========================
app.set('io', io);

// Initialize Socket.IO handlers and get utilities
const socketUtils = initializeSocket(io);

// Make socket utilities available to routes
app.set('socketUtils', socketUtils);

// ==========================
// Routes
// ==========================
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/ride', rideRoutes);
app.use('/api/driver', driverRoutes);
app.use('/api/delivery', deliveryRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/location', locationRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Idhar Udhar API is running!',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'Route not found'
  });
});

// Error handling middleware
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📱 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
  // Verify email transport on startup for clear diagnostics
  verifyEmailTransport()
    .then((res) => {
      if (!res?.ok) {
        console.warn('✉️  Email transport not fully configured:', res?.reason || res?.error || 'unknown');
      }
    })
    .catch((e) => console.warn('✉️  Email transport check failed:', e?.message || e));

  // Verify Twilio SMS configuration
  try {
    const twilioOk = verifySMSConfig();
    if (!twilioOk) {
      console.warn('📱 Twilio SMS not fully configured. Ensure TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER are set in iu_apk/.env');
    }
  } catch (e) {
    console.warn('📱 Twilio SMS verification threw an error:', e?.message || e);
  }
});

// ==========================
// Graceful Shutdown
// ==========================
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Process terminated');
    mongoose.connection.close();
  });
});

module.exports = app;
