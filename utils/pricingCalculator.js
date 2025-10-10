/**
 * Dynamic Pricing Calculator for IdharUdhar
 * Calculates ride fare based on distance, time, and other factors
 */

/**
 * Calculate dynamic pricing for rides/deliveries
 * @param {Object} params - Pricing parameters
 * @param {number} params.distance - Distance in kilometers
 * @param {number} params.duration - Duration in minutes (optional)
 * @param {string} params.rideType - Type of ride (bike, auto, car, truck)
 * @param {string} params.serviceType - Service type (ride, delivery)
 * @param {number} params.surgeMultiplier - Surge pricing multiplier (default: 1)
 * @returns {Object} Pricing breakdown
 */
function calculateDynamicPricing({
    distance = 0,
    duration = 0,
    rideType = 'bike',
    serviceType = 'delivery',
    surgeMultiplier = 1
}) {
    console.log('🧮 Calculating dynamic pricing:', { distance, duration, rideType, serviceType, surgeMultiplier });

    // Base fare configuration
    const baseFareConfig = {
        bike: 20,
        auto: 30,
        car: 50,
        truck: 80
    };

    // Per kilometer rate configuration (₹4 per Km universal)
    const perKmRateConfig = {
        bike: 4,
        auto: 4,
        car: 4,
        truck: 4
    };

    // Per minute rate configuration (optional time-based pricing)
    const perMinuteRateConfig = {
        bike: 0.5,
        auto: 1,
        car: 1.5,
        truck: 2
    };

    // Get rates for the specified ride type
    const baseFare = baseFareConfig[rideType.toLowerCase()] || baseFareConfig.bike;
    const perKmRate = perKmRateConfig[rideType.toLowerCase()] || perKmRateConfig.bike;
    const perMinuteRate = perMinuteRateConfig[rideType.toLowerCase()] || perMinuteRateConfig.bike;

    // Calculate fare components
    const distanceFare = Math.round(distance * perKmRate * 100) / 100; // Round to 2 decimal places
    const timeFare = Math.round(duration * perMinuteRate * 100) / 100;

    // Calculate total before surge
    const subtotal = baseFare + distanceFare + timeFare;

    // Apply surge multiplier
    const totalFare = Math.round(subtotal * surgeMultiplier * 100) / 100;

    // Convert to paise for storage (multiply by 100)
    const totalFareInPaise = Math.round(totalFare * 100);

    const pricingBreakdown = {
        baseFare: baseFare,
        distanceFare: distanceFare,
        timeFare: timeFare,
        surgeMultiplier: surgeMultiplier,
        totalFare: totalFareInPaise, // in paise for database storage
        finalAmount: totalFareInPaise, // same as totalFare for now
        // Additional info for debugging
        breakdown: {
            baseFareRs: baseFare,
            distanceFareRs: distanceFare,
            timeFareRs: timeFare,
            subtotalRs: subtotal,
            totalFareRs: totalFare,
            perKmRate: perKmRate,
            perMinuteRate: perMinuteRate
        }
    };

    console.log('💰 Dynamic pricing calculated:', {
        distance: `${distance} km`,
        baseFare: `₹${baseFare}`,
        distanceFare: `₹${distanceFare} (${distance} km × ₹${perKmRate}/km)`,
        timeFare: `₹${timeFare} (${duration} min × ₹${perMinuteRate}/min)`,
        totalFare: `₹${totalFare}`,
        totalFareInPaise: totalFareInPaise
    });

    return pricingBreakdown;
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {Array} coord1 - [longitude, latitude]
 * @param {Array} coord2 - [longitude, latitude]
 * @returns {number} Distance in kilometers
 */
function calculateDistance(coord1, coord2) {
    const [lon1, lat1] = coord1;
    const [lon2, lat2] = coord2;

    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return Math.round(distance * 100) / 100; // Round to 2 decimal places
}

/**
 * Estimate duration based on distance (rough estimate)
 * @param {number} distance - Distance in kilometers
 * @param {string} rideType - Type of ride
 * @returns {number} Estimated duration in minutes
 */
function estimateDuration(distance, rideType = 'bike') {
    // Average speeds in km/h
    const averageSpeeds = {
        bike: 25,
        auto: 20,
        car: 30,
        truck: 25
    };

    const speed = averageSpeeds[rideType.toLowerCase()] || averageSpeeds.bike;
    const durationInHours = distance / speed;
    const durationInMinutes = Math.round(durationInHours * 60);

    return durationInMinutes;
}

/**
 * Calculate complete pricing with distance calculation
 * @param {Object} params - Parameters
 * @param {Array} params.pickupCoords - [longitude, latitude]
 * @param {Array} params.destinationCoords - [longitude, latitude]
 * @param {string} params.rideType - Type of ride
 * @param {string} params.serviceType - Service type
 * @param {number} params.surgeMultiplier - Surge multiplier
 * @returns {Object} Complete pricing with route info
 */
function calculateCompletePricing({
    pickupCoords,
    destinationCoords,
    rideType = 'bike',
    serviceType = 'delivery',
    surgeMultiplier = 1
}) {
    // Calculate distance
    const distance = calculateDistance(pickupCoords, destinationCoords);

    // Estimate duration
    const duration = estimateDuration(distance, rideType);

    // Calculate pricing
    const pricing = calculateDynamicPricing({
        distance,
        duration,
        rideType,
        serviceType,
        surgeMultiplier
    });

    return {
        route: {
            distance,
            duration
        },
        pricing,
        calculations: {
            pickupCoords,
            destinationCoords,
            calculatedDistance: distance,
            estimatedDuration: duration
        }
    };
}

module.exports = {
    calculateDynamicPricing,
    calculateDistance,
    estimateDuration,
    calculateCompletePricing
};
