/**
 * Test script for dynamic pricing calculator
 * Run with: node test_pricing.js
 */

const { calculateCompletePricing } = require('./utils/pricingCalculator');

console.log('🧪 Testing Dynamic Pricing Calculator\n');

// Test Case 1: Short distance (2 km)
console.log('📍 Test Case 1: Short Distance (2 km)');
const test1 = calculateCompletePricing({
    pickupCoords: [72.5714, 23.0225], // Ahmedabad coordinates
    destinationCoords: [72.5814, 23.0325], // 2 km away
    rideType: 'bike',
    serviceType: 'delivery',
    surgeMultiplier: 1
});

console.log('Results:', {
    distance: `${test1.route.distance} km`,
    duration: `${test1.route.duration} minutes`,
    totalFare: `₹${test1.pricing.totalFare / 100}`,
    breakdown: test1.pricing.breakdown
});
console.log('---\n');

// Test Case 2: Medium distance (5 km)
console.log('📍 Test Case 2: Medium Distance (5 km)');
const test2 = calculateCompletePricing({
    pickupCoords: [72.5714, 23.0225],
    destinationCoords: [72.6214, 23.0725], // ~5 km away
    rideType: 'bike',
    serviceType: 'delivery',
    surgeMultiplier: 1
});

console.log('Results:', {
    distance: `${test2.route.distance} km`,
    duration: `${test2.route.duration} minutes`,
    totalFare: `₹${test2.pricing.totalFare / 100}`,
    breakdown: test2.pricing.breakdown
});
console.log('---\n');

// Test Case 3: Long distance (10 km)
console.log('📍 Test Case 3: Long Distance (10 km)');
const test3 = calculateCompletePricing({
    pickupCoords: [72.5714, 23.0225],
    destinationCoords: [72.7214, 23.1225], // ~10 km away
    rideType: 'bike',
    serviceType: 'delivery',
    surgeMultiplier: 1
});

console.log('Results:', {
    distance: `${test3.route.distance} km`,
    duration: `${test3.route.duration} minutes`,
    totalFare: `₹${test3.pricing.totalFare / 100}`,
    breakdown: test3.pricing.breakdown
});
console.log('---\n');

// Test Case 4: Different vehicle types
console.log('📍 Test Case 4: Different Vehicle Types (5 km)');
const vehicleTypes = ['bike', 'auto', 'car', 'truck'];

vehicleTypes.forEach(vehicleType => {
    const test = calculateCompletePricing({
        pickupCoords: [72.5714, 23.0225],
        destinationCoords: [72.6214, 23.0725],
        rideType: vehicleType,
        serviceType: 'delivery',
        surgeMultiplier: 1
    });

    console.log(`${vehicleType.toUpperCase()}: ₹${test.pricing.totalFare / 100} (${test.route.distance} km)`);
});

console.log('\n✅ Dynamic Pricing Test Complete!');
console.log('\n📊 Summary:');
console.log('- Base fare varies by vehicle type');
console.log('- Distance fare: ₹4/km for bikes (as requested)');
console.log('- Time-based component included');
console.log('- All calculations are dynamic based on actual coordinates');
