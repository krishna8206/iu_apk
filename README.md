# Idhar Udhar Backend API

A comprehensive backend API for the Idhar Udhar ride-sharing application built with Node.js, Express, MongoDB, and integrated with Razorpay and Google Maps APIs.

## 🚀 Features

- **User Authentication**: OTP-based login/signup system
- **Ride Management**: Complete ride booking and tracking system
- **Driver Dashboard**: Driver management and earnings tracking
- **Payment Integration**: Razorpay payment gateway integration
- **Location Services**: Google Maps API integration for routing and geocoding
- **Real-time Communication**: Socket.IO for live updates
- **Admin Panel**: Comprehensive admin dashboard
- **Notification System**: Email and in-app notifications
- **Referral System**: User referral program
- **Wallet System**: Digital wallet with transaction history

## 📋 Prerequisites

- Node.js (v14 or higher)
- MongoDB (v4.4 or higher)
- Razorpay account
- Google Maps API key
- Cloudinary account (for image uploads)
- Email service (Gmail SMTP)

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   ```bash
   cp env.example .env
   ```
   
   Update the `.env` file with your configuration:
   ```env
   # Server Configuration
   PORT=5000
   NODE_ENV=development

   # Database
   MONGODB_URI=mongodb://localhost:27017/idhar-udhar

   # JWT
   JWT_SECRET=your-super-secret-jwt-key-here
   JWT_EXPIRE=7d

   # Email Configuration
   EMAIL_HOST=smtp.gmail.com
   EMAIL_PORT=587
   EMAIL_USER=your-email@gmail.com
   EMAIL_PASS=your-app-password

   # Razorpay Configuration
   RAZORPAY_KEY_ID=your-razorpay-key-id
   RAZORPAY_KEY_SECRET=your-razorpay-key-secret

   # Google Maps API
   GOOGLE_MAPS_API_KEY=your-google-maps-api-key

   # Cloudinary
   CLOUDINARY_CLOUD_NAME=your-cloudinary-cloud-name
   CLOUDINARY_API_KEY=your-cloudinary-api-key
   CLOUDINARY_API_SECRET=your-cloudinary-api-secret

   # Frontend URL
   FRONTEND_URL=http://localhost:3000
   ```

4. **Start the server**
   ```bash
   # Development
   npm run dev

   # Production
   npm start
   ```

## 📚 API Documentation

### Authentication Endpoints

#### POST `/api/auth/send-otp`
Send OTP for user signup
```json
{
  "fullName": "John Doe",
  "email": "john@example.com",
  "phone": "9876543210",
  "role": "User",
  "gender": "Male",
  "dateOfBirth": "1990-01-01"
}
```

#### POST `/api/auth/verify-otp`
Verify OTP and create user account
```json
{
  "email": "john@example.com",
  "otp": "1234"
}
```

#### POST `/api/auth/login-otp`
Send OTP for login
```json
{
  "email": "john@example.com"
}
```

#### POST `/api/auth/verify-login-otp`
Verify login OTP
```json
{
  "email": "john@example.com",
  "otp": "1234"
}
```

### Ride Management Endpoints

#### POST `/api/ride/request`
Create a new ride request
```json
{
  "rideType": "Car",
  "pickup": {
    "address": "123 Main St, City",
    "coordinates": [77.2090, 28.6139],
    "landmark": "Near Metro Station"
  },
  "destination": {
    "address": "456 Park Ave, City",
    "coordinates": [77.2290, 28.6339],
    "landmark": "Near Mall"
  },
  "passengers": 2,
  "paymentMethod": "cash"
}
```

#### GET `/api/ride/history`
Get user's ride history
```
GET /api/ride/history?page=1&limit=10&status=completed
```

#### POST `/api/ride/:rideId/cancel`
Cancel a ride
```json
{
  "reason": "Change of plans"
}
```

### Driver Endpoints

#### GET `/api/driver/dashboard`
Get driver dashboard data

#### POST `/api/driver/accept-ride/:rideId`
Accept a ride request

#### PATCH `/api/driver/availability`
Update driver availability
```json
{
  "isAvailable": true
}
```

#### GET `/api/driver/earnings`
Get driver earnings
```
GET /api/driver/earnings?period=week
```

### Payment Endpoints

#### POST `/api/payment/create-order`
Create payment order
```json
{
  "amount": 150,
  "currency": "INR",
  "rideId": "ride_id_here"
}
```

#### POST `/api/payment/verify`
Verify payment
```json
{
  "paymentId": "payment_id",
  "razorpay_order_id": "order_id",
  "razorpay_payment_id": "payment_id",
  "razorpay_signature": "signature"
}
```

### Location Endpoints

