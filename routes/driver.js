const express = require("express");
const Ride = require("../models/Ride");
const User = require("../models/User");
const Payment = require("../models/Payment");
const Notification = require("../models/Notification");
const { authenticateToken, requireDriver } = require("../middleware/auth");
const {
  validateLocation,
  validateObjectId,
  validatePagination,
} = require("../middleware/validation");

const router = express.Router();

// Get available drivers for ride requests (public endpoint for users)
router.post("/available", async (req, res) => {
  try {
    const { location, rideType = "bike", serviceType = "ride" } = req.body;

    if (!location || !location.latitude || !location.longitude) {
      return res.status(400).json({
        status: "error",
        message: "Location coordinates are required",
      });
    }

    // Find available drivers near the location
    const availableDrivers = await User.find({
      role: "Driver",
      "driverInfo.isAvailable": true,
      "driverInfo.vehicleType":
        rideType.charAt(0).toUpperCase() + rideType.slice(1),
      isVerified: true,
      "driverInfo.currentLocation": {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [location.longitude, location.latitude],
          },
          $maxDistance: 10000,
        },
      },
    })
      .select(
        "fullName phone driverInfo.vehicleType driverInfo.vehicleNumber driverInfo.vehicleModel driverInfo.vehicleColor driverInfo.rating driverInfo.currentLocation"
      )
      .limit(10);

    console.log(`🔍 Available drivers query executed:`);
    console.log(`   - Role: 'Driver'`);
    console.log(
      `   - Vehicle Type: '${
        rideType.charAt(0).toUpperCase() + rideType.slice(1)
      }'`
    );
    console.log(`   - Available: true`);
    console.log(`   - Verified: true`);
    console.log(`   - Location: [${location.longitude}, ${location.latitude}]`);
    console.log(`   - Found: ${availableDrivers.length} drivers`);

    if (availableDrivers.length > 0) {
      console.log(`✅ Available drivers found:`);
      availableDrivers.forEach((driver, index) => {
        console.log(`   ${index + 1}. ${driver.fullName} (${driver.phone})`);
        console.log(
          `      Vehicle: ${driver.driverInfo?.vehicleType || "Not Set"}`
        );
        console.log(
          `      Location: ${
            driver.driverInfo?.currentLocation?.coordinates || "Not Set"
          }`
        );
      });
    } else {
      console.log(`❌ No drivers found matching criteria`);

      // Debug: Check ALL available drivers with invalid locations
      const driversWithBadLocation = await User.find({
        role: "Driver",
        "driverInfo.isAvailable": true,
        isVerified: true,
        $or: [
          { "driverInfo.currentLocation.coordinates.0": 0 },
          { "driverInfo.currentLocation.coordinates.1": 0 },
          { "driverInfo.currentLocation": { $exists: false } },
        ],
      }).select("fullName phone role isVerified driverInfo");

      if (driversWithBadLocation.length > 0) {
        console.log(
          `🔍 FOUND ${driversWithBadLocation.length} DRIVERS WITH INVALID LOCATIONS:`
        );

        for (const driver of driversWithBadLocation) {
          console.log(`   - ${driver.fullName} (${driver.phone})`);
          console.log(
            `     Current Location: ${JSON.stringify(
              driver.driverInfo?.currentLocation?.coordinates || "Not Set"
            )}`
          );
          console.log(
            `     Vehicle Type: ${driver.driverInfo?.vehicleType || "Not Set"}`
          );

          // Fix both location AND vehicle type if needed
          const updateData = {
            "driverInfo.currentLocation": {
              type: "Point",
              coordinates: [location.longitude, location.latitude],
            },
          };

          // Fix vehicle type if it's not set or doesn't match expected format
          if (
            !driver.driverInfo?.vehicleType ||
            driver.driverInfo.vehicleType === "Not Set"
          ) {
            updateData["driverInfo.vehicleType"] =
              rideType.charAt(0).toUpperCase() + rideType.slice(1);
            console.log(
              `🔧 FIXING ${driver.fullName.toUpperCase()}'S VEHICLE TYPE: Setting to ${
                updateData["driverInfo.vehicleType"]
              }`
            );
          }

          // Fix location
          console.log(
            `🔧 FIXING ${driver.fullName.toUpperCase()}'S LOCATION: Setting to customer coordinates`
          );

          await User.findByIdAndUpdate(driver._id, updateData);

          console.log(`✅ ${driver.fullName.toUpperCase()}'S DATA UPDATED:`);
          console.log(
            `   - Location: [${location.longitude}, ${location.latitude}]`
          );
          console.log(
            `   - Vehicle Type: ${
              updateData["driverInfo.vehicleType"] ||
              driver.driverInfo?.vehicleType
            }`
          );
        }

        // Re-run the query after fixing all locations and vehicle types
        console.log(
          `🔄 RE-RUNNING AVAILABLE DRIVERS QUERY AFTER FIXING ${driversWithBadLocation.length} DRIVERS...`
        );
        const retryDrivers = await User.find({
          role: "Driver",
          "driverInfo.isAvailable": true,
          "driverInfo.vehicleType":
            rideType.charAt(0).toUpperCase() + rideType.slice(1),
          isVerified: true,
          "driverInfo.currentLocation": {
            $near: {
              $geometry: {
                type: "Point",
                coordinates: [location.longitude, location.latitude],
              },
              $maxDistance: 10000,
            },
          },
        }).select(
          "fullName phone driverInfo.vehicleType driverInfo.vehicleNumber driverInfo.vehicleModel driverInfo.vehicleColor driverInfo.rating driverInfo.currentLocation"
        );

        if (retryDrivers.length > 0) {
          console.log(
            `✅ RETRY SUCCESS: Found ${retryDrivers.length} drivers after fixes`
          );

          // Format and return the drivers
          const formattedDrivers = retryDrivers.map((driver) => ({
            id: driver._id,
            fullName: driver.fullName,
            name: driver.fullName,
            phone: driver.phone,
            vehicleNumber: driver.driverInfo?.vehicleNumber || null,
            vehicleModel: driver.driverInfo?.vehicleModel
              ? `${driver.driverInfo.vehicleColor || ""} ${
                  driver.driverInfo.vehicleModel
                }`.trim()
              : null,
            vehicleType: driver.driverInfo?.vehicleType || null,
            rating: driver.driverInfo?.rating || null,
            location: driver.driverInfo?.currentLocation || null,
          }));

          return res.status(200).json({
            status: "success",
            data: {
              drivers: formattedDrivers,
              count: formattedDrivers.length,
              source: "real_drivers",
            },
          });
        } else {
          console.log(`❌ Still no drivers found after fixes`);
        }
      } else {
        console.log(
          `🔍 No drivers found with invalid locations. All available drivers have proper coordinates.`
        );

        // Check what's preventing drivers from being found - including vehicle type mismatch
        const allAvailableDrivers = await User.find({
          role: "Driver",
          "driverInfo.isAvailable": true,
          isVerified: true,
        }).select("fullName phone driverInfo");

        console.log(
          `📊 DEBUG: Found ${allAvailableDrivers.length} available drivers (ignoring location and vehicle type):`
        );
        allAvailableDrivers.forEach((driver, index) => {
          console.log(`   ${index + 1}. ${driver.fullName} (${driver.phone})`);
          console.log(
            `      Vehicle: ${
              driver.driverInfo?.vehicleType || "Not Set"
            } (Looking for: ${
              rideType.charAt(0).toUpperCase() + rideType.slice(1)
            })`
          );
          console.log(
            `      Location: ${JSON.stringify(
              driver.driverInfo?.currentLocation?.coordinates || "Not Set"
            )}`
          );
          console.log(`      Available: ${driver.driverInfo?.isAvailable}`);
        });

        // Auto-fix drivers with wrong vehicle types
        const driversWithWrongVehicleType = allAvailableDrivers.filter(
          (driver) =>
            !driver.driverInfo?.vehicleType ||
            driver.driverInfo.vehicleType === "Not Set" ||
            driver.driverInfo.vehicleType !==
              rideType.charAt(0).toUpperCase() + rideType.slice(1)
        );

        if (driversWithWrongVehicleType.length > 0) {
          console.log(
            `🔧 AUTO-FIXING ${driversWithWrongVehicleType.length} DRIVERS WITH WRONG VEHICLE TYPES...`
          );

          for (const driver of driversWithWrongVehicleType) {
            await User.findByIdAndUpdate(driver._id, {
              "driverInfo.vehicleType":
                rideType.charAt(0).toUpperCase() + rideType.slice(1),
            });
            console.log(
              `✅ Fixed ${driver.fullName}'s vehicle type to ${
                rideType.charAt(0).toUpperCase() + rideType.slice(1)
              }`
            );
          }

          // Re-run query one more time
          console.log(`🔄 FINAL RETRY AFTER VEHICLE TYPE FIXES...`);
          const finalRetryDrivers = await User.find({
            role: "Driver",
            "driverInfo.isAvailable": true,
            "driverInfo.vehicleType":
              rideType.charAt(0).toUpperCase() + rideType.slice(1),
            isVerified: true,
            "driverInfo.currentLocation": {
              $near: {
                $geometry: {
                  type: "Point",
                  coordinates: [location.longitude, location.latitude],
                },
                $maxDistance: 10000,
              },
            },
          }).select(
            "fullName phone driverInfo.vehicleType driverInfo.vehicleNumber driverInfo.vehicleModel driverInfo.vehicleColor driverInfo.rating driverInfo.currentLocation"
          );

          if (finalRetryDrivers.length > 0) {
            console.log(
              `✅ FINAL SUCCESS: Found ${finalRetryDrivers.length} drivers after all fixes`
            );

            const formattedDrivers = finalRetryDrivers.map((driver) => ({
              id: driver._id,
              fullName: driver.fullName,
              name: driver.fullName,
              phone: driver.phone,
              vehicleNumber: driver.driverInfo?.vehicleNumber || null,
              vehicleModel: driver.driverInfo?.vehicleModel
                ? `${driver.driverInfo.vehicleColor || ""} ${
                    driver.driverInfo.vehicleModel
                  }`.trim()
                : null,
              vehicleType: driver.driverInfo?.vehicleType || null,
              rating: driver.driverInfo?.rating || null,
              location: driver.driverInfo?.currentLocation || null,
            }));

            return res.status(200).json({
              status: "success",
              data: {
                drivers: formattedDrivers,
                count: formattedDrivers.length,
                source: "real_drivers",
              },
            });
          }
        }
      }
    }

    // If no drivers found nearby, return empty response
    if (availableDrivers.length === 0) {
      return res.status(200).json({
        status: "success",
        data: {
          drivers: [],
          count: 0,
          source: "no_drivers",
          message: "No drivers currently available. Please try again later.",
        },
      });
    }

    // Format real driver data
    const formattedDrivers = availableDrivers.map((driver) => ({
      id: driver._id,
      fullName: driver.fullName,
      name: driver.fullName,
      phone: driver.phone,
      vehicleNumber: driver.driverInfo.vehicleNumber,
      vehicleModel: `${driver.driverInfo.vehicleColor} ${driver.driverInfo.vehicleModel}`,
      vehicleType: driver.driverInfo.vehicleType,
      rating: driver.driverInfo.rating || 4.5,
      location: driver.driverInfo.currentLocation,
    }));

    res.status(200).json({
      status: "success",
      data: {
        drivers: formattedDrivers,
        count: formattedDrivers.length,
      },
    });
  } catch (error) {
    console.error("Get available drivers error:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to get available drivers",
    });
  }
});

