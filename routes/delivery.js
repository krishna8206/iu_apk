const express = require("express");
const mongoose = require("mongoose");
const Ride = require("../models/Ride");
const User = require("../models/User");
const {
  authenticateToken,
  requireVerification,
} = require("../middleware/auth");
const { calculateCompletePricing } = require("../utils/pricingCalculator");

const router = express.Router();

// Simple delivery request endpoint (no authentication required for testing)
router.post("/request", async (req, res) => {
  try {
    console.log("🚀 Simple delivery request received:", req.body);

    const {
      rideType = "bike",
      serviceType = "delivery",
      pickup,
      destination,
      passengers = 1,
      luggage = true,
      specialRequests = "Parcel Delivery",
      paymentMethod = "cash",
    } = req.body;

    // Basic validation
    if (!pickup || !destination) {
      console.log("❌ Missing pickup or destination");
      return res.status(400).json({
        status: "error",
        message: "Pickup and destination are required",
      });
    }

    // Use fallback values for missing data
    const pickupAddress = pickup.address || "Pickup Location";
    const destinationAddress = destination.address || "Destination Location";
    const pickupCoords = pickup.coordinates || [72.5714, 23.0225];
    const destCoords = destination.coordinates || [72.5814, 23.0325];

    console.log("✅ Creating delivery with data:", {
      pickupAddress,
      destinationAddress,
      pickupCoords,
      destCoords,
    });

    // Create simple delivery record
    const deliveryData = {
      rideType: "bike",
      serviceType: "delivery",
      pickup: {
        address: pickupAddress,
        coordinates: {
          type: "Point",
          coordinates: pickupCoords,
        },
      },
      destination: {
        address: destinationAddress,
        coordinates: {
          type: "Point",
          coordinates: destCoords,
        },
      },
      // Dynamic pricing will be calculated below
      route: {},
      pricing: {},
      passengers: 1,
      luggage: true,
      specialRequests: specialRequests,
      payment: {
        method: paymentMethod,
      },
      status: "pending",
    };

    // 🧮 CALCULATE DYNAMIC PRICING BASED ON DISTANCE
    console.log("🧮 Calculating dynamic pricing for delivery...");
    const pricingData = calculateCompletePricing({
      pickupCoords: pickupCoords,
      destinationCoords: destCoords,
      rideType: rideType,
      serviceType: serviceType,
      surgeMultiplier: 1 // Can be adjusted based on demand
    });

    // Update delivery data with calculated pricing and route
    deliveryData.route = pricingData.route;
    deliveryData.pricing = pricingData.pricing;

    console.log("✅ Dynamic pricing calculated:", {
      distance: `${pricingData.route.distance} km`,
      duration: `${pricingData.route.duration} minutes`,
      totalFare: `₹${pricingData.pricing.totalFare / 100}`,
      breakdown: pricingData.pricing.breakdown
    });

    // If user is authenticated, add user ID, otherwise create a dummy user ID
    if (req.user && req.user._id) {
      deliveryData.user = req.user._id;
      console.log("✅ Using authenticated user ID:", req.user._id);
    } else {
      // Create a dummy ObjectId for testing without authentication
      deliveryData.user = new mongoose.Types.ObjectId(
        "507f1f77bcf86cd799439011"
      ); // Dummy user ID
      console.log("⚠️ Using dummy user ID for testing:", deliveryData.user);
    }

    const ride = new Ride(deliveryData);
    await ride.save();

    console.log("✅ Delivery created successfully:", ride._id);

    // 🚀 BROADCAST TO ALL DRIVERS VIA SOCKET.IO
    const io = req.app.get("io");
    if (io) {
      const rideRequestData = {
        rideId: ride._id,
        rideType: ride.rideType,
        serviceType: "delivery",
        pickup: {
          address: ride.pickup.address,
          coordinates: ride.pickup.coordinates.coordinates,
        },
        destination: {
          address: ride.destination.address,
          coordinates: ride.destination.coordinates.coordinates,
        },
        fare: ride.pricing.finalAmount,
        distance: ride.route.distance,
        duration: ride.route.duration,
        specialRequests: ride.specialRequests,
        customerName: "Customer", // Default since no auth
        customerPhone: "",
        customerRating: "4.5",
        timestamp: new Date(),
      };

      console.log(
        "📡 Broadcasting delivery request using smart broadcasting:",
        rideRequestData
      );

      // ✅ USE SMART BROADCASTING INSTEAD OF SIMPLE BROADCAST
      const { broadcastRideRequest } = req.app.get('socketUtils');
      if (broadcastRideRequest) {
        await broadcastRideRequest(rideRequestData);
      } else {
        // Fallback to old method if smart broadcasting not available
        console.warn("⚠️ Smart broadcasting not available, using fallback");
        io.to("drivers").emit("new-ride-request", rideRequestData);
      }

      console.log("✅ Delivery request broadcasted using smart system");
    } else {
      console.warn("⚠️ Socket.IO not available for broadcasting");
    }

    res.status(201).json({
      status: "success",
      message: "Delivery request created successfully",
      data: {
        rideId: ride._id,
        estimatedFare: ride.pricing.finalAmount,
        estimatedFareRs: ride.pricing.finalAmount / 100,
        estimatedTime: ride.route.duration,
        distance: ride.route.distance,
        pricingBreakdown: ride.pricing.breakdown,
        ride: ride,
      },
    });
  } catch (error) {
    console.error("❌ Delivery creation error:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to create delivery request",
      error: error.message,
    });
  }
});

