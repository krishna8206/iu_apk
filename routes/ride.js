const express = require('express');
const Ride = require('../models/Ride');
const User = require('../models/User');
const Payment = require('../models/Payment');
const Notification = require('../models/Notification');
const { authenticateToken, requireVerification } = require('../middleware/auth');
const { validateRideRequest, validateObjectId, validatePagination } = require('../middleware/validation');
const { getDistanceAndDuration, calculateFare } = require('../utils/googleMaps');
const { sendRideConfirmationEmail } = require('../utils/email');
const { calculateCompletePricing } = require('../utils/pricingCalculator');

const router = express.Router();

// Create delivery request (dedicated endpoint)
router.post('/delivery/request', authenticateToken, requireVerification, async (req, res) => {
  try {
    console.log('🚀 Delivery request received:', JSON.stringify(req.body, null, 2));
    console.log('👤 User ID:', req.user?._id);

    const {
      rideType = 'bike',
      serviceType = 'delivery',
      pickup,
      destination,
      passengers = 1,
      luggage = true,
      specialRequests = '',
      scheduledTime = null,
      paymentMethod = 'cash'
    } = req.body;

    console.log('📍 Pickup:', pickup);
    console.log('📍 Destination:', destination);

    // Basic validation for delivery
    if (!pickup || !destination) {
      return res.status(400).json({
        status: 'error',
        message: 'Pickup and destination are required for delivery'
      });
    }

    if (!pickup.address || !destination.address) {
      console.log('❌ Missing addresses - Pickup:', pickup.address, 'Destination:', destination.address);
      return res.status(400).json({
        status: 'error',
        message: 'Pickup and destination addresses are required'
      });
    }

    // Validate coordinates
    if (!pickup.coordinates || !Array.isArray(pickup.coordinates) || pickup.coordinates.length !== 2) {
      console.log('❌ Invalid pickup coordinates:', pickup.coordinates);
      return res.status(400).json({
        status: 'error',
        message: 'Invalid pickup coordinates'
      });
    }

    // Validate destination coordinates
    if (!destination.coordinates || !Array.isArray(destination.coordinates) || destination.coordinates.length !== 2) {
      console.log('❌ Invalid destination coordinates:', destination.coordinates);
      return res.status(400).json({
        status: 'error',
        message: 'Invalid destination coordinates'
      });
    }

    // Validate coordinate values are numbers
    if (isNaN(pickup.coordinates[0]) || isNaN(pickup.coordinates[1]) ||
      isNaN(destination.coordinates[0]) || isNaN(destination.coordinates[1])) {
      return res.status(400).json({
        status: 'error',
        message: 'Coordinates must be valid numbers'
      });
    }

    // Calculate pricing using the pricing calculator
    const pickupCoords = pickup.coordinates;
    const destCoords = destination.coordinates;

    console.log('🧮 Calculating pricing for delivery...');
    console.log('📍 From:', pickupCoords, 'To:', destCoords);

    const pricingData = await calculateCompletePricing({
      pickup: { coordinates: pickupCoords },
      destination: { coordinates: destCoords },
      rideType,
      serviceType: 'delivery',
      passengers: 1,
      luggage: true
    });

    console.log('💰 Pricing calculated:', pricingData);

    // Create delivery ride
    const ride = new Ride({
      user: req.user._id,
      rideType,
      serviceType: 'delivery',
      pickup: {
        address: pickup.address,
        coordinates: {
          type: 'Point',
          coordinates: pickupCoords
        },
        landmark: pickup.landmark || '',
        instructions: pickup.instructions || ''
      },
      destination: {
        address: destination.address,
        coordinates: {
          type: 'Point',
          coordinates: destCoords
        },
        landmark: destination.landmark || '',
        instructions: destination.instructions || ''
      },
      route: pricingData.route,
      pricing: pricingData.pricing,
      passengers: 1,
      luggage: true,
      specialRequests: specialRequests || 'Parcel Delivery',
      scheduledTime: scheduledTime ? new Date(scheduledTime) : null,
      payment: {
        method: paymentMethod
      }
    });

    await ride.save();

    console.log('✅ Delivery ride created successfully:', ride._id);

    res.status(201).json({
      status: 'success',
      message: 'Delivery request created successfully',
      data: {
        ride: ride,
        rideId: ride._id,
        estimatedFare: pricingData.pricing.finalAmount,
        estimatedFareRs: pricingData.pricing.finalAmount / 100,
        estimatedTime: pricingData.route.duration,
        distance: pricingData.route.distance,
        pricingBreakdown: pricingData.pricing.breakdown
      }
    });

  } catch (error) {
    console.error('❌ Delivery request error:', error);
    console.error('❌ Error stack:', error.stack);
    res.status(500).json({
      status: 'error',
      message: 'Failed to create delivery request',
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Create ride request
router.post('/request', authenticateToken, requireVerification, async (req, res) => {
  try {
    console.log('Ride request received:', req.body);

    const {
      rideType,
      serviceType = 'ride',
      pickup,
      destination,
      passengers = 1,
      luggage = false,
      specialRequests = '',
      scheduledTime = null,
      paymentMethod = 'cash'
    } = req.body;

    // Basic validation
    if (!rideType || !pickup || !destination) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required fields: rideType, pickup, destination'
      });
    }

    if (!pickup.address || !pickup.coordinates || !destination.address || !destination.coordinates) {
      return res.status(400).json({
        status: 'error',
        message: 'Pickup and destination must have address and coordinates'
      });
    }

    // Validate coordinates format
    if (!Array.isArray(pickup.coordinates) || pickup.coordinates.length !== 2) {
      console.log('Invalid pickup coordinates:', pickup.coordinates);
      return res.status(400).json({
        status: 'error',
        message: 'Pickup coordinates must be array of [longitude, latitude]'
      });
    }

    if (!Array.isArray(destination.coordinates) || destination.coordinates.length !== 2) {
      console.log('Invalid destination coordinates:', destination.coordinates);
      return res.status(400).json({
        status: 'error',
        message: 'Destination coordinates must be array of [longitude, latitude]'
      });
    }

    // Validate coordinate values are numbers
    if (isNaN(pickup.coordinates[0]) || isNaN(pickup.coordinates[1]) ||
      isNaN(destination.coordinates[0]) || isNaN(destination.coordinates[1])) {
      return res.status(400).json({
        status: 'error',
        message: 'Coordinates must be valid numbers'
      });
    }

    // Calculate distance and duration (with fallback)
    let distanceResult;
    let fare;

    try {
      distanceResult = await getDistanceAndDuration(
        { lat: pickup.coordinates[1], lng: pickup.coordinates[0] },
        { lat: destination.coordinates[1], lng: destination.coordinates[0] }
      );

      if (distanceResult.success) {
        fare = calculateFare(distanceResult.distance, distanceResult.duration, rideType);
      } else {
        throw new Error('Distance calculation failed');
      }
    } catch (error) {
      console.log('Distance calculation failed, using fallback:', error.message);
      // Fallback values for demo
      distanceResult = {
        success: true,
        distance: 5.5, // 5.5 km
        duration: 15,  // 15 minutes
        route: 'Fallback route'
      };
      fare = calculateFare(distanceResult.distance, distanceResult.duration, rideType);
    }

    // Create ride
    const ride = new Ride({
      user: req.user._id,
      rideType,
      serviceType,
      pickup: {
        address: pickup.address,
        coordinates: {
          type: 'Point',
          coordinates: pickup.coordinates
        },
        landmark: pickup.landmark,
        instructions: pickup.instructions
      },
      destination: {
        address: destination.address,
        coordinates: {
          type: 'Point',
          coordinates: destination.coordinates
        },
        landmark: destination.landmark,
        instructions: destination.instructions
      },
      route: {
        distance: distanceResult.distance,
        duration: distanceResult.duration
      },
      pricing: {
        baseFare: fare.baseFare || 20,
        distanceFare: fare.distanceFare || 50,
        timeFare: fare.timeFare || 15,
        subtotal: fare.subtotal || 85,
        finalAmount: fare.finalAmount || 85
      },
      passengers,
      luggage,
      specialRequests,
      scheduledTime: scheduledTime ? new Date(scheduledTime) : null,
      payment: {
        method: paymentMethod
      }
    });

    await ride.save();

    // Emit ride request to nearby drivers via Socket.IO
    const io = req.app.get('io');
    const { broadcastRideRequest } = req.app.get('socketUtils');
    if (io && broadcastRideRequest) {
      const rideData = {
        rideId: ride._id,
        rideType,
        pickup: ride.pickup,
        destination: ride.destination,
        fare: ride.pricing.finalAmount,
        distance: ride.route.distance,
        duration: ride.route.duration,
        serviceType: 'ride', // to distinguish from delivery
      };
      await broadcastRideRequest(rideData);
    }

    res.status(201).json({
      status: 'success',
      message: 'Ride request created successfully',
      data: {
        rideId: ride._id,
        status: ride.status,
        estimatedFare: ride.pricing.finalAmount,
        estimatedDistance: ride.route.distance,
        estimatedDuration: ride.route.duration
      }
    });

  } catch (error) {
    console.error('Create ride request error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to create ride request'
    });
  }
});

// Get user's ride history
router.get('/history', authenticateToken, validatePagination, async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const skip = (page - 1) * limit;

    const filter = { user: req.user._id };
    if (status) {
      filter.status = status;
    }

    const rides = await Ride.find(filter)
      .populate('driver', 'fullName phone driverInfo.vehicleType driverInfo.rating')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Ride.countDocuments(filter);

    res.status(200).json({
      status: 'success',
      data: {
        rides,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total
        }
      }
    });

  } catch (error) {
    console.error('Get ride history error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get ride history'
    });
  }
});