// Debug endpoint to check online drivers status
router.get("/debug/online-status", async (req, res) => {
  try {
    console.log("🔍 Debug: Checking online drivers status...");

    // Get all drivers from database
    const allDrivers = await User.find({ role: "Driver" })
      .select("fullName phone isOnline isVerified driverInfo")
      .lean();

    // Filter online drivers
    const onlineDriversList = allDrivers.filter((driver) => driver.isOnline);

    // Format response
    const response = {
      status: "success",
      data: {
        totalDrivers: allDrivers.length,
        onlineDrivers: onlineDriversList.length,
        allDrivers: allDrivers.map((driver) => ({
          name: driver.fullName,
          phone: driver.phone,
          isOnline: driver.isOnline || false,
          isVerified: driver.isVerified || false,
          vehicleType: driver.driverInfo?.vehicleType || "Not Set",
          vehicleNumber: driver.driverInfo?.vehicleNumber || "Not Set",
          rating: driver.driverInfo?.rating || 0,
        })),
        onlineDriversList: onlineDriversList.map((driver) => ({
          name: driver.fullName,
          phone: driver.phone,
          vehicleType: driver.driverInfo?.vehicleType || "Not Set",
          vehicleNumber: driver.driverInfo?.vehicleNumber || "Not Set",
          rating: driver.driverInfo?.rating || 0,
        })),
      },
    };

    console.log(
      `📊 Debug Response: ${allDrivers.length} total, ${onlineDriversList.length} online`
    );
    res.json(response);
  } catch (error) {
    console.error("❌ Debug online status error:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to get online drivers status",
      error: error.message,
    });
  }
});

// Debug endpoint to set driver location
router.post("/debug/set-location/:driverId", async (req, res) => {
  try {
    const { driverId } = req.params;
    const { longitude, latitude } = req.body;

    if (!longitude || !latitude) {
      return res.status(400).json({
        status: "error",
        message: "Longitude and latitude are required",
      });
    }

    const driver = await User.findByIdAndUpdate(
      driverId,
      {
        "driverInfo.currentLocation.coordinates": [longitude, latitude],
      },
      { new: true }
    );

    if (!driver) {
      return res.status(404).json({
        status: "error",
        message: "Driver not found",
      });
    }

    console.log(
      `🔧 DEBUG: Set ${driver.fullName}'s location to [${longitude}, ${latitude}]`
    );

    res.json({
      status: "success",
      message: `Location updated for ${driver.fullName}`,
      data: {
        driverId: driver._id,
        name: driver.fullName,
        location: driver.driverInfo.currentLocation,
      },
    });
  } catch (error) {
    console.error("❌ Set location error:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to set driver location",
      error: error.message,
    });
  }
});