// Authenticated delivery request endpoint
router.post(
  "/request-auth",
  authenticateToken,
  requireVerification,
  async (req, res) => {
    try {
      console.log("🚀 Authenticated delivery request received:", req.body);
      console.log("👤 User ID:", req.user._id);

      const {
        rideType = "bike",
        serviceType = "delivery",
        pickup,
        destination,
        passengers = 1,
        luggage = true,
        specialRequests = "Parcel Delivery",
        paymentMethod = "cash",
      } = req.body;

      // Basic validation
      if (!pickup || !destination) {
        console.log("❌ Missing pickup or destination");
        return res.status(400).json({
          status: "error",
          message: "Pickup and destination are required",
        });
      }

      // Use fallback values for missing data
      const pickupAddress = pickup.address || "Pickup Location";
      const destinationAddress = destination.address || "Destination Location";
      const pickupCoords = pickup.coordinates || [72.5714, 23.0225];
      const destCoords = destination.coordinates || [72.5814, 23.0325];

      console.log("✅ Creating authenticated delivery with data:", {
        pickupAddress,
        destinationAddress,
        pickupCoords,
        destCoords,
        userId: req.user._id,
      });

      // Create delivery record with authenticated user
      const deliveryData = {
        user: req.user._id, // Use authenticated user ID
        rideType: "bike",
        serviceType: "delivery",
        pickup: {
          address: pickupAddress,
          coordinates: {
            type: "Point",
            coordinates: pickupCoords,
          },
        },
        destination: {
          address: destinationAddress,
          coordinates: {
            type: "Point",
            coordinates: destCoords,
          },
        },
        // Dynamic pricing will be calculated below
        route: {},
        pricing: {},
        passengers: 1,
        luggage: true,
        specialRequests: specialRequests,
        payment: {
          method: paymentMethod,
        },
        status: "pending",
      };

      // 🧮 CALCULATE DYNAMIC PRICING BASED ON DISTANCE
      console.log("🧮 Calculating dynamic pricing for authenticated delivery...");
      const pricingData = calculateCompletePricing({
        pickupCoords: pickupCoords,
        destinationCoords: destCoords,
        rideType: rideType,
        serviceType: serviceType,
        surgeMultiplier: 1 // Can be adjusted based on demand
      });

      // Update delivery data with calculated pricing and route
      deliveryData.route = pricingData.route;
      deliveryData.pricing = pricingData.pricing;

      console.log("✅ Dynamic pricing calculated for authenticated user:", {
        distance: `${pricingData.route.distance} km`,
        duration: `${pricingData.route.duration} minutes`,
        totalFare: `₹${pricingData.pricing.totalFare / 100}`,
        breakdown: pricingData.pricing.breakdown
      });

      const ride = new Ride(deliveryData);
      await ride.save();

      console.log("✅ Authenticated delivery created successfully:", ride._id);

      // 🚀 BROADCAST TO ALL DRIVERS VIA SOCKET.IO
      const io = req.app.get("io");
      if (io) {
        const rideRequestData = {
          rideId: ride._id,
          rideType: ride.rideType,
          serviceType: "delivery",
          pickup: {
            address: ride.pickup.address,
            coordinates: ride.pickup.coordinates.coordinates,
          },
          destination: {
            address: ride.destination.address,
            coordinates: ride.destination.coordinates.coordinates,
          },
          fare: ride.pricing.finalAmount,
          distance: ride.route.distance,
          duration: ride.route.duration,
          specialRequests: ride.specialRequests,
          customerName: req.user.fullName || "Customer",
          customerPhone: req.user.phone || "",
          customerRating: req.user.rating || "4.5",
          timestamp: new Date(),
        };

        console.log(
          "📡 Broadcasting authenticated delivery request using smart broadcasting:",
          rideRequestData
        );

        // ✅ USE SMART BROADCASTING INSTEAD OF SIMPLE BROADCAST
        const { broadcastRideRequest } = req.app.get('socketUtils');
        if (broadcastRideRequest) {
          await broadcastRideRequest(rideRequestData);
        } else {
          // Fallback to old method if smart broadcasting not available
          console.warn("⚠️ Smart broadcasting not available, using fallback");
          io.to("drivers").emit("new-ride-request", rideRequestData);
        }

        console.log(
          "✅ Authenticated delivery request broadcasted using smart system"
        );
      } else {
        console.warn("⚠️ Socket.IO not available for broadcasting");
      }

      res.status(201).json({
        status: "success",
        message: "Delivery request created successfully",
        data: {
          rideId: ride._id,
          estimatedFare: ride.pricing.finalAmount,
          estimatedFareRs: ride.pricing.finalAmount / 100,
          estimatedTime: ride.route.duration,
          distance: ride.route.distance,
          pricingBreakdown: ride.pricing.breakdown,
          ride: ride,
        },
      });
    } catch (error) {
      console.error("❌ Authenticated delivery creation error:", error);
      res.status(500).json({
        status: "error",
        message: "Failed to create delivery request",
        error: error.message,
      });
    }
  }
);

// Get delivery requests for drivers (pending deliveries)
router.get("/driver/pending", async (req, res) => {
  try {
    console.log("🚚 Fetching pending delivery requests for drivers");

    const pendingDeliveries = await Ride.find({
      serviceType: "delivery",
      status: "pending",
      driver: { $exists: false },
    })
      .populate("user", "fullName phone rating")
      .sort({ createdAt: -1 })
      .limit(20);

    console.log(
      `📦 Found ${pendingDeliveries.length} pending delivery requests`
    );

    res.status(200).json({
      status: "success",
      data: {
        deliveries: pendingDeliveries,
        count: pendingDeliveries.length,
      },
    });
  } catch (error) {
    console.error("❌ Error fetching pending deliveries:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to fetch pending deliveries",
      error: error.message,
    });
  }
});

// Get assigned deliveries for a specific driver
router.get("/driver/:driverId/assigned", async (req, res) => {
  try {
    const { driverId } = req.params;
    console.log(`🚚 Fetching assigned deliveries for driver: ${driverId}`);

    const assignedDeliveries = await Ride.find({
      driver: driverId,
      status: { $in: ["accepted", "arrived", "started"] },
    })
      .populate("user", "fullName phone rating")
      .sort({ createdAt: -1 });

    console.log(
      `📦 Found ${assignedDeliveries.length} assigned deliveries for driver ${driverId}`
    );

    res.status(200).json({
      status: "success",
      data: {
        deliveries: assignedDeliveries,
        count: assignedDeliveries.length,
      },
    });
  } catch (error) {
    console.error("❌ Error fetching assigned deliveries:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to fetch assigned deliveries",
      error: error.message,
    });
  }
});