#### POST `/api/location/distance`
Get distance and duration between two points
```json
{
  "origin": { "lat": 28.6139, "lng": 77.2090 },
  "destination": { "lat": 28.6339, "lng": 77.2290 }
}
```

#### POST `/api/location/calculate-fare`
Calculate ride fare
```json
{
  "origin": { "lat": 28.6139, "lng": 77.2090 },
  "destination": { "lat": 28.6339, "lng": 77.2290 },
  "vehicleType": "Car"
}
```

#### POST `/api/location/nearby-drivers`
Find nearby drivers
```json
{
  "lat": 28.6139,
  "lng": 77.2090,
  "radius": 5000,
  "vehicleType": "Car"
}
```

### User Endpoints

#### GET `/api/user/profile`
Get user profile

#### PATCH `/api/user/profile`
Update user profile
```json
{
  "fullName": "John Doe",
  "phone": "9876543210"
}
```

#### GET `/api/user/wallet`
Get wallet balance and transactions

#### POST `/api/user/wallet/topup`
Add money to wallet
```json
{
  "amount": 500,
  "paymentMethod": "razorpay"
}
```

### Admin Endpoints

#### GET `/api/admin/dashboard`
Get admin dashboard statistics

#### GET `/api/admin/users`
Get all users
```
GET /api/admin/users?page=1&limit=20&role=Driver
```

#### PATCH `/api/admin/users/:userId/status`
Update user status
```json
{
  "isActive": false
}
```

## 🔌 Socket.IO Events

### Client to Server Events

- `accept-ride`: Driver accepts a ride
- `update-location`: Update driver location
- `ride-status-update`: Update ride status
- `join-ride`: Join ride room
- `leave-ride`: Leave ride room
- `update-availability`: Update driver availability
- `emergency-alert`: Send emergency alert
- `send-message`: Send chat message
- `typing`: Typing indicator

### Server to Client Events

- `new-ride-request`: New ride request available
- `ride-accepted`: Ride has been accepted
- `driver-location-update`: Driver location updated
- `ride-status-update`: Ride status changed
- `notification`: New notification
- `emergency-alert`: Emergency alert
- `new-message`: New chat message
- `user-typing`: User typing indicator

## 🗄️ Database Schema

### User Model
- Personal information (name, email, phone, etc.)
- Driver-specific information (vehicle details, license, etc.)
- Wallet and referral system
- Location and availability status

### Ride Model
- Pickup and destination details
- Pricing and payment information
- Status tracking and timestamps
- Ratings and feedback

### Payment Model
- Payment details and status
- Razorpay integration
- Refund handling
- Transaction history

### Notification Model
- User notifications
- Different notification types
- Read/unread status

## 🔒 Security Features

- JWT-based authentication
- Rate limiting
- Input validation
- CORS configuration
- Helmet security headers
- Password hashing (for future use)
- OTP verification

## 🚀 Deployment

### Using PM2
```bash
npm install -g pm2
pm2 start server.js --name "idhar-udhar-api"
pm2 startup
pm2 save
```

### Using Docker
```dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 5000
CMD ["npm", "start"]
```

### Environment Variables for Production
- Set `NODE_ENV=production`
- Use a production MongoDB URI
- Configure proper CORS origins
- Set up SSL certificates
- Configure proper logging

## 📊 Monitoring and Logging

- Health check endpoint: `GET /api/health`
- Error handling middleware
- Request logging
- Performance monitoring (can be added with tools like New Relic)

## 🧪 Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For support, email support@idharudhar.com or create an issue in the repository.

## 🔄 API Versioning

The API uses URL versioning. Current version is v1, accessible at `/api/v1/` (can be implemented for future versions).

## 📱 Mobile App Integration

This backend is designed to work with both web and mobile applications. The Socket.IO integration provides real-time features for mobile apps.

## 🔧 Configuration

### Razorpay Setup
1. Create a Razorpay account
2. Get your API keys from the dashboard
3. Configure webhook endpoints
4. Set up test and production environments

### Google Maps Setup
1. Create a Google Cloud project
2. Enable Maps JavaScript API, Distance Matrix API, and Geocoding API
3. Create API key with proper restrictions
4. Configure billing

### Email Setup
1. Use Gmail SMTP or any email service
2. For Gmail, use App Passwords
3. Configure proper email templates

## 🎯 Future Enhancements

- [ ] Push notifications
- [ ] Advanced analytics
- [ ] Machine learning for pricing
- [ ] Multi-language support
- [ ] Advanced reporting
- [ ] Integration with more payment gateways
- [ ] Advanced security features
- [ ] API rate limiting per user
- [ ] Caching with Redis
- [ ] Microservices architecture