// Debug endpoint to fix specific driver data
router.post("/debug/fix-driver/:driverId", async (req, res) => {
  try {
    const { driverId } = req.params;
    const {
      vehicleType = "Bike",
      longitude = 72.5714,
      latitude = 23.0225,
    } = req.body;

    const driver = await User.findByIdAndUpdate(
      driverId,
      {
        "driverInfo.vehicleType": vehicleType,
        "driverInfo.currentLocation": {
          type: "Point",
          coordinates: [longitude, latitude],
        },
        "driverInfo.isAvailable": true,
        "driverInfo.rating": 4.5,
        "driverInfo.vehicleNumber": "GJ01AB1234",
        "driverInfo.vehicleModel": "Honda Activa",
        "driverInfo.vehicleColor": "Black",
      },
      { new: true }
    );

    if (!driver) {
      return res.status(404).json({
        status: "error",
        message: "Driver not found",
      });
    }

    console.log(`🔧 FIXED DRIVER DATA: ${driver.fullName}`);
    console.log(`   - Vehicle Type: ${vehicleType}`);
    console.log(`   - Location: [${longitude}, ${latitude}]`);
    console.log(`   - Available: true`);

    res.json({
      status: "success",
      message: `Driver ${driver.fullName} data fixed successfully`,
      data: {
        driverId: driver._id,
        name: driver.fullName,
        vehicleType: driver.driverInfo.vehicleType,
        location: driver.driverInfo.currentLocation,
        isAvailable: driver.driverInfo.isAvailable,
      },
    });
  } catch (error) {
    console.error("❌ Fix driver error:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to fix driver data",
      error: error.message,
    });
  }
});

// Debug endpoint to get driver ID by phone
router.get("/debug/find-by-phone/:phone", async (req, res) => {
  try {
    const { phone } = req.params;

    const driver = await User.findOne({
      phone: phone,
      role: "Driver",
    }).select("_id fullName phone role driverInfo");

    if (!driver) {
      return res.status(404).json({
        status: "error",
        message: "Driver not found",
      });
    }

    res.json({
      status: "success",
      data: {
        driverId: driver._id,
        name: driver.fullName,
        phone: driver.phone,
        vehicleType: driver.driverInfo?.vehicleType || "Not Set",
        location: driver.driverInfo?.currentLocation?.coordinates || "Not Set",
        isAvailable: driver.driverInfo?.isAvailable || false,
      },
    });
  } catch (error) {
    console.error("❌ Find driver by phone error:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to find driver",
      error: error.message,
    });
  }
});

// Get driver profile data (replaces AsyncStorage dependency)
router.get("/profile", authenticateToken, requireDriver, async (req, res) => {
  try {
    const driver = await User.findById(req.user._id)
      .select('fullName phone email driverInfo isVerified isOnline createdAt')
      .lean();

    if (!driver) {
      return res.status(404).json({
        status: 'error',
        message: 'Driver not found'
      });
    }

    // Get basic stats
    const totalRides = await Ride.countDocuments({
      driver: req.user._id,
      status: 'completed'
    });

    const totalEarnings = await Ride.aggregate([
      {
        $match: { driver: req.user._id, status: 'completed' }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$pricing.finalAmount' }
        }
      }
    ]);

    // Format response with all driver data from backend
    const profileData = {
      id: driver._id,
      fullName: driver.fullName,
      phone: driver.phone,
      email: driver.email,
      isVerified: driver.isVerified,
      isOnline: driver.isOnline,
      joinedDate: driver.createdAt,
      driverInfo: {
        vehicleType: driver.driverInfo?.vehicleType || 'Bike',
        vehicleNumber: driver.driverInfo?.vehicleNumber || '',
        vehicleModel: driver.driverInfo?.vehicleModel || '',
        vehicleColor: driver.driverInfo?.vehicleColor || '',
        rating: driver.driverInfo?.rating || 4.5,
        isAvailable: driver.driverInfo?.isAvailable || false,
        currentLocation: driver.driverInfo?.currentLocation || null,
        lastLocationUpdate: driver.driverInfo?.lastLocationUpdate || null
      },
      stats: {
        totalRides,
        totalEarnings: totalEarnings[0]?.total || 0,
        totalEarningsRs: (totalEarnings[0]?.total || 0) / 100
      }
    };

    console.log(`📱 Driver profile data sent for ${driver.fullName} (replacing AsyncStorage)`);

    res.status(200).json({
      status: 'success',
      message: 'Driver profile data retrieved from backend',
      data: profileData
    });

  } catch (error) {
    console.error('Get driver profile error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get driver profile data'
    });
  }
});

// Update driver profile data (replaces AsyncStorage writes)
router.patch("/profile", authenticateToken, requireDriver, async (req, res) => {
  try {
    const {
      vehicleType,
      vehicleNumber,
      vehicleModel,
      vehicleColor,
      currentLocation
    } = req.body;

    const updateData = {};

    // Update vehicle information
    if (vehicleType) updateData['driverInfo.vehicleType'] = vehicleType;
    if (vehicleNumber) updateData['driverInfo.vehicleNumber'] = vehicleNumber;
    if (vehicleModel) updateData['driverInfo.vehicleModel'] = vehicleModel;
    if (vehicleColor) updateData['driverInfo.vehicleColor'] = vehicleColor;

    // Update location if provided
    if (currentLocation && currentLocation.latitude && currentLocation.longitude) {
      updateData['driverInfo.currentLocation'] = {
        type: 'Point',
        coordinates: [currentLocation.longitude, currentLocation.latitude]
      };
      updateData['driverInfo.lastLocationUpdate'] = new Date();
    }

    const updatedDriver = await User.findByIdAndUpdate(
      req.user._id,
      updateData,
      { new: true }
    ).select('fullName phone driverInfo');

    console.log(`📱 Driver profile updated for ${updatedDriver.fullName} (replacing AsyncStorage)`);

    res.status(200).json({
      status: 'success',
      message: 'Driver profile updated successfully',
      data: {
        id: updatedDriver._id,
        fullName: updatedDriver.fullName,
        phone: updatedDriver.phone,
        driverInfo: updatedDriver.driverInfo
      }
    });

  } catch (error) {
    console.error('Update driver profile error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update driver profile'
    });
  }
});