// Get ride details
router.get('/:rideId', authenticateToken, validateObjectId('rideId'), async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.rideId)
      .populate('user', 'fullName phone email')
      .populate('driver', 'fullName phone driverInfo.vehicleType driverInfo.vehicleNumber driverInfo.rating');

    if (!ride) {
      return res.status(404).json({
        status: 'error',
        message: 'Ride not found'
      });
    }

    // Check if user has access to this ride
    if (ride.user._id.toString() !== req.user._id.toString() &&
      (!ride.driver || ride.driver._id.toString() !== req.user._id.toString())) {
      return res.status(403).json({
        status: 'error',
        message: 'Unauthorized access to ride'
      });
    }

    res.status(200).json({
      status: 'success',
      data: ride
    });

  } catch (error) {
    console.error('Get ride details error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get ride details'
    });
  }
});

// Cancel ride
router.post('/:rideId/cancel', authenticateToken, validateObjectId('rideId'), async (req, res) => {
  try {
    const { reason } = req.body;
    const ride = await Ride.findById(req.params.rideId);

    if (!ride) {
      return res.status(404).json({
        status: 'error',
        message: 'Ride not found'
      });
    }

    if (ride.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        status: 'error',
        message: 'Unauthorized to cancel this ride'
      });
    }

    if (['completed', 'cancelled'].includes(ride.status)) {
      return res.status(400).json({
        status: 'error',
        message: 'Cannot cancel completed or already cancelled ride'
      });
    }

    // Calculate cancellation fee based on ride status
    let cancellationFee = 0;
    if (ride.status === 'accepted' || ride.status === 'arrived') {
      cancellationFee = Math.min(ride.pricing.finalAmount * 0.1, 50); // 10% or ₹50 max
    }

    await ride.cancelRide('user', reason, cancellationFee);

    // Refund payment if applicable
    if (ride.payment.method !== 'cash' && ride.payment.status === 'completed') {
      const refundAmount = ride.pricing.finalAmount - cancellationFee;
      if (refundAmount > 0) {
        // Process refund through payment gateway
        // This would integrate with your payment system
      }
    }

    // Notify driver if ride was accepted
    if (ride.driver) {
      const notification = new Notification({
        user: ride.driver,
        title: 'Ride Cancelled',
        message: `Ride ${ride._id} has been cancelled by the user`,
        type: 'ride_update',
        data: { rideId: ride._id }
      });
      await notification.save();
    }

    res.status(200).json({
      status: 'success',
      message: 'Ride cancelled successfully',
      data: {
        cancellationFee,
        refundAmount: Math.max(0, ride.pricing.finalAmount - cancellationFee)
      }
    });

  } catch (error) {
    console.error('Cancel ride error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to cancel ride'
    });
  }
});