// Driver accepts a delivery request
router.post("/accept/:rideId", async (req, res) => {
  try {
    const { rideId } = req.params;
    const { driverId, driverName, driverPhone, vehicleInfo } = req.body;

    console.log(
      `🚚 Driver ${driverName} (${driverId}) accepting ride: ${rideId}`
    );

    // Determine the driver ObjectId to attribute this ride to
    let validDriverId = null;
    if (driverId && mongoose.Types.ObjectId.isValid(String(driverId))) {
      validDriverId = new mongoose.Types.ObjectId(String(driverId));
      console.log(`✅ Using provided driverId: ${validDriverId}`);
    } else if (driverPhone) {
      // Fallback: try to find driver by phone
      const foundDriver = await User.findOne({ phone: driverPhone, role: "Driver" }).select("_id");
      if (foundDriver) {
        validDriverId = foundDriver._id;
        console.log(`✅ Resolved driver by phone to: ${validDriverId}`);
      }
    }
    // As last resort, reject if we still don't know the driver
    if (!validDriverId) {
      return res.status(400).json({
        status: "error",
        message: "Valid driverId or resolvable driverPhone is required",
      });
    }

    // Use atomic operation to prevent race conditions
    // Optional: sub-driver attribution from header
    let subDriverToSet = null;
    try {
      const subHeader = req.get('x-subdriver-id');
      if (subHeader && mongoose.Types.ObjectId.isValid(String(subHeader))) {
        subDriverToSet = new mongoose.Types.ObjectId(String(subHeader));
      }
    } catch { }

    const updatedRide = await Ride.findOneAndUpdate(
      {
        _id: rideId,
        $or: [
          { driver: { $exists: false } },
          { driver: null },
          { driver: undefined }
        ]
      },
      {
        $set: {
          driver: validDriverId,
          ...(subDriverToSet ? { subDriver: subDriverToSet } : {}),
          status: "accepted",
          acceptedAt: new Date(),
        },
      },
      {
        new: true, // Return updated document
        runValidators: true,
      }
    );

    // If no document was updated, it means the ride was already accepted
    if (!updatedRide) {
      const existingRide = await Ride.findById(rideId);
      if (!existingRide) {
        return res.status(404).json({
          status: "error",
          message: "Ride not found",
        });
      } else {
        return res.status(400).json({
          status: "error",
          message: "Ride already accepted by another driver",
        });
      }
    }

    const ride = updatedRide;

    // Broadcast to all drivers that this ride is no longer available
    const io = req.app.get("io");
    if (io) {
      console.log(`📡 Broadcasting ride-accepted event for ride ${rideId}`);
      io.to("drivers").emit("ride-accepted", { rideId: rideId });
    }

    // Make driver available if they're not already (fix for "Driver is not available" error)
    if (driverId && driverId !== "unknown_driver") {
      try {
        const driver = await User.findById(driverId);
        if (driver && !driver.driverInfo?.isAvailable) {
          console.log(
            `🔧 Making driver ${driverName} available for future requests`
          );
          await User.findByIdAndUpdate(driverId, {
            "driverInfo.isAvailable": true,
            "driverInfo.lastLocationUpdate": new Date(),
          });
        }
      } catch (driverUpdateError) {
        console.log(
          `⚠️ Could not update driver availability: ${driverUpdateError.message}`
        );
      }
    }

    console.log(`✅ Ride ${rideId} accepted by driver ${driverName}`);

    // Broadcast to customer that driver has been assigned
    console.log("🔍 🚨 CHECKING SOCKET.IO AVAILABILITY 🚨");
    console.log("🔍 req.app exists:", !!req.app);
    console.log("🔍 req.app.get function exists:", typeof req.app.get);

    // const io = req.app.get("io"); // Removed redeclaration to fix error
    console.log("🔍 Socket.IO instance retrieved:", !!io);
    console.log("🔍 Socket.IO type:", typeof io);

    if (io) {
      const assignmentData = {
        rideId: ride._id.toString(), // Ensure string format
        driverId: driverId,
        driverName: driverName,
        driverPhone: driverPhone,
        vehicleInfo: vehicleInfo,
        status: "accepted",
        message: `${driverName} has accepted your delivery request`,
      };

      console.log("📡 🚨 BROADCASTING DRIVER ASSIGNMENT TO CUSTOMER 🚨");
      console.log(
        "📡 Assignment Data:",
        JSON.stringify(assignmentData, null, 2)
      );
      console.log("🔌 Socket.IO instance available:", !!io);
      console.log("🔌 Connected clients count:", io.engine.clientsCount);
      console.log(
        "🔌 All connected sockets:",
        Object.keys(io.sockets.sockets).length
      );

      // List all rooms to see what's available
      console.log(
        "🏠 Available rooms:",
        Array.from(io.sockets.adapter.rooms.keys())
      );

      // Broadcast to specific ride room with multiple attempts
      const rideRoom = `ride_${ride._id}`;
      console.log(`📡 🎯 TARGETING RIDE ROOM: ${rideRoom}`);

      // Check if room exists and has clients
      const roomClients = io.sockets.adapter.rooms.get(rideRoom);
      console.log(
        `🏠 Room ${rideRoom} has ${roomClients ? roomClients.size : 0} clients`
      );

      if (roomClients && roomClients.size > 0) {
        console.log(
          `📡 🎯 EMITTING TO RIDE ROOM: ${rideRoom} with ${roomClients.size} clients`
        );
        console.log(`📡 🎯 Room clients:`, Array.from(roomClients));

        io.to(rideRoom).emit("driver-assigned", assignmentData);
        io.to(rideRoom).emit("driver_assigned", assignmentData);
        io.to(rideRoom).emit("ride-accepted", assignmentData);
        io.to(rideRoom).emit("delivery-accepted", assignmentData);
        console.log(
          `📡 ✅ EMITTED TO RIDE ROOM: ${rideRoom} (${roomClients.size} clients) - 4 EVENT TYPES`
        );
      } else {
        console.log(
          `⚠️ No clients in ride room ${rideRoom}, broadcasting globally`
        );
      }

      // Also broadcast globally as fallback - MULTIPLE EVENT TYPES
      io.emit("driver-assigned", assignmentData);
      io.emit("driver_assigned", assignmentData);
      io.emit("ride-accepted", assignmentData);
      io.emit("delivery-accepted", assignmentData);
      console.log(
        "📡 ✅ EMITTED GLOBALLY TO ALL CONNECTED CLIENTS (4 EVENT TYPES)"
      );

      // Broadcast to customers room as additional fallback - MULTIPLE EVENT TYPES
      io.to("customers").emit("driver-assigned", assignmentData);
      io.to("customers").emit("driver_assigned", assignmentData);
      io.to("customers").emit("ride-accepted", assignmentData);
      io.to("customers").emit("delivery-accepted", assignmentData);
      console.log("📡 ✅ EMITTED TO CUSTOMERS ROOM (4 EVENT TYPES)");

      // Also broadcast to all drivers that this ride is no longer available
      io.to("drivers").emit("ride-taken", {
        rideId: ride._id,
        takenBy: driverName,
      });
      console.log("📡 ✅ EMITTED RIDE-TAKEN TO DRIVERS ROOM");

      console.log(`🎉 ✅ ALL SOCKET BROADCASTS COMPLETED FOR RIDE ${ride._id}`);
      console.log("📡 🚨 END BROADCASTING 🚨");
    } else {
      console.error(
        "❌ Socket.IO instance not available - events not broadcasted"
      );
    }

    res.status(200).json({
      status: "success",
      message: "Ride accepted successfully",
      data: {
        rideId: ride._id,
        driverId: driverId,
        status: "accepted",
      },
    });
  } catch (error) {
    console.error("❌ Error accepting ride:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to accept ride",
      error: error.message,
    });
  }
});

