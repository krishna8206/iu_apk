const express = require('express');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { validateLocation } = require('../middleware/validation');
const {
  getDistanceAndDuration,
  getDirections,
  geocodeAddress,
  reverseGeocode,
  getNearbyPlaces,
  getPlaceDetails,
  autocompletePlaces,
  calculateFare,
  getTrafficConditions
} = require('../utils/googleMaps');

const router = express.Router();

// Get distance and duration between two points
router.post('/distance', optionalAuth, async (req, res) => {
  try {
    const { origin, destination, mode = 'driving' } = req.body;

    if (!origin || !destination || !origin.lat || !origin.lng || !destination.lat || !destination.lng) {
      return res.status(400).json({
        status: 'error',
        message: 'Origin and destination coordinates are required'
      });
    }

    const result = await getDistanceAndDuration(origin, destination, mode);

    if (!result.success) {
      return res.status(400).json({
        status: 'error',
        message: result.error
      });
    }

    res.status(200).json({
      status: 'success',
      data: result
    });

  } catch (error) {
    console.error('Distance calculation error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to calculate distance'
    });
  }
});

// Get directions with waypoints
router.post('/directions', optionalAuth, async (req, res) => {
  try {
    const { origin, destination, waypoints = [], mode = 'driving' } = req.body;

    if (!origin || !destination || !origin.lat || !origin.lng || !destination.lat || !destination.lng) {
      return res.status(400).json({
        status: 'error',
        message: 'Origin and destination coordinates are required'
      });
    }

    const result = await getDirections(origin, destination, waypoints, mode);

    if (!result.success) {
      return res.status(400).json({
        status: 'error',
        message: result.error
      });
    }

    res.status(200).json({
      status: 'success',
      data: result
    });

  } catch (error) {
    console.error('Directions error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get directions'
    });
  }
});

// Geocode address to coordinates
router.post('/geocode', optionalAuth, async (req, res) => {
  try {
    const { address } = req.body;

    if (!address) {
      return res.status(400).json({
        status: 'error',
        message: 'Address is required'
      });
    }

    const result = await geocodeAddress(address);

    if (!result.success) {
      return res.status(400).json({
        status: 'error',
        message: result.error
      });
    }

    res.status(200).json({
      status: 'success',
      data: result
    });

  } catch (error) {
    console.error('Geocoding error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to geocode address'
    });
  }
});

// Reverse geocode coordinates to address
router.post('/reverse-geocode', optionalAuth, async (req, res) => {
  try {
    const { lat, lng } = req.body;

    if (!lat || !lng) {
      return res.status(400).json({
        status: 'error',
        message: 'Latitude and longitude are required'
      });
    }

    const result = await reverseGeocode(lat, lng);

    if (!result.success) {
      return res.status(400).json({
        status: 'error',
        message: result.error
      });
    }

    res.status(200).json({
      status: 'success',
      data: result
    });

  } catch (error) {
    console.error('Reverse geocoding error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to reverse geocode coordinates'
    });
  }
});

// Get nearby places
router.post('/nearby', optionalAuth, async (req, res) => {
  try {
    const { lat, lng, type = 'establishment', radius = 1000 } = req.body;

    if (!lat || !lng) {
      return res.status(400).json({
        status: 'error',
        message: 'Latitude and longitude are required'
      });
    }

    const result = await getNearbyPlaces(lat, lng, type, radius);

    if (!result.success) {
      return res.status(400).json({
        status: 'error',
        message: result.error
      });
    }

    res.status(200).json({
      status: 'success',
      data: result
    });

  } catch (error) {
    console.error('Nearby places error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get nearby places'
    });
  }
});

// Get place details
router.get('/place/:placeId', optionalAuth, async (req, res) => {
  try {
    const { placeId } = req.params;

    const result = await getPlaceDetails(placeId);

    if (!result.success) {
      return res.status(400).json({
        status: 'error',
        message: result.error
      });
    }

    res.status(200).json({
      status: 'success',
      data: result
    });

  } catch (error) {
    console.error('Place details error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get place details'
    });
  }
});

