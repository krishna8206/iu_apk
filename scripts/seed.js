const mongoose = require('mongoose');
const User = require('../models/User');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/idhar-udhar', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const seedData = async () => {
  try {
    console.log('🌱 Starting database seeding...');

    // Create admin user
    const adminUser = new User({
      fullName: 'Admin User',
      email: 'admin@idharudhar.com',
      phone: '9999999999',
      role: 'Admin',
      gender: 'Male',
      dateOfBirth: new Date('1990-01-01'),
      isVerified: true,
      isActive: true,
      referralCode: 'ADMIN001'
    });

    await adminUser.save();
    console.log('✅ Admin user created');

    // Create sample driver
    const driverUser = new User({
      fullName: 'Rajesh Kumar',
      email: 'rajesh@example.com',
      phone: '9876543210',
      role: 'Driver',
      gender: 'Male',
      dateOfBirth: new Date('1985-05-15'),
      isVerified: true,
      isActive: true,
      driverInfo: {
        vehicleType: 'Car',
        vehicleNumber: 'DL01AB1234',
        licenseNumber: 'DL123456789',
        vehicleModel: 'Maruti Swift',
        vehicleColor: 'White',
        isAvailable: true,
        currentLocation: {
          type: 'Point',
          coordinates: [77.2090, 28.6139] // Delhi coordinates
        },
        rating: 4.5,
        totalRides: 150,
        totalEarnings: 25000
      }
    });

    await driverUser.save();
    console.log('✅ Sample driver created');

    // Create sample customer
    const customerUser = new User({
      fullName: 'Priya Sharma',
      email: 'priya@example.com',
      phone: '9876543211',
      role: 'User',
      gender: 'Female',
      dateOfBirth: new Date('1992-08-20'),
      isVerified: true,
      isActive: true,
      wallet: {
        balance: 500
      }
    });

    await customerUser.save();
    console.log('✅ Sample customer created');

    console.log('🎉 Database seeding completed successfully!');
    console.log('\n📋 Sample Users Created:');
    console.log('Admin: admin@idharudhar.com');
    console.log('Driver: rajesh@example.com');
    console.log('Customer: priya@example.com');

  } catch (error) {
    console.error('❌ Seeding failed:', error);
  } finally {
    mongoose.connection.close();
  }
};

// Run seeding
seedData();