// Driver declines a delivery request
router.post("/decline/:rideId", async (req, res) => {
  try {
    const { rideId } = req.params;
    const { driverId, driverName } = req.body;

    console.log(
      `🚚 Driver ${driverName} (${driverId}) declining ride: ${rideId}`
    );

    // Find the ride to verify it exists and is still pending
    const ride = await Ride.findById(rideId);
    if (!ride) {
      return res.status(404).json({
        status: "error",
        message: "Ride not found",
      });
    }

    // Check if ride is still available (not already accepted by another driver)
    if (ride.driver) {
      return res.status(400).json({
        status: "error",
        message: "Ride already accepted by another driver",
      });
    }

    // Skip declined drivers list - just log and continue
    console.log(
      `✅ Driver ${driverName} declined ride ${rideId} - continuing without storing`
    );

    // Broadcast to other drivers that this ride is still available
    const io = req.app.get("io");
    if (io) {
      const rideRequestData = {
        rideId: ride._id,
        rideType: ride.rideType,
        serviceType: "delivery",
        pickup: {
          address: ride.pickup.address,
          coordinates: ride.pickup.coordinates.coordinates,
        },
        destination: {
          address: ride.destination.address,
          coordinates: ride.destination.coordinates.coordinates,
        },
        fare: ride.pricing.finalAmount,
        distance: ride.route.distance,
        duration: ride.route.duration,
        specialRequests: ride.specialRequests,
        customerName: "Customer",
        customerPhone: "",
        customerRating: "4.5",
        timestamp: new Date(),
        excludeDrivers: ride.declinedDrivers, // Exclude drivers who already declined
      };

      console.log(
        `📡 Re-broadcasting ride ${rideId} to other drivers (excluding ${ride.declinedDrivers.length} declined drivers)`
      );
      io.to("drivers").emit("ride-declined-rebroadcast", rideRequestData);

      // Also notify the declining driver that request is cancelled for them
      io.to(`driver_${driverId}`).emit("ride-cancelled-for-driver", {
        rideId: ride._id,
        message: "Request declined successfully. Redirecting to dashboard...",
      });
    }

    res.status(200).json({
      status: "success",
      message: "Ride declined successfully",
      data: {
        rideId: ride._id,
        declinedBy: driverName,
        availableForOthers: true,
      },
    });
  } catch (error) {
    console.error("❌ Error declining ride:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to decline ride",
      error: error.message,
    });
  }
});

// Get ride status for polling
router.get("/status/:rideId", async (req, res) => {
  try {
    const { rideId } = req.params;

    console.log(`🔍 Checking status for ride: ${rideId}`);

    const ride = await Ride.findById(rideId);

    if (!ride) {
      return res.status(404).json({
        status: "error",
        message: "Ride not found",
      });
    }

    console.log(
      `📊 Ride status: ${ride.status}, Driver: ${ride.driver ? "Assigned" : "Not assigned"
      }`
    );

    res.status(200).json({
      status: "success",
      data: {
        rideId: ride._id,
        status: ride.status,
        driver: ride.driver,
        driverInfo: ride.driverInfo,
        acceptedAt: ride.acceptedAt,
        createdAt: ride.createdAt,
      },
    });
  } catch (error) {
    console.error("Get ride status error:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to get ride status",
    });
  }
});

// Debug endpoint to check driver status
router.get("/debug/driver-status/:phone", async (req, res) => {
  try {
    const { phone } = req.params;

    const driver = await User.findOne({ phone: phone });

    if (!driver) {
      return res.status(404).json({
        status: "error",
        message: "Driver not found",
      });
    }

    res.status(200).json({
      status: "success",
      data: {
        driverId: driver._id,
        name: driver.fullName,
        phone: driver.phone,
        role: driver.role,
        isAvailable: driver.driverInfo?.isAvailable || false,
        vehicleType: driver.driverInfo?.vehicleType || null,
        vehicleNumber: driver.driverInfo?.vehicleNumber || null,
        hasDriverInfo: !!driver.driverInfo,
        lastLocationUpdate: driver.driverInfo?.lastLocationUpdate || null,
      },
    });
  } catch (error) {
    console.error("Debug driver status error:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to get driver status",
    });
  }
});

// Debug endpoint to make driver available by phone number
router.post("/debug/make-driver-available", async (req, res) => {
  try {
    const { phone, email } = req.body;

    console.log(
      `🔧 Debug: Making driver available by phone: ${phone} or email: ${email}`
    );

    let query = {};
    if (phone) {
      query.phone = phone;
    } else if (email) {
      query.email = email;
    } else {
      return res.status(400).json({
        status: "error",
        message: "Phone or email required",
      });
    }

    const driver = await User.findOne(query);

    if (!driver) {
      return res.status(404).json({
        status: "error",
        message: "Driver not found",
      });
    }

    if (driver.role !== "Driver") {
      return res.status(400).json({
        status: "error",
        message: "User is not a driver",
      });
    }

    // Make driver available
    await User.findByIdAndUpdate(driver._id, {
      "driverInfo.isAvailable": true,
      "driverInfo.lastLocationUpdate": new Date(),
      "driverInfo.vehicleType": driver.driverInfo?.vehicleType || "Bike",
    });

    console.log(`✅ Driver ${driver.fullName} (${driver._id}) made available`);

    res.status(200).json({
      status: "success",
      message: `Driver ${driver.fullName} made available`,
      data: {
        driverId: driver._id,
        driverName: driver.fullName,
        phone: driver.phone,
        isAvailable: true,
      },
    });
  } catch (error) {
    console.error("Debug make driver available error:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to make driver available",
    });
  }
});