// Rate ride
router.post('/:rideId/rate', authenticateToken, validateObjectId('rideId'), async (req, res) => {
  try {
    const { rating, feedback } = req.body;
    const ride = await Ride.findById(req.params.rideId);

    if (!ride) {
      return res.status(404).json({
        status: 'error',
        message: 'Ride not found'
      });
    }

    if (ride.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        status: 'error',
        message: 'Unauthorized to rate this ride'
      });
    }

    if (ride.status !== 'completed') {
      return res.status(400).json({
        status: 'error',
        message: 'Can only rate completed rides'
      });
    }

    if (ride.rating.userRating.rating) {
      return res.status(400).json({
        status: 'error',
        message: 'Ride already rated'
      });
    }

    // Update ride rating
    ride.rating.userRating = {
      rating,
      feedback,
      date: new Date()
    };

    await ride.save();

    // Update driver's average rating
    if (ride.driver) {
      const driver = await User.findById(ride.driver);
      if (driver) {
        const totalRides = await Ride.countDocuments({
          driver: ride.driver,
          status: 'completed',
          'rating.userRating.rating': { $exists: true }
        });

        const totalRating = await Ride.aggregate([
          {
            $match: {
              driver: ride.driver,
              status: 'completed',
              'rating.userRating.rating': { $exists: true }
            }
          },
          {
            $group: {
              _id: null,
              averageRating: { $avg: '$rating.userRating.rating' }
            }
          }
        ]);

        if (totalRating.length > 0) {
          driver.driverInfo.rating = Math.round(totalRating[0].averageRating * 10) / 10;
          await driver.save();
        }
      }
    }

    res.status(200).json({
      status: 'success',
      message: 'Ride rated successfully'
    });

  } catch (error) {
    console.error('Rate ride error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to rate ride'
    });
  }
});