// Get driver dashboard data
router.get("/dashboard", authenticateToken, requireDriver, async (req, res) => {
  try {
    const driverId = req.user._id;
    const { subDriverId } = req.query;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get today's rides
    const todayFilter = {
      driver: driverId,
      createdAt: { $gte: today, $lt: tomorrow },
      status: "completed",
    };
    if (subDriverId) todayFilter.subDriver = subDriverId;
    const todayRides = await Ride.find(todayFilter);

    // Get total earnings
    const totalMatch = { driver: driverId, status: "completed" };
    if (subDriverId) totalMatch.subDriver = require("mongoose").Types.ObjectId.createFromHexString(String(subDriverId));
    const totalEarnings = await Ride.aggregate([
      {
        $match: totalMatch,
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$pricing.finalAmount" },
        },
      },
    ]);

    // Get today's earnings
    const todayEarnings = todayRides.reduce(
      (sum, ride) => sum + ride.pricing.finalAmount,
      0
    );

    // Get total rides
    const totalRides = await Ride.countDocuments({
      driver: driverId,
      status: "completed",
    });

    // Get current rating
    const ratingMatch = { driver: driverId, status: "completed", "rating.userRating.rating": { $exists: true } };
    if (subDriverId) ratingMatch.subDriver = require("mongoose").Types.ObjectId.createFromHexString(String(subDriverId));
    const ratingResult = await Ride.aggregate([
      {
        $match: ratingMatch,
      },
      {
        $group: {
          _id: null,
          averageRating: { $avg: "$rating.userRating.rating" },
          totalRatings: { $sum: 1 },
        },
      },
    ]);

    // Get recent rides
    const recentFilter = { driver: driverId };
    if (subDriverId) recentFilter.subDriver = subDriverId;
    const recentRides = await Ride.find(recentFilter)
      .populate("user", "fullName phone")
      .sort({ createdAt: -1 })
      .limit(5);

    // Get weekly earnings
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weeklyMatch = { driver: driverId, createdAt: { $gte: weekStart }, status: "completed" };
    if (subDriverId) weeklyMatch.subDriver = require("mongoose").Types.ObjectId.createFromHexString(String(subDriverId));
    const weeklyEarnings = await Ride.aggregate([
      {
        $match: weeklyMatch,
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          earnings: { $sum: "$pricing.finalAmount" },
          rides: { $sum: 1 },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ]);

    // Get driver profile data
    const driverProfile = await User.findById(driverId)
      .select('fullName phone email driverInfo isVerified isOnline')
      .lean();

    // Calculate additional metrics for comprehensive dashboard
    const monthStart = new Date(today);
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const monthlyRides = await Ride.countDocuments({
      driver: driverId,
      createdAt: { $gte: monthStart },
      status: "completed"
    });

    const monthlyEarnings = await Ride.aggregate([
      {
        $match: {
          driver: driverId,
          createdAt: { $gte: monthStart },
          status: "completed"
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$pricing.finalAmount" }
        }
      }
    ]);

    // Format comprehensive dashboard response
    const dashboardResponse = {
      status: "success",
      message: "Dashboard data retrieved from backend (no AsyncStorage)",
      data: {
        // Driver profile information
        profile: {
          id: driverProfile?._id,
          fullName: driverProfile?.fullName || "Driver",
          phone: driverProfile?.phone,
          email: driverProfile?.email,
          isVerified: driverProfile?.isVerified || false,
          isOnline: driverProfile?.isOnline || false,
          vehicleType: driverProfile?.driverInfo?.vehicleType || "Bike",
          vehicleNumber: driverProfile?.driverInfo?.vehicleNumber || "",
          rating: ratingResult[0]?.averageRating || 4.5,
          isAvailable: driverProfile?.driverInfo?.isAvailable || false
        },
        
        // Earnings and statistics
        stats: {
          todayEarnings: todayEarnings,
          todayEarningsRs: todayEarnings / 100,
          totalEarnings: totalEarnings[0]?.total || 0,
          totalEarningsRs: (totalEarnings[0]?.total || 0) / 100,
          monthlyEarnings: monthlyEarnings[0]?.total || 0,
          monthlyEarningsRs: (monthlyEarnings[0]?.total || 0) / 100,
          
          todayRides: todayRides.length,
          totalRides,
          monthlyRides,
          
          rating: ratingResult[0]?.averageRating || 4.5,
          totalRatings: ratingResult[0]?.totalRatings || 0,
        },
        
        // Recent rides for quick view
        recentRides: recentRides.map(ride => ({
          _id: ride._id,
          pickup: ride.pickup,
          destination: ride.destination,
          status: ride.status,
          pricing: {
            finalAmount: ride.pricing?.finalAmount || 0,
            finalAmountRs: (ride.pricing?.finalAmount || 0) / 100
          },
          createdAt: ride.createdAt,
          completedAt: ride.completedAt,
          user: ride.user,
          serviceType: ride.serviceType || 'ride'
        })),
        
        // Weekly earnings breakdown
        weeklyEarnings: weeklyEarnings.map(day => ({
          ...day,
          earningsRs: day.earnings / 100
        })),
        
        // Summary for dashboard cards
        todaysSummary: {
          earnings: todayEarnings,
          earningsRs: todayEarnings / 100,
          rides: todayRides.length,
          rating: ratingResult[0]?.averageRating || 4.5,
          status: driverProfile?.driverInfo?.isAvailable ? 'Available' : 'Offline'
        },
        
        // Time-based metrics
        timeMetrics: {
          totalHours: totalRides * 0.5, // Estimate 30 min per ride
          todayHours: todayRides.length * 0.5,
          avgRideTime: 30 // minutes
        },
        
        // Expected payout (for display)
        expectedPayout: todayEarnings,
        
        // Source indicator
        dataSource: "backend_mongodb",
        lastUpdated: new Date().toISOString()
      }
    };

    console.log(`📊 Comprehensive dashboard data sent for driver ${driverProfile?.fullName} (${driverId})`);
    console.log(`💰 Today: ₹${todayEarnings/100}, Total: ₹${(totalEarnings[0]?.total || 0)/100}, Rides: ${todayRides.length}`);

    res.status(200).json(dashboardResponse);
  } catch (error) {
    console.error("Get driver dashboard error:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to get dashboard data",
    });
  }
});

// Get driver earnings (replaces AsyncStorage earnings data)
router.get("/earnings", authenticateToken, requireDriver, async (req, res) => {
  try {
    const driverId = req.user._id;
    const { period = 'week', subDriverId } = req.query;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let startDate = new Date(today);
    
    // Set date range based on period
    switch (period) {
      case 'today':
        // Already set to today
        break;
      case 'week':
        startDate.setDate(startDate.getDate() - startDate.getDay()); // Start of week
        break;
      case 'month':
        startDate.setDate(1); // Start of month
        break;
      case 'year':
        startDate.setMonth(0, 1); // Start of year
        break;
      default:
        startDate.setDate(startDate.getDate() - 7); // Default to week
    }
    
    startDate.setHours(0, 0, 0, 0);
    
    // Build match criteria
    const matchCriteria = {
      driver: driverId,
      status: 'completed',
      createdAt: { $gte: startDate }
    };
    
    if (subDriverId) {
      matchCriteria.subDriver = subDriverId;
    }
    
    // Get earnings data
    const earningsData = await Ride.aggregate([
      { $match: matchCriteria },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
          },
          earnings: { $sum: "$pricing.finalAmount" },
          rides: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    // Get total earnings for the period
    const totalEarnings = earningsData.reduce((sum, day) => sum + day.earnings, 0);
    const totalRides = earningsData.reduce((sum, day) => sum + day.rides, 0);
    
    // Get today's specific data
    const todayStr = today.toISOString().split('T')[0];
    const todayData = earningsData.find(day => day._id === todayStr) || { earnings: 0, rides: 0 };
    
    // Get all-time totals
    const allTimeData = await Ride.aggregate([
      { 
        $match: { 
          driver: driverId, 
          status: 'completed',
          ...(subDriverId ? { subDriver: subDriverId } : {})
        } 
      },
      {
        $group: {
          _id: null,
          totalEarnings: { $sum: "$pricing.finalAmount" },
          totalRides: { $sum: 1 }
        }
      }
    ]);
    
    const response = {
      status: 'success',
      message: 'Earnings data retrieved from backend (no AsyncStorage)',
      data: {
        period,
        startDate: startDate.toISOString(),
        endDate: new Date().toISOString(),
        
        // Summary totals
        totalEarnings,
        totalEarningsRs: totalEarnings / 100,
        totalRides,
        
        // Today's data
        todayEarnings: todayData.earnings,
        todayEarningsRs: todayData.earnings / 100,
        todayRides: todayData.rides,
        
        // All-time data
        allTimeEarnings: allTimeData[0]?.totalEarnings || 0,
        allTimeEarningsRs: (allTimeData[0]?.totalEarnings || 0) / 100,
        allTimeRides: allTimeData[0]?.totalRides || 0,
        
        // Daily breakdown
        dailyEarnings: earningsData.map(day => ({
          date: day._id,
          earnings: day.earnings,
          earningsRs: day.earnings / 100,
          rides: day.rides
        })),
        
        // Average per ride
        avgEarningsPerRide: totalRides > 0 ? totalEarnings / totalRides : 0,
        avgEarningsPerRideRs: totalRides > 0 ? (totalEarnings / totalRides) / 100 : 0,
        
        // Source
        dataSource: 'backend_mongodb',
        lastUpdated: new Date().toISOString()
      }
    };
    
    console.log(`💰 Earnings data sent for driver ${req.user.fullName} (${period})`);
    console.log(`📊 Period: ${totalEarnings/100} Rs, Today: ${todayData.earnings/100} Rs, Total rides: ${totalRides}`);
    
    res.status(200).json(response);
    
  } catch (error) {
    console.error('Get driver earnings error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get earnings data'
    });
  }
});