// Autocomplete places
router.post('/autocomplete', optionalAuth, async (req, res) => {
  try {
    const { input, location, radius = 50000 } = req.body;

    if (!input) {
      return res.status(400).json({
        status: 'error',
        message: 'Input text is required'
      });
    }

    const result = await autocompletePlaces(input, location, radius);

    if (!result.success) {
      return res.status(400).json({
        status: 'error',
        message: result.error
      });
    }

    res.status(200).json({
      status: 'success',
      data: result
    });

  } catch (error) {
    console.error('Autocomplete error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get autocomplete suggestions'
    });
  }
});

// Calculate fare
router.post('/calculate-fare', optionalAuth, async (req, res) => {
  try {
    const { origin, destination, vehicleType, surgeMultiplier = 1 } = req.body;

    if (!origin || !destination || !vehicleType) {
      return res.status(400).json({
        status: 'error',
        message: 'Origin, destination, and vehicle type are required'
      });
    }

    // Get distance and duration
    const distanceResult = await getDistanceAndDuration(origin, destination);
    
    if (!distanceResult.success) {
      return res.status(400).json({
        status: 'error',
        message: distanceResult.error
      });
    }

    // Calculate fare
    const fare = calculateFare(
      distanceResult.distance,
      distanceResult.duration,
      vehicleType,
      surgeMultiplier
    );

    res.status(200).json({
      status: 'success',
      data: {
        distance: distanceResult.distance,
        duration: distanceResult.duration,
        distanceText: distanceResult.distanceText,
        durationText: distanceResult.durationText,
        fare: fare
      }
    });

  } catch (error) {
    console.error('Fare calculation error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to calculate fare'
    });
  }
});

// Get traffic conditions
router.post('/traffic', optionalAuth, async (req, res) => {
  try {
    const { origin, destination } = req.body;

    if (!origin || !destination || !origin.lat || !origin.lng || !destination.lat || !destination.lng) {
      return res.status(400).json({
        status: 'error',
        message: 'Origin and destination coordinates are required'
      });
    }

    const result = await getTrafficConditions(origin, destination);

    if (!result.success) {
      return res.status(400).json({
        status: 'error',
        message: result.error
      });
    }

    res.status(200).json({
      status: 'success',
      data: result
    });

  } catch (error) {
    console.error('Traffic conditions error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get traffic conditions'
    });
  }
});

// Update driver location
router.post('/update-location', authenticateToken, validateLocation, async (req, res) => {
  try {
    const { longitude, latitude } = req.body;

    // Update driver location in database
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    if (user.role !== 'Driver') {
      return res.status(403).json({
        status: 'error',
        message: 'Only drivers can update location'
      });
    }

    await user.updateLocation(longitude, latitude);

    // Emit location update to connected clients via Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.emit('driver-location-update', {
        driverId: user._id,
        location: {
          longitude,
          latitude
        },
        timestamp: new Date()
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Location updated successfully'
    });

  } catch (error) {
    console.error('Update location error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update location'
    });
  }
});

// Get nearby drivers
router.post('/nearby-drivers', optionalAuth, async (req, res) => {
  try {
    const { lat, lng, radius = 5000, vehicleType } = req.body;

    if (!lat || !lng) {
      return res.status(400).json({
        status: 'error',
        message: 'Latitude and longitude are required'
      });
    }

    // Find nearby drivers using MongoDB geospatial query
    const drivers = await User.find({
      role: 'Driver',
      'driverInfo.isAvailable': true,
      'driverInfo.currentLocation': {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(lng), parseFloat(lat)]
          },
          $maxDistance: radius
        }
      }
    }).select('fullName phone driverInfo.vehicleType driverInfo.currentLocation driverInfo.rating');

    // Filter by vehicle type if specified
    const filteredDrivers = vehicleType ? 
      drivers.filter(driver => driver.driverInfo.vehicleType === vehicleType) : 
      drivers;

    res.status(200).json({
      status: 'success',
      data: {
        drivers: filteredDrivers,
        count: filteredDrivers.length
      }
    });

  } catch (error) {
    console.error('Nearby drivers error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get nearby drivers'
    });
  }
});

module.exports = router;