// Debug endpoint to manually trigger driver assignment event
router.post("/debug/trigger-assignment/:rideId", async (req, res) => {
  try {
    const { rideId } = req.params;
    const { driverName = "Test Driver", driverPhone = "9999999999" } = req.body;

    console.log(
      `🧪 DEBUG: Manually triggering driver assignment for ride: ${rideId}`
    );

    const io = req.app.get("io");
    if (!io) {
      return res.status(500).json({
        status: "error",
        message: "Socket.IO not available",
      });
    }

    const assignmentData = {
      rideId: rideId.toString(),
      driverId: "debug_driver_123",
      driverName: driverName,
      driverPhone: driverPhone,
      vehicleInfo: { type: "Bike", number: "TEST123", model: "Test Model" },
      status: "accepted",
      message: `${driverName} has accepted your delivery request (DEBUG)`,
    };

    console.log("🧪 DEBUG: Broadcasting assignment data:", assignmentData);
    console.log(
      "🧪 DEBUG: Available rooms:",
      Array.from(io.sockets.adapter.rooms.keys())
    );

    // Broadcast to specific ride room - MULTIPLE EVENT TYPES
    io.to(`ride_${rideId}`).emit("driver-assigned", assignmentData);
    io.to(`ride_${rideId}`).emit("driver_assigned", assignmentData);
    io.to(`ride_${rideId}`).emit("ride-accepted", assignmentData);
    io.to(`ride_${rideId}`).emit("delivery-accepted", assignmentData);
    console.log(
      `🧪 DEBUG: Emitted to ride room: ride_${rideId} (4 event types)`
    );

    // Also broadcast globally - MULTIPLE EVENT TYPES
    io.emit("driver-assigned", assignmentData);
    io.emit("driver_assigned", assignmentData);
    io.emit("ride-accepted", assignmentData);
    io.emit("delivery-accepted", assignmentData);
    console.log("🧪 DEBUG: Emitted globally (4 event types)");

    res.status(200).json({
      status: "success",
      message: "Debug driver assignment triggered",
      data: assignmentData,
    });
  } catch (error) {
    console.error("🧪 DEBUG: Error triggering assignment:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to trigger assignment",
      error: error.message,
    });
  }
});

// Store OTP for ride verification
router.post("/store-otp", async (req, res) => {
  try {
    const { rideId, verificationOtp } = req.body;

    console.log("🔐 Storing OTP for ride:", { rideId, verificationOtp });
    console.log("🔐 OTP Type during storage:", typeof verificationOtp);
    console.log("🔐 OTP Value during storage:", verificationOtp);

    if (!rideId || !verificationOtp) {
      return res.status(400).json({
        success: false,
        message: "RideId and verificationOtp are required",
      });
    }

    // Find and update the ride with OTP
    const ride = await Ride.findById(rideId);

    if (!ride) {
      return res.status(404).json({
        success: false,
        message: "Ride not found",
      });
    }

    // Store the OTP (ensure consistent type)
    ride.verificationOtp = String(verificationOtp);
    ride.otpGeneratedAt = new Date();
    await ride.save();

    console.log("✅ OTP stored successfully for ride:", rideId);
    console.log("✅ Stored OTP value:", ride.verificationOtp);
    console.log("✅ Stored OTP type:", typeof ride.verificationOtp);

    // 🚀 SOCKET.IO: Broadcast OTP to driver
    try {
      const io = req.app.get("io");
      if (io) {
        console.log("📡 Broadcasting OTP to driver via Socket.IO");

        // Broadcast to ride room and drivers room
        io.to(`ride_${rideId}`).emit("customer_otp_generated", {
          rideId: rideId,
          otp: ride.verificationOtp,
          message: `Customer generated OTP: ${ride.verificationOtp}`,
          timestamp: new Date().toISOString(),
        });

        io.to("drivers").emit("customer_otp_generated", {
          rideId: rideId,
          otp: ride.verificationOtp,
          message: `Customer generated OTP: ${ride.verificationOtp}`,
          timestamp: new Date().toISOString(),
        });

        console.log(
          `✅ OTP ${ride.verificationOtp} broadcasted to drivers for ride ${rideId}`
        );
      }
    } catch (socketError) {
      console.log("⚠️ Socket OTP broadcast failed:", socketError.message);
    }

    return res.json({
      success: true,
      message: "OTP stored successfully",
      rideId: rideId,
      storedOtp: ride.verificationOtp, // For debugging
    });
  } catch (error) {
    console.error("❌ Error storing OTP:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while storing OTP",
    });
  }
});

// OTP verification endpoint for driver pickup
router.post("/verify-otp", async (req, res) => {
  try {
    const { rideId, enteredOtp } = req.body;

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(rideId)) {
      console.log("❌ Invalid rideId format:", rideId);
      return res.status(400).json({
        status: "error",
        message: "Invalid ride ID format",
      });
    }

    console.log("🔐 OTP verification request:", { rideId, enteredOtp });

    if (!rideId || !enteredOtp) {
      return res.status(400).json({
        success: false,
        message: "RideId and OTP are required",
      });
    }

    // Find the ride
    const ride = await Ride.findById(rideId);

    if (!ride) {
      return res.status(404).json({
        success: false,
        message: "Ride not found",
      });
    }

    // Enhanced debugging for OTP comparison
    console.log("🔍 OTP Comparison Debug:");
    console.log(
      "🔍 Stored OTP:",
      ride.verificationOtp,
      "Type:",
      typeof ride.verificationOtp
    );
    console.log("🔍 Entered OTP:", enteredOtp, "Type:", typeof enteredOtp);
    console.log(
      "🔍 Strict equality (===):",
      ride.verificationOtp === enteredOtp
    );
    console.log("🔍 Loose equality (==):", ride.verificationOtp == enteredOtp);
    console.log(
      "🔍 String comparison:",
      String(ride.verificationOtp) === String(enteredOtp)
    );

    // Check if the entered OTP matches the stored OTP for this ride
    // Try multiple comparison methods to handle type mismatches
    const storedOtp = String(ride.verificationOtp || "").trim();
    const inputOtp = String(enteredOtp || "").trim();

    console.log("🔍 Trimmed stored OTP:", storedOtp);
    console.log("🔍 Trimmed entered OTP:", inputOtp);
    console.log("🔍 Trimmed comparison:", storedOtp === inputOtp);

    if (
      ride.verificationOtp &&
      (ride.verificationOtp === enteredOtp ||
        ride.verificationOtp == enteredOtp ||
        storedOtp === inputOtp)
    ) {
      console.log("✅ OTP verified successfully for ride:", rideId);

      // Update ride status to indicate OTP verification
      ride.otpVerified = true;
      ride.otpVerifiedAt = new Date();
      await ride.save();

      // Broadcast OTP verification success to customer
      const io = req.app.get("io");
      if (io) {
        const otpPayload = {
          rideId: rideId,
          message: "OTP verified successfully by driver",
          timestamp: new Date(),
          deliveryStatus: "completed",
        };
        // Notify ride room (customer + any listeners)
        io.to(`ride_${rideId}`).emit("otp-verified-success", otpPayload);
        // Also notify drivers room to refresh dashboards
        io.to('drivers').emit('otp-verified-success', otpPayload);
        // Try targeted notify to assigned driver if present
        try {
          if (ride.driver) {
            const driverId = ride.driver._id || ride.driver;
            io.to(`user_${driverId}`).emit('otp-verified-success', otpPayload);
            io.to(`driver_${driverId}`).emit('otp-verified-success', otpPayload);
            io.to(`user_${driverId}`).emit('dashboard-refresh', { source: 'otp-verified', rideId });
          }
        } catch (tErr) {
          console.log('⚠️ Driver targeted OTP emit failed:', tErr.message);
        }
        console.log(
          "📡 Broadcasted OTP verification success to customer for ride:",
          rideId
        );
      }

      return res.json({
        success: true,
        message: "OTP verified successfully",
        rideId: rideId,
      });
    } else {
      console.log("❌ Invalid OTP for ride:", rideId);
      console.log("❌ All comparison methods failed");
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }
  } catch (error) {
    console.error("❌ OTP verification error:", error);

    if (error.name === "CastError" && error.kind === "ObjectId") {
      return res.status(400).json({
        status: "error",
        message: "Invalid ride ID format",
      });
    }

    return res.status(500).json({
      status: "error",
      message: "Server error during OTP verification",
      error: error.message,
    });
  }
});