// Update driver availability
router.patch(
  "/availability",
  authenticateToken,
  requireDriver,
  async (req, res) => {
    try {
      const { isAvailable } = req.body;

      console.log(
        `🔄 Updating availability for driver ${req.user.fullName} (${req.user._id}) to: ${isAvailable}`
      );

      // Ensure driverInfo exists and update availability
      const updateData = {
        "driverInfo.isAvailable": isAvailable,
        "driverInfo.lastLocationUpdate": new Date(),
      };

      // If driverInfo doesn't exist, initialize it
      if (!req.user.driverInfo) {
        updateData["driverInfo.vehicleType"] = "Bike";
        updateData["driverInfo.rating"] = 4.5;
        updateData["driverInfo.currentLocation"] = {
          type: "Point",
          coordinates: [72.5714, 23.0225], // Default Ahmedabad coordinates
        };
      }

      await User.findByIdAndUpdate(req.user._id, updateData);

      console.log(
        `✅ Driver ${req.user.fullName} availability updated to: ${isAvailable}`
      );

      res.status(200).json({
        status: "success",
        message: `Driver ${
          isAvailable ? "available" : "unavailable"
        } successfully`,
      });
    } catch (error) {
      console.error("Update driver availability error:", error);
      res.status(500).json({
        status: "error",
        message: "Failed to update availability",
      });
    }
  }
);

// Get available ride requests
router.get(
  "/ride-requests",
  authenticateToken,
  requireDriver,
  async (req, res) => {
    try {
      const { lat, lng, radius = 10000 } = req.query; // 10km default radius

      if (!lat || !lng) {
        return res.status(400).json({
          status: "error",
          message: "Current location is required",
        });
      }

      // Find nearby ride requests with fallback for missing geospatial index
      let rideRequests = [];
      
      try {
        // Try geospatial query first
        rideRequests = await Ride.find({
          status: "pending",
          rideType: req.user.driverInfo.vehicleType,
          'pickup.coordinates': {
            $near: {
              $geometry: {
                type: "Point",
                coordinates: [parseFloat(lng), parseFloat(lat)],
              },
              $maxDistance: parseInt(radius),
            },
          },
        })
          .populate("user", "fullName phone")
          .sort({ createdAt: -1 })
          .limit(20);
          
        console.log('✅ Geospatial query successful, found:', rideRequests.length, 'rides');
      } catch (geoError) {
        console.error('❌ Geospatial query failed:', geoError.message);
        console.log('🔄 Falling back to non-geospatial query...');
        
        // Fallback: Get all pending rides without location filter
        rideRequests = await Ride.find({
          status: "pending",
          rideType: req.user.driverInfo.vehicleType,
        })
          .populate("user", "fullName phone")
          .sort({ createdAt: -1 })
          .limit(20);
          
        console.log('📍 Fallback query successful, found:', rideRequests.length, 'rides');
      }

      res.status(200).json({
        status: "success",
        data: {
          rideRequests,
          count: rideRequests.length,
        },
      });
    } catch (error) {
      console.error("Get ride requests error:", error);
      res.status(500).json({
        status: "error",
        message: "Failed to get ride requests",
      });
    }
  }
);

// Accept ride request
router.post(
  "/accept-ride/:rideId",
  authenticateToken,
  requireDriver,
  validateObjectId("rideId"),
  async (req, res) => {
    try {
      const ride = await Ride.findById(req.params.rideId);

      if (!ride) {
        return res.status(404).json({
          status: "error",
          message: "Ride not found",
        });
      }

      if (ride.status !== "pending") {
        return res.status(400).json({
          status: "error",
          message: "Ride is no longer available",
        });
      }

      // Flexible vehicle type matching for delivery requests
      const rideVehicleType = ride.rideType?.toLowerCase();
      const driverVehicleType = req.user.driverInfo.vehicleType?.toLowerCase();

      console.log(`🚗 Vehicle type check:`, {
        rideType: rideVehicleType,
        driverType: driverVehicleType,
        serviceType: ride.serviceType,
      });

      // For delivery requests, allow more flexible vehicle matching
      if (ride.serviceType === "delivery") {
        // Delivery can be done by bike, auto, or car
        const allowedVehicles = ["bike", "auto", "car", "any"];
        if (!allowedVehicles.includes(driverVehicleType)) {
          return res.status(400).json({
            status: "error",
            message: "Vehicle type not suitable for delivery",
          });
        }
        console.log(
          `✅ Delivery request - vehicle type ${driverVehicleType} is allowed`
        );
      } else {
        // For regular rides, strict matching
        if (rideVehicleType !== driverVehicleType) {
          return res.status(400).json({
            status: "error",
            message: "Vehicle type mismatch",
          });
        }
        console.log(
          `✅ Regular ride - vehicle types match: ${driverVehicleType}`
        );
      }

      // Ensure driver has vehicle type set
      if (
        !req.user.driverInfo.vehicleType ||
        req.user.driverInfo.vehicleType === "Not Set"
      ) {
        console.log(
          `🔧 Driver ${req.user.fullName} missing vehicle type, setting to 'Bike'`
        );
        await User.findByIdAndUpdate(req.user._id, {
          "driverInfo.vehicleType": "Bike",
        });
        req.user.driverInfo.vehicleType = "Bike";
      }

      // Check if driver is available
      if (!req.user.driverInfo.isAvailable) {
        return res.status(400).json({
          status: "error",
          message: "Driver is not available",
        });
      }

      // Update ride
      ride.driver = req.user._id;
      // If sub-driver is acting, attribute subDriver when valid
      const subHeader = req.headers["x-subdriver-id"] || req.headers["x-sub-driver-id"];
      if (subHeader) {
        try {
          const subId = String(subHeader);
          const belongs = (req.user.subDrivers || []).some(sd => String(sd._id) === subId && sd.isActive !== false);
          if (belongs) {
            ride.subDriver = subId;
          }
        } catch {}
      }
      ride.status = "accepted";
      ride.actualPickupTime = new Date();
      await ride.save();

      // Update driver availability
      await User.findByIdAndUpdate(req.user._id, {
        "driverInfo.isAvailable": false,
      });

      // Send notification to user
      const notification = new Notification({
        user: ride.user,
        title: "Ride Accepted",
        message: `Your ride has been accepted by ${req.user.fullName}`,
        type: "ride_update",
        data: { rideId: ride._id },
      });
      await notification.save();

      // Emit to user via Socket.IO
      const io = req.app.get("io");
      if (io) {
        io.to(`user_${ride.user}`).emit("ride-accepted", {
          rideId: ride._id,
          driver: {
            name: req.user.fullName,
            phone: req.user.phone,
            vehicleType: req.user.driverInfo.vehicleType,
            vehicleNumber: req.user.driverInfo.vehicleNumber,
            rating: req.user.driverInfo.rating,
          },
        });

        // Notify other drivers that ride is taken
        io.to("drivers").emit("ride-taken", {
          rideId: ride._id,
          takenBy: req.user._id,
        });
        console.log("📡 ✅ EMITTED RIDE-TAKEN TO DRIVERS ROOM");
      }

      res.status(200).json({
        status: "success",
        message: "Ride accepted successfully",
        data: {
          rideId: ride._id,
          user: {
            name: ride.user.fullName,
            phone: ride.user.phone,
            pickup: ride.pickup,
            destination: ride.destination,
          },
        },
      });
    } catch (error) {
      console.error("Accept ride error:", error);
      res.status(500).json({
        status: "error",
        message: "Failed to accept ride",
      });
    }
  }
);

