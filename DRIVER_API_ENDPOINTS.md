# Driver App Backend API Endpoints

## 🚀 Complete Backend Integration (No AsyncStorage Required)

All driver data should now come from these backend endpoints instead of AsyncStorage.

### 📱 Driver Profile & Authentication

```javascript
// Get complete driver profile (replaces AsyncStorage driver data)
GET /api/driver/profile
Headers: { Authorization: "Bearer <token>" }

// Update driver profile
PATCH /api/driver/profile
Headers: { Authorization: "Bearer <token>" }
Body: {
  vehicleType: "Bike",
  vehicleNumber: "GJ01AB1234",
  vehicleModel: "Honda Activa",
  vehicleColor: "Black",
  currentLocation: { latitude: 23.0225, longitude: 72.5714 }
}
```

### 📊 Dashboard Data

```javascript
// Main dashboard endpoint (comprehensive data)
GET /api/driver/dashboard
Headers: { Authorization: "Bearer <token>" }

// Delivery-specific dashboard (by phone number)
GET /api/delivery/driver/dashboard/:phone
// No auth required - uses phone number from AsyncStorage
```

### 💰 Earnings Data

```javascript
// Get earnings data (replaces AsyncStorage earnings)
GET /api/driver/earnings?period=week
GET /api/driver/earnings?period=today
GET /api/driver/earnings?period=month
Headers: { Authorization: "Bearer <token>" }
```

### 🚗 Ride Management

```javascript
// Get driver's ride history
GET /api/driver/rides
Headers: { Authorization: "Bearer <token>" }

// Get available ride requests
GET /api/driver/ride-requests?lat=23.0225&lng=72.5714
Headers: { Authorization: "Bearer <token>" }

// Accept ride request
POST /api/driver/accept-ride/:rideId
Headers: { Authorization: "Bearer <token>" }
```

### 🔄 Availability Management

```javascript
// Update driver availability (online/offline)
PATCH /api/driver/availability
Headers: { Authorization: "Bearer <token>" }
Body: { isAvailable: true }
```

## 📋 Data Structure Examples

### Dashboard Response
```json
{
  "status": "success",
  "message": "Dashboard data retrieved from backend (no AsyncStorage)",
  "data": {
    "profile": {
      "id": "driver_id",
      "fullName": "Driver Name",
      "phone": "+91XXXXXXXXXX",
      "vehicleType": "Bike",
      "rating": 4.5,
      "isAvailable": true
    },
    "stats": {
      "todayEarnings": 15000,
      "todayEarningsRs": 150,
      "totalEarnings": 250000,
      "totalEarningsRs": 2500,
      "todayRides": 8,
      "totalRides": 150,
      "rating": 4.5
    },
    "todaysSummary": {
      "earnings": 15000,
      "earningsRs": 150,
      "rides": 8,
      "rating": 4.5,
      "status": "Available"
    },
    "recentRides": [...],
    "weeklyEarnings": [...],
    "dataSource": "backend_mongodb"
  }
}
```

### Earnings Response
```json
{
  "status": "success",
  "data": {
    "period": "week",
    "totalEarnings": 45000,
    "totalEarningsRs": 450,
    "todayEarnings": 15000,
    "todayEarningsRs": 150,
    "dailyEarnings": [
      {
        "date": "2025-10-01",
        "earnings": 12000,
        "earningsRs": 120,
        "rides": 6
      }
    ],
    "dataSource": "backend_mongodb"
  }
}
```

## 🔧 Driver2 App Integration

### Replace AsyncStorage Calls

**Before (AsyncStorage):**
```javascript
const driverData = await AsyncStorage.getItem('driverData');
const earnings = await AsyncStorage.getItem('earnings');
```

**After (Backend API):**
```javascript
// Get driver profile
const profileResponse = await apiClient.get('/api/driver/profile');
const driverData = profileResponse.data;

// Get dashboard data
const dashboardResponse = await apiClient.get('/api/driver/dashboard');
const { stats, earnings, todaysSummary } = dashboardResponse.data;
```

### Key Changes for Driver2 App:

1. **Remove AsyncStorage dependencies** for driver data
2. **Use backend endpoints** for all dashboard information
3. **Real-time updates** via Socket.IO events
4. **Dynamic pricing** with ₹4 per kilometer
5. **Comprehensive earnings tracking** from MongoDB

## 🎯 Benefits

- ✅ **No AsyncStorage dependency** - All data from backend
- ✅ **Real-time sync** - Data always up-to-date
- ✅ **Dynamic pricing** - ₹4/km for bikes as requested
- ✅ **Comprehensive dashboard** - All metrics in one place
- ✅ **Better error handling** - Backend validation and logging
- ✅ **Scalable architecture** - Centralized data management

## 🚀 Next Steps

1. Update Driver2 app to use these endpoints
2. Remove AsyncStorage calls for driver data
3. Test dashboard data loading
4. Verify earnings calculations
5. Test real-time updates via Socket.IO
