const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Initialize Socket.IO handlers
const initializeSocket = (io) => {
  // Authentication middleware for Socket.IO
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];

      // Allow customer connections without token for basic features
      if (!token) {
        const userType = socket.handshake.auth.userType || socket.handshake.query.userType;
        if (userType === 'customer') {
          socket.userId = 'customer_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
          socket.user = { fullName: 'Customer', role: 'Customer' };
          console.log('🔐 Customer socket authenticated with ID:', socket.userId);
          return next();
        }
        return next(new Error('Authentication error: No token provided'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId).select('-wallet.transactions');

      if (!user || !user.isActive) {
        return next(new Error('Authentication error: Invalid user'));
      }

      socket.userId = user._id.toString();
      socket.user = user;
      next();
    } catch (error) {
      // Allow customer connections to fall through
      const userType = socket.handshake.auth.userType || socket.handshake.query.userType;
      if (userType === 'customer') {
        socket.userId = 'customer_' + Date.now();
        socket.user = { fullName: 'Customer', role: 'Customer' };
        return next();
      }
      next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', async (socket) => {
    console.log(`User ${socket.user.fullName} connected with socket ID: ${socket.id}`);

    // Update user's online status
    if (socket.user.role !== 'Customer') {
      await User.findByIdAndUpdate(socket.userId, {
        isOnline: true,
        lastSeen: new Date()
      });
    }

    // Join user to their personal room
    socket.join(`user_${socket.userId}`);

    // Join email-based room for precise customer targeting
    try {
      const email = (socket.user.email || '').toLowerCase().trim();
      if (email) {
        socket.join(`email_${email}`);
        console.log(`📧 ${socket.user.fullName} joined email room email_${email}`);
      }
    } catch (e) {
      console.log('⚠️ Could not join email room:', e?.message || e);
    }

    // ✅ JOIN SEPARATE ROOMS FOR MAIN DRIVERS AND SUB-DRIVERS
    if (socket.user.role === 'Driver') {
      socket.join('drivers');
      socket.join('main-drivers');
      console.log(`Main Driver ${socket.user.fullName} joined drivers and main-drivers rooms`);

      // Set driver as online (but not necessarily available for rides)
      await User.findByIdAndUpdate(socket.userId, {
        isOnline: true,
        lastSeen: new Date()
      });
    } else if (socket.user.role === 'SubDriver') {
      socket.join('drivers');
      socket.join('sub-drivers');
      console.log(`Sub-Driver ${socket.user.fullName} joined drivers and sub-drivers rooms`);

      // Set sub-driver as online (but not necessarily available for rides)
      await User.findByIdAndUpdate(socket.userId, {
        isOnline: true,
        lastSeen: new Date()
      });
    }

    // Join customer to customer room for delivery notifications
    if (socket.user.role === 'Customer' || socket.userId.startsWith('customer_')) {
      socket.join('customers');
      socket.join(`customer_${socket.userId}`);
      console.log(`Customer ${socket.user.fullName} joined customer rooms`);
    }

    // Handle ride request acceptance
    socket.on('accept-ride', async (data) => {
      try {
        const { rideId } = data;

        // Emit to all drivers that this ride is no longer available
        socket.to('drivers').emit('ride-accepted', { rideId });

        console.log(`Driver ${socket.user.fullName} accepted ride ${rideId}`);
      } catch (error) {
        console.error('Accept ride socket error:', error);
        socket.emit('error', { message: 'Failed to accept ride' });
      }
    });

    // Handle driver location updates
    socket.on('update-location', async (data) => {
      try {
        const { longitude, latitude, rideId } = data;

        if (socket.user.role !== 'Driver' && socket.user.role !== 'SubDriver') {
          return socket.emit('error', { message: 'Only drivers and sub-drivers can update location' });
        }

        // Update driver location in database
        await User.findByIdAndUpdate(socket.userId, {
          'driverInfo.currentLocation.coordinates': [longitude, latitude]
        });

        // If this is during an active ride, emit to the user
        if (rideId) {
          socket.to(`ride_${rideId}`).emit('driver-location-update', {
            driverId: socket.userId,
            location: { longitude, latitude },
            timestamp: new Date()
          });
        }

        // Emit to all users looking for nearby drivers
        socket.broadcast.emit('driver-location-update', {
          driverId: socket.userId,
          location: { longitude, latitude },
          timestamp: new Date()
        });

      } catch (error) {
        console.error('Update location socket error:', error);
        socket.emit('error', { message: 'Failed to update location' });
      }
    });

    // Handle ride status updates
    socket.on('ride-status-update', async (data) => {
      try {
        const { rideId, status } = data;

        // Emit to the user of this ride
        socket.to(`user_${data.userId}`).emit('ride-status-update', {
          rideId,
          status,
          timestamp: new Date()
        });

        console.log(`Ride ${rideId} status updated to ${status}`);
      } catch (error) {
        console.error('Ride status update socket error:', error);
        socket.emit('error', { message: 'Failed to update ride status' });
      }
    });

    // Handle joining ride room
    socket.on('join-ride', (data) => {
      const { rideId } = data;
      socket.join(`ride_${rideId}`);
      console.log(`User ${socket.user.fullName} joined ride room ${rideId}`);
    });

    // Allow clients to explicitly join an email-based room for targeted notifications
    socket.on('join_email_room', (data) => {
      try {
        const raw = (data?.email || '').toLowerCase().trim();
        if (!raw) {
          return socket.emit('error', { message: 'Email required to join email room' });
        }
        socket.join(`email_${raw}`);
        console.log(`📧 ${socket.user.fullName} joined email room email_${raw} via explicit request`);
        socket.emit('joined-email-room', { success: true, room: `email_${raw}` });
      } catch (e) {
        console.error('❌ join_email_room error:', e);
        socket.emit('joined-email-room', { success: false, message: 'Failed to join email room' });
      }
    });

    // Handle joining ride room (alternative event name)
    socket.on('join_ride_room', (data) => {
      const { rideId, userType } = data;
      socket.join(`ride_${rideId}`);
      console.log(`${userType} ${socket.user.fullName} joined ride room ${rideId}`);
    });

    // Handle leaving ride room
    socket.on('leave-ride', (data) => {
      const { rideId } = data;
      socket.leave(`ride_${rideId}`);
      console.log(`User ${socket.user.fullName} left ride room ${rideId}`);
    });

    // Handle leaving ride room (alternative event name)
    socket.on('leave_ride_room', (data) => {
      const { rideId, userType } = data;
      socket.leave(`ride_${rideId}`);
      console.log(`${userType} ${socket.user.fullName} left ride room ${rideId}`);
    });

    // Handle leaving all rooms
    socket.on('leave_all_rooms', (data) => {
      const { userType } = data;
      console.log(`${userType} ${socket.user.fullName} leaving all rooms`);

      // Get all rooms this socket is in
      const rooms = Array.from(socket.rooms);
      rooms.forEach(room => {
        if (room !== socket.id) { // Don't leave own socket room
          socket.leave(room);
          console.log(`Left room: ${room}`);
        }
      });
    });

    // Handle manual joining of driver rooms
    socket.on('join-drivers-room', () => {
      if (socket.user.role === 'Driver') {
        socket.join('drivers');
        socket.join('main-drivers');
        console.log(`🚚 Main Driver ${socket.user.fullName} manually joined drivers and main-drivers rooms`);
        socket.emit('joined-drivers-room', { success: true, message: 'Successfully joined main drivers room' });
      } else if (socket.user.role === 'SubDriver') {
        socket.join('drivers');
        socket.join('sub-drivers');
        console.log(`🚚 Sub-Driver ${socket.user.fullName} manually joined drivers and sub-drivers rooms`);
        socket.emit('joined-drivers-room', { success: true, message: 'Successfully joined sub-drivers room' });
      } else {
        socket.emit('joined-drivers-room', { success: false, message: 'Only drivers and sub-drivers can join driver rooms' });
      }
    });

    // Handle driver availability updates
    socket.on('update-availability', async (data) => {
      try {
        const { isAvailable } = data;

        if (socket.user.role !== 'Driver' && socket.user.role !== 'SubDriver') {
          return socket.emit('error', { message: 'Only drivers and sub-drivers can update availability' });
        }

        // Update BOTH driver availability fields in database
        await User.findByIdAndUpdate(socket.userId, {
          'driverInfo.isAvailable': isAvailable,
          'isOnline': isAvailable  // Sync both fields
        });

        // Emit to all users looking for drivers
        socket.broadcast.emit('driver-availability-update', {
          driverId: socket.userId,
          isAvailable,
          timestamp: new Date()
        });

        console.log(`Driver ${socket.user.fullName} availability updated to ${isAvailable}`);
      } catch (error) {
        console.error('Update availability socket error:', error);
        socket.emit('error', { message: 'Failed to update availability' });
      }
    });

    // Handle emergency alerts
    socket.on('emergency-alert', async (data) => {
      try {
        const { rideId, location, message } = data;

        // Emit to admin users
        socket.to('admins').emit('emergency-alert', {
          rideId,
          userId: socket.userId,
          user: socket.user.fullName,
          location,
          message,
          timestamp: new Date()
        });

        // Also emit to nearby drivers
        socket.to('drivers').emit('emergency-alert', {
          rideId,
          userId: socket.userId,
          location,
          message,
          timestamp: new Date()
        });

        console.log(`Emergency alert from user ${socket.user.fullName} for ride ${rideId}`);
      } catch (error) {
        console.error('Emergency alert socket error:', error);
        socket.emit('error', { message: 'Failed to send emergency alert' });
      }
    });

    // Handle chat messages (if you implement in-app chat)
    socket.on('send-message', (data) => {
      const { rideId, message } = data;

      // Emit message to all users in the ride room
      io.to(`ride_${rideId}`).emit('new-message', {
        userId: socket.userId,
        userName: socket.user.fullName,
        message,
        timestamp: new Date()
      });
    });

    // Handle typing indicators
    socket.on('typing', (data) => {
      const { rideId, isTyping } = data;

      socket.to(`ride_${rideId}`).emit('user-typing', {
        userId: socket.userId,
        userName: socket.user.fullName,
        isTyping
      });
    });

    // Handle OTP generation from customer
    socket.on('otp_generated', (data) => {
      try {
        const { rideId, otp, customerMessage, timestamp } = data;
        console.log(`🔐 OTP generated by customer for ride ${rideId}: ${otp}`);

        // Broadcast OTP to specific ride room (driver will be in this room)
        socket.to(`ride_${rideId}`).emit('customer_otp_generated', {
          rideId: rideId,
          otp: otp,
          message: customerMessage,
          timestamp: timestamp
        });

        // Also broadcast to all drivers as fallback
        socket.to('drivers').emit('customer_otp_generated', {
          rideId: rideId,
          otp: otp,
          message: customerMessage,
          timestamp: timestamp
        });

        console.log(`✅ OTP ${otp} broadcasted to drivers for ride ${rideId}`);
      } catch (error) {
        console.error('❌ OTP broadcast error:', error);
      }
    });

    // Handle ping from customers
    socket.on('ping', (data) => {
      console.log(`🏓 Received ping from ${socket.user.fullName}:`, data);
      socket.emit('pong', {
        message: 'Server received your ping',
        timestamp: new Date(),
        yourData: data
      });
    });

    // Handle disconnect
    socket.on('disconnect', async () => {
      try {
        console.log(`User ${socket.user.fullName} disconnected`);

        // Update user's online status
        if (socket.user.role !== 'Customer') {
          await User.findByIdAndUpdate(socket.userId, {
            isOnline: false,
            lastSeen: new Date()
          });
        }

        // If driver or sub-driver, update availability (sync both fields)
        if (socket.user.role === 'Driver' || socket.user.role === 'SubDriver') {
          await User.findByIdAndUpdate(socket.userId, {
            'driverInfo.isAvailable': false,
            'isOnline': false  // Sync both fields on disconnect
          });
        }

      } catch (error) {
        console.error('Disconnect error:', error);
      }
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  });

  // ✅ SMART BROADCASTING WITH SEPARATE ROOMS
  const broadcastRideRequest = async (rideData) => {
    try {
      console.log('🔍 Smart broadcasting ride request with priority system...');

      let mainDriversSent = 0;
      let subDriversSent = 0;

      // STEP 1: Check available main drivers first
      const mainDriversRoom = io.sockets.adapter.rooms.get('main-drivers');
      if (mainDriversRoom) {
        console.log(`🔍 Checking ${mainDriversRoom.size} main drivers...`);
        
        for (const socketId of mainDriversRoom) {
          const socket = io.sockets.sockets.get(socketId);
          if (socket && socket.user) {
            const user = await User.findById(socket.userId).select('isOnline driverInfo.isAvailable role');
            
            const isAvailable = user && user.isOnline && 
              (user.driverInfo?.isAvailable !== false) && 
              user.role === 'Driver';
              
            if (isAvailable) {
              socket.emit('new-ride-request', rideData);
              mainDriversSent++;
              console.log(`✅ Sent to available Main Driver: ${socket.user.fullName}`);
            } else {
              console.log(`❌ Skipped unavailable Main Driver: ${socket.user.fullName} (online: ${user?.isOnline}, available: ${user?.driverInfo?.isAvailable})`);
            }
          }
        }
      }

      // STEP 2: If no main drivers available, check sub-drivers
      if (mainDriversSent === 0) {
        console.log('🔄 No main drivers available, checking sub-drivers...');
        
        const subDriversRoom = io.sockets.adapter.rooms.get('sub-drivers');
        if (subDriversRoom) {
          console.log(`🔍 Checking ${subDriversRoom.size} sub-drivers...`);
          
          for (const socketId of subDriversRoom) {
            const socket = io.sockets.sockets.get(socketId);
            if (socket && socket.user) {
              const user = await User.findById(socket.userId).select('isOnline driverInfo.isAvailable role');
              
              const isAvailable = user && user.isOnline && 
                (user.driverInfo?.isAvailable !== false) && 
                user.role === 'SubDriver';
                
              if (isAvailable) {
                socket.emit('new-ride-request', rideData);
                subDriversSent++;
                console.log(`✅ Sent to available Sub-Driver: ${socket.user.fullName}`);
              } else {
                console.log(`❌ Skipped unavailable Sub-Driver: ${socket.user.fullName} (online: ${user?.isOnline}, available: ${user?.driverInfo?.isAvailable})`);
              }
            }
          }
        }
      } else {
        console.log(`✅ ${mainDriversSent} main drivers available, skipping sub-drivers`);
      }

      const totalSent = mainDriversSent + subDriversSent;
      console.log(`📡 Ride request sent to ${totalSent} drivers (${mainDriversSent} main, ${subDriversSent} sub)`);

      // Fallback: if no drivers available, broadcast to all
      if (totalSent === 0) {
        console.log('⚠️ No available drivers found, broadcasting to all as fallback');
        io.to('drivers').emit('new-ride-request', rideData);
      }

    } catch (error) {
      console.error('❌ Error in smart broadcasting:', error);
      // Fallback to simple broadcast
      io.to('drivers').emit('new-ride-request', rideData);
    }
  };

  // Send notification to specific user
  const sendNotificationToUser = (userId, notification) => {
    io.to(`user_${userId}`).emit('notification', notification);
  };

  // Broadcast to all users
  const broadcastToAll = (event, data) => {
    io.emit(event, data);
  };

  // Broadcast to all drivers
  const broadcastToDrivers = (event, data) => {
    io.to('drivers').emit(event, data);
  };

  // Broadcast to all admins
  const broadcastToAdmins = (event, data) => {
    io.to('admins').emit(event, data);
  };

  return {
    broadcastRideRequest,
    sendNotificationToUser,
    broadcastToAll,
    broadcastToDrivers,
    broadcastToAdmins
  };
};

module.exports = {
  initializeSocket
};