// Get driver's ride history
router.get(
  "/rides",
  authenticateToken,
  requireDriver,
  validatePagination,
  async (req, res) => {
    try {
      const { page = 1, limit = 10, status, subDriverId } = req.query;
      const skip = (page - 1) * limit;

      const filter = { driver: req.user._id };
      if (status) {
        filter.status = status;
      }
      if (subDriverId) {
        filter.subDriver = subDriverId;
      }

      const rides = await Ride.find(filter)
        .populate("user", "fullName phone")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      const total = await Ride.countDocuments(filter);

      res.status(200).json({
        status: "success",
        data: {
          rides,
          pagination: {
            current: parseInt(page),
            pages: Math.ceil(total / limit),
            total,
          },
        },
      });
    } catch (error) {
      console.error("Get driver rides error:", error);
      res.status(500).json({
        status: "error",
        message: "Failed to get ride history",
      });
    }
  }
);

// Get current ride
router.get(
  "/current-ride",
  authenticateToken,
  requireDriver,
  async (req, res) => {
    try {
      const ride = await Ride.findOne({
        driver: req.user._id,
        status: { $in: ["accepted", "arrived", "started"] },
      }).populate("user", "fullName phone");

      if (!ride) {
        return res.status(404).json({
          status: "error",
          message: "No current ride found",
        });
      }

      res.status(200).json({
        status: "success",
        data: ride,
      });
    } catch (error) {
      console.error("Get current ride error:", error);
      res.status(500).json({
        status: "error",
        message: "Failed to get current ride",
      });
    }
  }
);

// Get driver profile
router.get("/profile", authenticateToken, requireDriver, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select(
      "-wallet.transactions"
    );

    // Calculate driver statistics
    const totalRides = await Ride.countDocuments({
      driver: req.user._id,
      status: "completed",
    });

    const ratingResult = await Ride.aggregate([
      {
        $match: {
          driver: req.user._id,
          status: "completed",
          "rating.userRating.rating": { $exists: true },
        },
      },
      {
        $group: {
          _id: null,
          averageRating: { $avg: "$rating.userRating.rating" },
          totalRatings: { $sum: 1 },
        },
      },
    ]);

    const averageRating =
      ratingResult.length > 0 ? ratingResult[0].averageRating : 0;
    const totalRatings =
      ratingResult.length > 0 ? ratingResult[0].totalRatings : 0;

    // Calculate driver level based on rides
    let level = "Bronze";
    let levelNumber = 1;
    if (totalRides >= 1000) {
      level = "Platinum";
      levelNumber = 4;
    } else if (totalRides >= 500) {
      level = "Gold";
      levelNumber = 3;
    } else if (totalRides >= 100) {
      level = "Silver";
      levelNumber = 2;
    }

    // Calculate progress to next level
    let progressToNextLevel = 0;
    if (level === "Bronze") {
      progressToNextLevel = Math.min((totalRides / 100) * 100, 100);
    } else if (level === "Silver") {
      progressToNextLevel = Math.min(((totalRides - 100) / 400) * 100, 100);
    } else if (level === "Gold") {
      progressToNextLevel = Math.min(((totalRides - 500) / 500) * 100, 100);
    } else {
      progressToNextLevel = 100;
    }

    res.status(200).json({
      status: "success",
      data: {
        ...user.toObject(),
        driverId: user._id,
        rating: Math.round(averageRating * 10) / 10,
        rides: totalRides,
        level,
        levelNumber,
        progressToNextLevel: Math.round(progressToNextLevel),
      },
    });
  } catch (error) {
    console.error("Get driver profile error:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to get driver profile",
    });
  }
});

// Update driver profile
router.patch("/profile", authenticateToken, requireDriver, async (req, res) => {
  try {
    const {
      vehicleType,
      vehicleNumber,
      vehicleModel,
      vehicleColor,
      licenseNumber,
      licenseExpiry,
    } = req.body;

    const updateData = {};

    if (vehicleType) updateData["driverInfo.vehicleType"] = vehicleType;
    if (vehicleNumber) updateData["driverInfo.vehicleNumber"] = vehicleNumber;
    if (vehicleModel) updateData["driverInfo.vehicleModel"] = vehicleModel;
    if (vehicleColor) updateData["driverInfo.vehicleColor"] = vehicleColor;
    if (licenseNumber) updateData["driverInfo.licenseNumber"] = licenseNumber;
    if (licenseExpiry)
      updateData["driverInfo.licenseExpiry"] = new Date(licenseExpiry);

    const user = await User.findByIdAndUpdate(req.user._id, updateData, {
      new: true,
    }).select("-wallet.transactions");

    res.status(200).json({
      status: "success",
      message: "Profile updated successfully",
      data: user,
    });
  } catch (error) {
    console.error("Update driver profile error:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to update profile",
    });
  }
});

// Get earnings
router.get("/earnings", authenticateToken, requireDriver, async (req, res) => {
  try {
    // Destructure subDriverId to allow filtering by sub-driver
    const { period = "week", subDriverId } = req.query;
    const driverId = req.user._id;

    let startDate;
    const endDate = new Date();

    switch (period) {
      case "today":
        startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        break;
      case "week":
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
        break;
      case "month":
        startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case "year":
        startDate = new Date();
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
      default:
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
    }

    // Build match filter used in aggregations
    const matchFilter = {
      driver: driverId,
      status: "completed",
      createdAt: { $gte: startDate, $lte: endDate },
    };
    if (subDriverId) {
      try {
        matchFilter.subDriver = require("mongoose").Types.ObjectId.createFromHexString(String(subDriverId));
      } catch (e) {
        // Invalid ObjectId format; ignore subDriverId filter
      }
    }

    // Get earnings breakdown
    const earnings = await Ride.aggregate([
      {
        $match: matchFilter,
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          totalEarnings: { $sum: "$pricing.finalAmount" },
          totalRides: { $sum: 1 },
          averageFare: { $avg: "$pricing.finalAmount" },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ]);

    // Get total summary
    const summary = await Ride.aggregate([
      {
        $match: matchFilter,
      },
      {
        $group: {
          _id: null,
          totalEarnings: { $sum: "$pricing.finalAmount" },
          totalRides: { $sum: 1 },
          averageFare: { $avg: "$pricing.finalAmount" },
        },
      },
    ]);

    res.status(200).json({
      status: "success",
      data: {
        period,
        summary: summary[0] || {
          totalEarnings: 0,
          totalRides: 0,
          averageFare: 0,
        },
        dailyEarnings: earnings,
      },
    });
  } catch (error) {
    console.error("Get earnings error:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to get earnings",
    });
  }
});