// Complete delivery after OTP verification
router.post("/complete-delivery", async (req, res) => {
  try {
    const { rideId } = req.body;

    console.log("🏁 Completing delivery for ride:", rideId);
    console.log("🏁 Request body:", req.body);

    const ride = await Ride.findById(rideId)
      .populate("user", "fullName phone email")
      .populate(
        "driver",
        "fullName phone driverInfo.vehicleType driverInfo.vehicleNumber driverInfo.rating"
      );

    if (!ride) {
      console.log("❌ Ride not found:", rideId);
      return res.status(404).json({
        status: "error",
        message: "Ride not found",
      });
    }

    console.log("✅ Found ride:", {
      id: ride._id,
      status: ride.status,
      otpVerified: ride.otpVerified,
    });

    // Check if OTP was verified
    if (!ride.otpVerified) {
      return res.status(400).json({
        status: "error",
        message: "OTP must be verified before completing delivery",
      });
    }

    // Update ride status to completed
    ride.status = "completed";
    ride.completedAt = new Date();
    ride.actualDropTime = new Date();

    // Ensure pricing is set for history
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

    console.log("✅ Delivery completed successfully:", {
      rideId: ride._id,
      customer: ride.user?.fullName,
      driver: ride.driver?.fullName,
      amount: ride.pricing?.finalAmount,
      status: ride.status,
    });

    // Broadcast completion to both customer and driver
    const io = req.app.get("io");
    if (io) {
      const completionData = {
        rideId: rideId,
        message: "Delivery completed successfully",
        timestamp: new Date(),
        status: "completed",
        amount: ride.pricing?.finalAmount,
        earnings: {
          today: ride.pricing?.finalAmount || 0,
          rideId: rideId
        }
      };

      // Emit to ride room (customer and driver in that ride)
      io.to(`ride_${rideId}`).emit("delivery-completed", completionData);

      // Target only the ordering customer's user/email rooms
      try {
        const customerId = ride.user?._id || ride.user;
        const customerEmail = (ride.user?.email || '').toLowerCase().trim();
        if (customerId) {
          io.to(`user_${customerId}`).emit('delivery-completed', completionData);
        }
        if (customerEmail) {
          io.to(`email_${customerEmail}`).emit('delivery-completed', completionData);
        }
      } catch (custErr) {
        console.log('⚠️ Customer targeted completion emit failed:', custErr.message);
      }

      // ✅ ENHANCED DRIVER-SPECIFIC UPDATES
      if (ride.driver) {
        const driverId = ride.driver._id || ride.driver;
        console.log(`📡 Sending targeted updates to driver: ${driverId}`);

        // Send to multiple driver-specific rooms
        io.to(`user_${driverId}`).emit("delivery-completed", completionData);
        io.to(`user_${driverId}`).emit("earnings-updated", completionData);
        io.to(`user_${driverId}`).emit("driver-earnings-updated", completionData);
        io.to(`user_${driverId}`).emit("dashboard-refresh", completionData);
        io.to(`driver_${driverId}`).emit("delivery-completed", completionData);

        console.log(`📡 Sent completion update to driver: ${driverId}`);

        // ✅ ALSO TRY PHONE-BASED TARGETING
        try {
          const User = require('../models/User');
          const driverUser = await User.findById(driverId).select('phone');
          if (driverUser?.phone) {
            io.to(`phone_${driverUser.phone}`).emit("delivery-completed", completionData);
            io.to(`phone_${driverUser.phone}`).emit("driver-earnings-updated", completionData);
            console.log(`📡 Also sent to phone-based room: phone_${driverUser.phone}`);
          }
        } catch (phoneError) {
          console.log('⚠️ Phone-based targeting failed:', phoneError.message);
        }
      }

      // Also emit to all drivers room for general updates
      io.to('drivers').emit("ride-completed", completionData);
      io.to('drivers').emit("delivery-completed", completionData);

      console.log("📡 Broadcasted delivery completion to all relevant parties");
    }

    console.log("🎉 Sending success response for ride:", rideId);
    res.status(200).json({
      status: "success",
      message: "Delivery completed successfully",
      data: {
        rideId: ride._id,
        status: ride.status,
        completedAt: ride.completedAt,
        amount: ride.pricing?.finalAmount,
      },
    });
  } catch (error) {
    console.error("Complete delivery error:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to complete delivery",
      error: error.message,
    });
  }
});