// Get current ride
router.get('/current/active', authenticateToken, async (req, res) => {
  try {
    const ride = await Ride.findOne({
      user: req.user._id,
      status: { $in: ['searching', 'accepted', 'arrived', 'started'] }
    })
      .populate('driver', 'fullName phone driverInfo.vehicleType driverInfo.vehicleNumber driverInfo.currentLocation driverInfo.rating');

    if (!ride) {
      return res.status(404).json({
        status: 'error',
        message: 'No active ride found'
      });
    }

    res.status(200).json({
      status: 'success',
      data: ride
    });

  } catch (error) {
    console.error('Get current ride error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get current ride'
    });
  }
});

// Update ride status (for drivers)
router.patch('/:rideId/status', authenticateToken, validateObjectId('rideId'), async (req, res) => {
  try {
    const { status } = req.body;
    const ride = await Ride.findById(req.params.rideId);

    if (!ride) {
      return res.status(404).json({
        status: 'error',
        message: 'Ride not found'
      });
    }

    if (!ride.driver || ride.driver.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        status: 'error',
        message: 'Unauthorized to update ride status'
      });
    }

    const validStatuses = ['accepted', 'arrived', 'started', 'completed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid status'
      });
    }

    await ride.updateStatus(status);

    // ✅ HANDLE RIDE COMPLETION
    if (status === 'completed') {
      console.log('🏁 Processing ride completion:', ride._id);

      // Set completion time
      ride.completedAt = new Date();
      ride.actualDropTime = new Date();

      // Ensure pricing is set
      if (!ride.pricing || !ride.pricing.finalAmount) {
        ride.pricing = {
          baseFare: 50,
          distanceFare: 20,
          timeFare: 10,
          serviceFee: 5,
          finalAmount: 85,
        };
      }

      await ride.save();

      // 📡 EMIT COMPLETION EVENTS
      const io = req.app.get('io');
      if (io) {
        const completionData = {
          rideId: ride._id,
          message: 'Ride completed successfully',
          timestamp: new Date(),
          status: 'completed',
          amount: ride.pricing?.finalAmount,
          earnings: {
            today: ride.pricing?.finalAmount || 0,
            rideId: ride._id
          }
        };

        // Emit to ride room
        io.to(`ride_${ride._id}`).emit('ride-completed', completionData);

        // Emit to driver for earnings update
        if (ride.driver) {
          io.to(`user_${ride.driver}`).emit('ride-completed', completionData);
          io.to(`user_${ride.driver}`).emit('earnings-updated', completionData);
          console.log(`📡 Sent completion update to driver: ${ride.driver}`);
        }

        // Emit to all drivers room
        io.to('drivers').emit('ride-completed', completionData);

        console.log('📡 Broadcasted ride completion to all relevant parties');
      }
    }

    // Send notification to user
    const notification = new Notification({
      user: ride.user,
      title: 'Ride Status Update',
      message: `Your ride status has been updated to ${status}`,
      type: 'ride_update',
      data: { rideId: ride._id }
    });
    await notification.save();

    // Send email notification for important status changes
    if (status === 'accepted') {
      const user = await User.findById(ride.user);
      if (user) {
        await sendRideConfirmationEmail(user.email, {
          rideId: ride._id,
          rideType: ride.rideType,
          pickup: ride.pickup.address,
          destination: ride.destination.address,
          fare: ride.pricing.finalAmount,
          driverName: req.user.fullName,
          driverPhone: req.user.phone
        });
      }
    }

    res.status(200).json({
      status: 'success',
      message: 'Ride status updated successfully',
      data: {
        rideId: ride._id,
        status: ride.status
      }
    });

  } catch (error) {
    console.error('Update ride status error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update ride status'
    });
  }
});

// Add tracking location (for drivers)
router.post('/:rideId/track', authenticateToken, validateObjectId('rideId'), async (req, res) => {
  try {
    const { coordinates, speed = 0, heading = 0 } = req.body;
    const ride = await Ride.findById(req.params.rideId);

    if (!ride) {
      return res.status(404).json({
        status: 'error',
        message: 'Ride not found'
      });
    }

    if (!ride.driver || ride.driver.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        status: 'error',
        message: 'Unauthorized to track this ride'
      });
    }

    if (!['started', 'completed'].includes(ride.status)) {
      return res.status(400).json({
        status: 'error',
        message: 'Can only track started or completed rides'
      });
    }

    await ride.addTrackingLocation(coordinates, speed, heading);

    // Emit location update to user via Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.to(`ride_${ride._id}`).emit('ride-location-update', {
        rideId: ride._id,
        coordinates,
        speed,
        heading,
        timestamp: new Date()
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Location tracked successfully'
    });

  } catch (error) {
    console.error('Track ride location error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to track ride location'
    });
  }
});

module.exports = router;