// Update bank details
router.patch(
  "/bank-details",
  authenticateToken,
  requireDriver,
  async (req, res) => {
    try {
      const { accountNumber, ifscCode, accountHolderName, bankName } = req.body;

      const updateData = {};

      if (accountNumber)
        updateData["driverInfo.bankDetails.accountNumber"] = accountNumber;
      if (ifscCode) updateData["driverInfo.bankDetails.ifscCode"] = ifscCode;
      if (accountHolderName)
        updateData["driverInfo.bankDetails.accountHolderName"] =
          accountHolderName;
      if (bankName) updateData["driverInfo.bankDetails.bankName"] = bankName;

      await User.findByIdAndUpdate(req.user._id, updateData);

      res.status(200).json({
        status: "success",
        message: "Bank details updated successfully",
      });
    } catch (error) {
      console.error("Update bank details error:", error);
      res.status(500).json({
        status: "error",
        message: "Failed to update bank details",
      });
    }
  }
);

// Request withdrawal
router.post("/withdraw", authenticateToken, requireDriver, async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        status: "error",
        message: "Invalid withdrawal amount",
      });
    }

    // Check if driver has sufficient earnings
    const totalEarnings = await Ride.aggregate([
      {
        $match: {
          driver: req.user._id,
          status: "completed",
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$pricing.finalAmount" },
        },
      },
    ]);

    const availableAmount = totalEarnings[0]?.total || 0;

    if (amount > availableAmount) {
      return res.status(400).json({
        status: "error",
        message: "Insufficient earnings for withdrawal",
      });
    }

    // Create withdrawal request (you might want to create a separate Withdrawal model)
    const withdrawal = new Payment({
      user: req.user._id,
      type: "withdrawal",
      amount: amount,
      method: "bank_transfer",
      status: "pending",
      description: "Driver earnings withdrawal",
    });

    await withdrawal.save();

    res.status(200).json({
      status: "success",
      message: "Withdrawal request submitted successfully",
      data: {
        withdrawalId: withdrawal._id,
        amount: amount,
        status: "pending",
      },
    });
  } catch (error) {
    console.error("Withdrawal request error:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to process withdrawal request",
    });
  }
});

// Update driver location
router.patch(
  "/location",
  authenticateToken,
  requireDriver,
  async (req, res) => {
    try {
      const { longitude, latitude } = req.body;

      if (!longitude || !latitude) {
        return res.status(400).json({
          status: "error",
          message: "Longitude and latitude are required",
        });
      }

      // Validate coordinates
      if (
        longitude < -180 ||
        longitude > 180 ||
        latitude < -90 ||
        latitude > 90
      ) {
        return res.status(400).json({
          status: "error",
          message: "Invalid coordinates provided",
        });
      }

      const driver = await User.findByIdAndUpdate(
        req.user._id,
        {
          "driverInfo.currentLocation": {
            type: "Point",
            coordinates: [parseFloat(longitude), parseFloat(latitude)],
          },
          "driverInfo.lastLocationUpdate": new Date(),
        },
        { new: true }
      );

      console.log(
        `📍 ${driver.fullName} updated location to [${longitude}, ${latitude}]`
      );

      // Emit location update to nearby customers via Socket.IO
      const io = req.app.get("io");
      if (io) {
        io.emit("driver-location-update", {
          driverId: driver._id,
          driverName: driver.fullName,
          location: {
            longitude: parseFloat(longitude),
            latitude: parseFloat(latitude),
          },
          vehicleType: driver.driverInfo.vehicleType,
          isAvailable: driver.driverInfo.isAvailable,
          timestamp: new Date(),
        });
      }

      res.json({
        status: "success",
        message: "Location updated successfully",
        data: {
          driverId: driver._id,
          name: driver.fullName,
          location: driver.driverInfo.currentLocation,
          lastUpdate: driver.driverInfo.lastLocationUpdate,
        },
      });
    } catch (error) {
      console.error("❌ Update location error:", error);
      res.status(500).json({
        status: "error",
        message: "Failed to update location",
        error: error.message,
      });
    }
  }
);

// Sub-Driver Management Endpoints

// Get all sub-drivers for the authenticated driver
router.get(
  "/sub-drivers",
  authenticateToken,
  requireDriver,
  async (req, res) => {
    try {
      const driver = await User.findById(req.user._id).select("subDrivers");

      if (!driver) {
        return res.status(404).json({
          status: "error",
          message: "Driver not found",
        });
      }

      console.log(
        `📋 Fetching sub-drivers for ${req.user.fullName}:`,
        driver.subDrivers?.length || 0
      );

      res.status(200).json({
        status: "success",
        data: {
          subDrivers: driver.subDrivers || [],
        },
      });
    } catch (error) {
      console.error("Get sub-drivers error:", error);
      res.status(500).json({
        status: "error",
        message: "Failed to get sub-drivers",
      });
    }
  }
);

// Add new sub-drivers (supports both single and multiple)
router.post(
  "/sub-drivers",
  authenticateToken,
  requireDriver,
  async (req, res) => {
    try {
      // Handle both single sub-driver and multiple sub-drivers
      let subDriversToAdd = [];

      if (req.body.subDrivers && Array.isArray(req.body.subDrivers)) {
        // Multiple sub-drivers from frontend
        subDriversToAdd = req.body.subDrivers;
        console.log(
          `🔄 Processing ${subDriversToAdd.length} sub-drivers for ${req.user.fullName}`
        );
      } else if (req.body.name) {
        // Single sub-driver (backward compatibility)
        const {
          name,
          email,
          phone,
          licenseNumber,
          vehicleNumber,
          vehicleType,
        } = req.body;
        subDriversToAdd = [
          {
            name,
            email,
            phone,
            licenseNumber,
            vehicleNumber,
            vehicleType,
          },
        ];
        console.log(`🔄 Processing single sub-driver for ${req.user.fullName}`);
      } else {
        return res.status(400).json({
          status: "error",
          message:
            "Invalid request format. Expected subDrivers array or individual fields.",
        });
      }

      // Validate all sub-drivers
      const addedSubDrivers = [];
      const errors = [];

      for (let i = 0; i < subDriversToAdd.length; i++) {
        const subDriver = subDriversToAdd[i];
        const {
          name,
          email,
          phone,
          licenseNumber,
          vehicleNumber,
          vehicleType,
        } = subDriver;

        // Validate required fields
        if (!name || !phone || !licenseNumber || !vehicleNumber) {
          errors.push(
            `Sub-driver ${
              i + 1
            }: Name, phone, license number, and vehicle number are required`
          );
          continue;
        }

        // Check if sub-driver with same phone or license already exists
        const existingDriver = await User.findOne({
          _id: req.user._id,
          $or: [
            { "subDrivers.phone": phone },
            { "subDrivers.licenseNumber": licenseNumber },
          ],
        });

        if (existingDriver) {
          errors.push(
            `Sub-driver ${
              i + 1
            } (${name}): Phone number or license already exists`
          );
          continue;
        }

        const newSubDriver = {
          name: name.trim(),
          email: email?.toLowerCase().trim(),
          phone: phone.trim(),
          licenseNumber: licenseNumber.trim(),
          vehicleNumber: vehicleNumber.trim(),
          vehicleType: vehicleType || "Bike",
          isActive: true,
        };

        // Add to database
        const driver = await User.findByIdAndUpdate(
          req.user._id,
          { $push: { subDrivers: newSubDriver } },
          { new: true }
        ).select("subDrivers");

        const addedSubDriver = driver.subDrivers[driver.subDrivers.length - 1];
        addedSubDrivers.push(addedSubDriver);

        console.log(`✅ Added sub-driver ${name} for ${req.user.fullName}`);
      }

      // Return response
      if (errors.length > 0 && addedSubDrivers.length === 0) {
        return res.status(400).json({
          status: "error",
          message: "Failed to add sub-drivers",
          errors: errors,
        });
      }

      const responseMessage =
        errors.length > 0
          ? `${addedSubDrivers.length} sub-drivers added successfully, ${errors.length} failed`
          : `${addedSubDrivers.length} sub-driver(s) added successfully`;

      res.status(201).json({
        status: "success",
        message: responseMessage,
        data: {
          subDrivers: addedSubDrivers,
          addedCount: addedSubDrivers.length,
          errors: errors.length > 0 ? errors : undefined,
        },
      });
    } catch (error) {
      console.error("Add sub-drivers error:", error);
      res.status(500).json({
        status: "error",
        message: "Failed to add sub-drivers",
        error: error.message,
      });
    }
  }
);