// Debug endpoint to check database rides
router.get("/debug/check-database", async (req, res) => {
  try {
    console.log("🔍 Checking database for rides...");

    // Get total rides count
    const totalRides = await Ride.countDocuments({});

    // Get completed rides count
    const completedRides = await Ride.countDocuments({ status: "completed" });

    // Get recent rides
    const recentRides = await Ride.find({})
      .sort({ createdAt: -1 })
      .limit(10)
      .populate("user", "fullName phone")
      .populate("driver", "fullName phone");

    // Get OTP verified rides
    const otpVerifiedRides = await Ride.find({ otpVerified: true })
      .sort({ createdAt: -1 })
      .limit(5);

    console.log("📊 Database Stats:");
    console.log("   Total rides:", totalRides);
    console.log("   Completed rides:", completedRides);
    console.log("   OTP verified rides:", otpVerifiedRides.length);

    const response = {
      status: "success",
      data: {
        totalRides,
        completedRides,
        otpVerifiedCount: otpVerifiedRides.length,
        recentRides: recentRides.map((ride) => ({
          id: ride._id,
          status: ride.status,
          otpVerified: ride.otpVerified || false,
          completedAt: ride.completedAt,
          createdAt: ride.createdAt,
          pricing: ride.pricing?.finalAmount,
          user: ride.user?.fullName,
          driver: ride.driver?.fullName,
          specialRequests: ride.specialRequests,
        })),
        otpVerifiedRides: otpVerifiedRides.map((ride) => ({
          id: ride._id,
          status: ride.status,
          completedAt: ride.completedAt,
          otpVerifiedAt: ride.otpVerifiedAt,
        })),
      },
    };

    res.status(200).json(response);
  } catch (error) {
    console.error("❌ Database check error:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to check database",
      error: error.message,
    });
  }
});

// Debug endpoint to check ride OTP status
router.get("/debug/check-ride-otp/:rideId", async (req, res) => {
  try {
    const { rideId } = req.params;

    console.log("🔍 Checking OTP status for ride:", rideId);

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(rideId)) {
      console.log("❌ Invalid rideId format:", rideId);
      return res.status(400).json({
        status: "error",
        message: "Invalid ride ID format",
      });
    }

    const ride = await Ride.findById(rideId);

    if (!ride) {
      return res.status(404).json({
        status: "error",
        message: "Ride not found",
      });
    }

    res.status(200).json({
      status: "success",
      data: {
        rideId: ride._id,
        hasOtp: !!ride.verificationOtp,
        storedOtp: ride.verificationOtp,
        otpType: typeof ride.verificationOtp,
        otpGenerated: ride.otpGeneratedAt,
        otpVerified: ride.otpVerified,
        otpVerifiedAt: ride.otpVerifiedAt,
        rideStatus: ride.status,
      },
    });
  } catch (error) {
    console.error("Debug check ride OTP error:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to check ride OTP",
      error: error.message,
    });
  }
});

// Get real-time driver dashboard data
router.get("/driver/dashboard/:phone", async (req, res) => {
  try {
    const { phone } = req.params;
    console.log(`📊 Fetching dashboard data for driver phone: ${phone}`);

    // Find driver by phone
    const driver = await User.findOne({ phone: phone, role: { $in: ['Driver', 'SubDriver'] } });
    if (!driver) {
      return res.status(404).json({
        status: "error",
        message: "Driver not found"
      });
    }

    // Get driver's completed rides
    const completedRides = await Ride.find({
      driver: driver._id,
      status: "completed"
    }).sort({ completedAt: -1 }).limit(50);

    // Calculate earnings
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);

    const todayRides = completedRides.filter(ride =>
      ride.completedAt >= today && ride.completedAt <= todayEnd
    );

    const todayEarnings = todayRides.reduce((sum, ride) =>
      sum + (ride.pricing?.finalAmount || 0), 0
    );

    const totalEarnings = completedRides.reduce((sum, ride) =>
      sum + (ride.pricing?.finalAmount || 0), 0
    );

    // Get this week's earnings
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const weekRides = completedRides.filter(ride =>
      ride.completedAt >= weekStart
    );

    const weeklyEarnings = weekRides.reduce((sum, ride) =>
      sum + (ride.pricing?.finalAmount || 0), 0
    );

    const dashboardData = {
      driver: {
        id: driver._id,
        name: driver.fullName,
        phone: driver.phone,
        rating: driver.driverInfo?.rating || 4.5,
        isAvailable: driver.driverInfo?.isAvailable || false,
        vehicleType: driver.driverInfo?.vehicleType || 'Bike'
      },
      earnings: {
        today: todayEarnings,
        weekly: weeklyEarnings,
        total: totalEarnings
      },
      rides: {
        today: todayRides.length,
        total: completedRides.length,
        recent: completedRides.slice(0, 10).map(ride => ({
          id: ride._id,
          status: ride.status,
          amount: ride.pricing?.finalAmount || 0,
          completedAt: ride.completedAt,
          pickup: ride.pickup?.address,
          destination: ride.destination?.address
        }))
      },
      summary: {
        todayEarnings,
        totalEarnings,
        totalRides: completedRides.length,
        todayRides: todayRides.length,
        weeklyEarnings
      }
    };

    console.log(`✅ Dashboard data compiled for ${driver.fullName}:`, {
      todayEarnings,
      totalEarnings,
      totalRides: completedRides.length
    });

    res.status(200).json({
      status: "success",
      data: dashboardData
    });
  } catch (error) {
    console.error("❌ Driver dashboard error:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to fetch driver dashboard data",
      error: error.message
    });
  }
});

// Debug endpoint to check current user from token
router.get("/debug/check-token", async (req, res) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      return res.status(400).json({
        status: "error",
        message: "No token provided",
      });
    }

    console.log("🔍 Checking token:", token.substring(0, 20) + "...");

    // Verify token
    const jwt = require("jsonwebtoken");
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "your-secret-key"
    );
    console.log("🔑 Token decoded:", decoded);

    // Find user
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(404).json({
        status: "error",
        message: "User not found",
      });
    }

    res.status(200).json({
      status: "success",
      data: {
        userId: user._id,
        name: user.fullName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        hasDriverInfo: !!user.driverInfo,
        isAvailable: user.driverInfo?.isAvailable || false,
        vehicleType: user.driverInfo?.vehicleType || null,
      },
    });
  } catch (error) {
    console.error("Debug check token error:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to check token",
      error: error.message,
    });
  }
});

