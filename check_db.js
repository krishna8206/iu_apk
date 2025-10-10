const mongoose = require('mongoose');
const Ride = require('./models/Ride');

async function checkDatabase() {
  try {
    await mongoose.connect('mongodb://localhost:27017/idhar-udhar', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log('🔗 Connected to MongoDB');
    
    // Check all rides
    const totalRides = await Ride.countDocuments({});
    console.log('📊 Total rides in database:', totalRides);
    
    // Check completed rides
    const completedCount = await Ride.countDocuments({status: 'completed'});
    console.log('✅ Completed rides:', completedCount);
    
    // Check recent rides
    const recentRides = await Ride.find({}).sort({createdAt: -1}).limit(5);
    console.log('\n📋 Recent rides:');
    
    recentRides.forEach((ride, index) => {
      console.log(`${index + 1}. ID: ${ride._id}`);
      console.log(`   Status: ${ride.status}`);
      console.log(`   OTP Verified: ${ride.otpVerified || false}`);
      console.log(`   Created: ${ride.createdAt}`);
      console.log(`   Completed: ${ride.completedAt || 'Not completed'}`);
      console.log(`   Pricing: ₹${ride.pricing?.finalAmount || 'No pricing'}`);
      console.log(`   User: ${ride.user || 'No user'}`);
      console.log(`   Driver: ${ride.driver || 'No driver'}`);
      console.log('   ---');
    });
    
    // Check for the specific ride from terminal logs
    try {
      const specificRide = await Ride.findById('68d4d5ce631e7a7159e47b71');
      if (specificRide) {
        console.log('\n🎯 Specific ride (68d4d5ce631e7a7159e47b71):');
        console.log('   Status:', specificRide.status);
        console.log('   OTP Verified:', specificRide.otpVerified);
        console.log('   OTP Verified At:', specificRide.otpVerifiedAt);
        console.log('   Completed At:', specificRide.completedAt);
        console.log('   Pricing:', specificRide.pricing);
        console.log('   Special Requests:', specificRide.specialRequests);
      } else {
        console.log('\n❌ Specific ride not found in database');
      }
    } catch (err) {
      console.log('\n❌ Error finding specific ride:', err.message);
    }
    
    // Check rides with OTP verified
    const otpVerifiedRides = await Ride.find({otpVerified: true}).sort({createdAt: -1}).limit(3);
    console.log(`\n🔐 OTP Verified rides: ${otpVerifiedRides.length}`);
    otpVerifiedRides.forEach((ride, index) => {
      console.log(`${index + 1}. ${ride._id} - Status: ${ride.status} - Completed: ${ride.completedAt ? 'Yes' : 'No'}`);
    });
    
  } catch (error) {
    console.error('❌ Database error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
    process.exit(0);
  }
}

checkDatabase();