// Update a sub-driver
router.patch(
  "/sub-drivers/:subDriverId",
  authenticateToken,
  requireDriver,
  async (req, res) => {
    try {
      const { subDriverId } = req.params;
      const updateData = req.body;

      // Validate ObjectId format
      if (!subDriverId.match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(400).json({
          status: "error",
          message: "Invalid sub-driver ID format",
        });
      }

      const driver = await User.findOneAndUpdate(
        {
          _id: req.user._id,
          "subDrivers._id": subDriverId,
        },
        {
          $set: {
            "subDrivers.$.name": updateData.name,
            "subDrivers.$.email": updateData.email?.toLowerCase(),
            "subDrivers.$.phone": updateData.phone,
            "subDrivers.$.licenseNumber": updateData.licenseNumber,
            "subDrivers.$.vehicleNumber": updateData.vehicleNumber,
            "subDrivers.$.vehicleType": updateData.vehicleType,
            "subDrivers.$.isActive": updateData.isActive,
          },
        },
        { new: true }
      ).select("subDrivers");

      if (!driver) {
        return res.status(404).json({
          status: "error",
          message: "Sub-driver not found",
        });
      }

      console.log(
        `✅ Updated sub-driver ${subDriverId} for ${req.user.fullName}`
      );

      res.status(200).json({
        status: "success",
        message: "Sub-driver updated successfully",
        data: {
          subDrivers: driver.subDrivers,
        },
      });
    } catch (error) {
      console.error("Update sub-driver error:", error);
      res.status(500).json({
        status: "error",
        message: "Failed to update sub-driver",
      });
    }
  }
);

// Delete a sub-driver
router.delete(
  "/sub-drivers/:subDriverId",
  authenticateToken,
  requireDriver,
  async (req, res) => {
    try {
      const { subDriverId } = req.params;

      // Validate ObjectId format
      if (!subDriverId.match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(400).json({
          status: "error",
          message: "Invalid sub-driver ID format",
        });
      }

      const driver = await User.findByIdAndUpdate(
        req.user._id,
        { $pull: { subDrivers: { _id: subDriverId } } },
        { new: true }
      ).select("subDrivers");

      if (!driver) {
        return res.status(404).json({
          status: "error",
          message: "Driver not found",
        });
      }

      console.log(
        `🗑️ Deleted sub-driver ${subDriverId} for ${req.user.fullName}`
      );

      res.status(200).json({
        status: "success",
        message: "Sub-driver deleted successfully",
        data: {
          subDrivers: driver.subDrivers,
        },
      });
    } catch (error) {
      console.error("Delete sub-driver error:", error);
      res.status(500).json({
        status: "error",
        message: "Failed to delete sub-driver",
      });
    }
  }
);

// Toggle sub-driver status (active/inactive)
router.patch(
  "/sub-drivers/:subDriverId/toggle-status",
  authenticateToken,
  requireDriver,
  async (req, res) => {
    try {
      const { subDriverId } = req.params;

      // Validate ObjectId format
      if (!subDriverId.match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(400).json({
          status: "error",
          message: "Invalid sub-driver ID format",
        });
      }

      // First find the current status
      const driver = await User.findOne({
        _id: req.user._id,
        "subDrivers._id": subDriverId,
      }).select("subDrivers");

      if (!driver) {
        return res.status(404).json({
          status: "error",
          message: "Sub-driver not found",
        });
      }

      const subDriver = driver.subDrivers.find(
        (sd) => sd._id.toString() === subDriverId
      );
      const newStatus = !subDriver.isActive;

      // Update the status
      const updatedDriver = await User.findOneAndUpdate(
        {
          _id: req.user._id,
          "subDrivers._id": subDriverId,
        },
        {
          $set: { "subDrivers.$.isActive": newStatus },
        },
        { new: true }
      ).select("subDrivers");

      console.log(
        `🔄 Toggled sub-driver ${subDriverId} status to ${
          newStatus ? "active" : "inactive"
        }`
      );

      res.status(200).json({
        status: "success",
        message: `Sub-driver ${
          newStatus ? "activated" : "deactivated"
        } successfully`,
        data: {
          subDrivers: updatedDriver.subDrivers,
        },
      });
    } catch (error) {
      console.error("Toggle sub-driver status error:", error);
      res.status(500).json({
        status: "error",
        message: "Failed to toggle sub-driver status",
      });
    }
  }
);

// Get driver details by ID (public endpoint) - MUST BE LAST to avoid route conflicts
router.get("/:driverId", async (req, res) => {
  try {
    const { driverId } = req.params;

    // Validate ObjectId format
    if (!driverId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid driver ID format",
      });
    }

    const driver = await User.findById(driverId).select(
      "fullName phone driverInfo.vehicleType driverInfo.vehicleNumber driverInfo.vehicleModel driverInfo.vehicleColor driverInfo.rating driverInfo.currentLocation"
    );

    if (!driver || driver.role !== "Driver") {
      return res.status(404).json({
        status: "error",
        message: "Driver not found",
      });
    }

    res.status(200).json({
      status: "success",
      data: {
        id: driver._id,
        fullName: driver.fullName,
        name: driver.fullName,
        phone: driver.phone,
        vehicleNumber: driver.driverInfo.vehicleNumber,
        vehicleModel: `${driver.driverInfo.vehicleColor} ${driver.driverInfo.vehicleModel}`,
        vehicleType: driver.driverInfo.vehicleType,
        rating: driver.driverInfo.rating || 4.5,
        location: driver.driverInfo.currentLocation,
      },
    });
  } catch (error) {
    console.error("Get driver details error:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to get driver details",
    });
  }
});

module.exports = router;