// Debug endpoint to create test earnings data
router.post("/debug/create-test-earnings", async (req, res) => {
  try {
    const { driverPhone, amount = 150 } = req.body;

    if (!driverPhone) {
      return res.status(400).json({
        status: "error",
        message: "Driver phone is required",
      });
    }

    console.log(`🧪 Creating test earnings for driver: ${driverPhone}`);

    // Find driver by phone
    const driver = await User.findOne({ phone: driverPhone, role: { $in: ['Driver', 'SubDriver'] } });
    if (!driver) {
      return res.status(404).json({
        status: "error",
        message: "Driver not found"
      });
    }

    // Create test completed ride
    const testRide = new Ride({
      user: new mongoose.Types.ObjectId("507f1f77bcf86cd799439011"), // Dummy user
      driver: driver._id,
      rideType: "bike",
      serviceType: "delivery",
      pickup: {
        address: "Test Pickup Location",
        coordinates: {
          type: "Point",
          coordinates: [72.5714, 23.0225]
        }
      },
      destination: {
        address: "Test Destination",
        coordinates: {
          type: "Point",
          coordinates: [72.5814, 23.0325]
        }
      },
      route: {
        distance: 5.5,
        duration: 15
      },
      pricing: {
        baseFare: 25,
        distanceFare: 55,
        timeFare: 18,
        totalFare: amount,
        finalAmount: amount
      },
      status: "completed",
      completedAt: new Date(),
      otpVerified: true,
      otpVerifiedAt: new Date()
    });

    await testRide.save();

    console.log(`✅ Test ride created for ${driver.fullName} with earnings: ₹${amount}`);

    res.status(200).json({
      status: "success",
      message: "Test earnings created successfully",
      data: {
        rideId: testRide._id,
        driverName: driver.fullName,
        amount: amount,
        status: "completed"
      }
    });
  } catch (error) {
    console.error("❌ Create test earnings error:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to create test earnings",
      error: error.message
    });
  }
});

// ✅ DEDICATED DRIVER DASHBOARD ENDPOINT (for Driver2 app)
router.get("/driver/dashboard/:phone", async (req, res) => {
  try {
    const { phone } = req.params;
    console.log(`📊 Fetching delivery dashboard for driver phone: ${phone}`);

    // Find driver by phone
    const driver = await User.findOne({ phone, role: "Driver" })
      .select('fullName phone email driverInfo isVerified isOnline createdAt')
      .lean();

    if (!driver) {
      return res.status(404).json({
        status: 'error',
        message: 'Driver not found'
      });
    }

    const driverId = driver._id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get today's completed rides
    const todayRides = await Ride.find({
      driver: driverId,
      createdAt: { $gte: today, $lt: tomorrow },
      status: "completed"
    });

    // Calculate today's earnings
    const todayEarnings = todayRides.reduce((sum, ride) => sum + (ride.pricing?.finalAmount || 0), 0);

    // Get total earnings
    const totalEarningsResult = await Ride.aggregate([
      { $match: { driver: driverId, status: "completed" } },
      { $group: { _id: null, total: { $sum: "$pricing.finalAmount" } } }
    ]);

    // Get total rides count
    const totalRides = await Ride.countDocuments({ driver: driverId, status: "completed" });

    // Get weekly earnings
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const weeklyEarnings = await Ride.aggregate([
      {
        $match: {
          driver: driverId,
          createdAt: { $gte: weekStart },
          status: "completed"
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          earnings: { $sum: "$pricing.finalAmount" },
          rides: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Get recent rides
    const recentRides = await Ride.find({ driver: driverId })
      .populate("user", "fullName phone")
      .sort({ createdAt: -1 })
      .limit(5);

    // Calculate rating
    const ratingResult = await Ride.aggregate([
      {
        $match: {
          driver: driverId,
          status: "completed",
          "rating.userRating.rating": { $exists: true }
        }
      },
      {
        $group: {
          _id: null,
          averageRating: { $avg: "$rating.userRating.rating" },
          totalRatings: { $sum: 1 }
        }
      }
    ]);

    // Format response for Driver2 app
    const dashboardData = {
      status: "success",
      message: "Delivery dashboard data from backend",
      data: {
        // Driver profile
        driverInfo: {
          id: driver._id,
          fullName: driver.fullName,
          phone: driver.phone,
          email: driver.email,
          isVerified: driver.isVerified,
          isOnline: driver.isOnline,
          vehicleType: driver.driverInfo?.vehicleType || "Bike",
          vehicleNumber: driver.driverInfo?.vehicleNumber || "",
          rating: ratingResult[0]?.averageRating || 4.5,
          isAvailable: driver.driverInfo?.isAvailable || false
        },

        // Earnings data (what Driver2 expects)
        earnings: {
          today: todayEarnings,
          todayRs: todayEarnings / 100,
          total: totalEarningsResult[0]?.total || 0,
          totalRs: (totalEarningsResult[0]?.total || 0) / 100,
          weekly: weeklyEarnings.reduce((sum, day) => sum + day.earnings, 0),
          weeklyRs: weeklyEarnings.reduce((sum, day) => sum + day.earnings, 0) / 100,
          dailyEarnings: weeklyEarnings.map(day => ({
            date: day._id,
            earnings: day.earnings,
            earningsRs: day.earnings / 100,
            rides: day.rides
          }))
        },

        // Today's summary
        todaysSummary: {
          earnings: todayEarnings,
          earningsRs: todayEarnings / 100,
          rides: todayRides.length,
          rating: ratingResult[0]?.averageRating || 4.5,
          status: driver.driverInfo?.isAvailable ? 'Available' : 'Offline'
        },

        // Time metrics
        timeMetrics: {
          totalHours: totalRides * 0.5,
          todayHours: todayRides.length * 0.5,
          avgRideTime: 30
        },

        // Expected payout
        expectedPayout: todayEarnings,

        // Recent rides
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
          serviceType: ride.serviceType || 'delivery'
        })),

        // Stats
        stats: {
          todayRides: todayRides.length,
          totalRides,
          todayEarnings,
          totalEarnings: totalEarningsResult[0]?.total || 0,
          rating: ratingResult[0]?.averageRating || 4.5
        },

        // Source
        dataSource: "backend_delivery_endpoint",
        lastUpdated: new Date().toISOString()
      }
    };

    console.log(`✅ Delivery dashboard data sent for ${driver.fullName}`);
    console.log(`💰 Today: ₹${todayEarnings/100}, Total: ₹${(totalEarningsResult[0]?.total || 0)/100}`);

    res.status(200).json(dashboardData);

  } catch (error) {
    console.error("❌ Delivery dashboard error:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to get delivery dashboard data",
      error: error.message
    });
  }
});

module.exports = router;
