const express = require('express');
const User = require('../models/User');
const Ride = require('../models/Ride');
const Payment = require('../models/Payment');
const Notification = require('../models/Notification');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { validatePagination } = require('../middleware/validation');

const router = express.Router();

// Get admin dashboard statistics
router.get('/dashboard', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get today's statistics
    const todayStats = await Promise.all([
      Ride.countDocuments({ createdAt: { $gte: today, $lt: tomorrow } }),
      Ride.countDocuments({ 
        createdAt: { $gte: today, $lt: tomorrow },
        status: 'completed'
      }),
      Ride.aggregate([
        {
          $match: {
            createdAt: { $gte: today, $lt: tomorrow },
            status: 'completed'
          }
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$pricing.finalAmount' }
          }
        }
      ]),
      User.countDocuments({ createdAt: { $gte: today, $lt: tomorrow } }),
      User.countDocuments({ role: 'Driver', 'driverInfo.isAvailable': true })
    ]);

    // Get total statistics
    const totalStats = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: 'Driver' }),
      User.countDocuments({ role: 'User' }),
      Ride.countDocuments(),
      Ride.countDocuments({ status: 'completed' }),
      Ride.aggregate([
        {
          $match: { status: 'completed' }
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$pricing.finalAmount' }
          }
        }
      ])
    ]);

    // Get weekly revenue
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    
    const weeklyRevenue = await Ride.aggregate([
      {
        $match: {
          createdAt: { $gte: weekStart },
          status: 'completed'
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          revenue: { $sum: '$pricing.finalAmount' },
          rides: { $sum: 1 }
        }
      },
      {
        $sort: { '_id': 1 }
      }
    ]);

    // Get top drivers
    const topDrivers = await Ride.aggregate([
      {
        $match: { status: 'completed' }
      },
      {
        $group: {
          _id: '$driver',
          totalRides: { $sum: 1 },
          totalEarnings: { $sum: '$pricing.finalAmount' },
          averageRating: { $avg: '$rating.userRating.rating' }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'driverInfo'
        }
      },
      {
        $unwind: '$driverInfo'
      },
      {
        $project: {
          driverName: '$driverInfo.fullName',
          driverPhone: '$driverInfo.phone',
          vehicleType: '$driverInfo.driverInfo.vehicleType',
          totalRides: 1,
          totalEarnings: 1,
          averageRating: 1
        }
      },
      {
        $sort: { totalEarnings: -1 }
      },
      {
        $limit: 10
      }
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        today: {
          totalRides: todayStats[0],
          completedRides: todayStats[1],
          revenue: todayStats[2][0]?.totalRevenue || 0,
          newUsers: todayStats[3],
          availableDrivers: todayStats[4]
        },
        total: {
          totalUsers: totalStats[0],
          totalDrivers: totalStats[1],
          totalCustomers: totalStats[2],
          totalRides: totalStats[3],
          completedRides: totalStats[4],
          totalRevenue: totalStats[5][0]?.totalRevenue || 0
        },
        weeklyRevenue,
        topDrivers
      }
    });

  } catch (error) {
    console.error('Get admin dashboard error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get dashboard data'
    });
  }
});

// Get all users
router.get('/users', authenticateToken, requireAdmin, validatePagination, async (req, res) => {
  try {
    const { page = 1, limit = 20, role, search } = req.query;
    const skip = (page - 1) * limit;

    const filter = {};
    if (role) filter.role = role;
    if (search) {
      filter.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    const users = await User.find(filter)
      .select('-wallet.transactions')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await User.countDocuments(filter);

    res.status(200).json({
      status: 'success',
      data: {
        users,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total
        }
      }
    });

  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get users'
    });
  }
});

// Get all rides
router.get('/rides', authenticateToken, requireAdmin, validatePagination, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, dateFrom, dateTo } = req.query;
    const skip = (page - 1) * limit;

    const filter = {};
    if (status) filter.status = status;
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) filter.createdAt.$lte = new Date(dateTo);
    }

    const rides = await Ride.find(filter)
      .populate('user', 'fullName email phone')
      .populate('driver', 'fullName phone driverInfo.vehicleType')
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
    console.error('Get rides error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get rides'
    });
  }
});

// Get all payments
router.get('/payments', authenticateToken, requireAdmin, validatePagination, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, type, dateFrom, dateTo } = req.query;
    const skip = (page - 1) * limit;

    const filter = {};
    if (status) filter.status = status;
    if (type) filter.type = type;
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) filter.createdAt.$lte = new Date(dateTo);
    }

    const payments = await Payment.find(filter)
      .populate('user', 'fullName email phone')
      .populate('ride', 'pickup destination status')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Payment.countDocuments(filter);

    // Get payment summary
    const summary = await Payment.aggregate([
      {
        $match: filter
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$amount' },
          totalCount: { $sum: 1 },
          completedAmount: {
            $sum: {
              $cond: [{ $eq: ['$status', 'completed'] }, '$amount', 0]
            }
          },
          completedCount: {
            $sum: {
              $cond: [{ $eq: ['$status', 'completed'] }, 1, 0]
            }
          }
        }
      }
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        payments,
        summary: summary[0] || {
          totalAmount: 0,
          totalCount: 0,
          completedAmount: 0,
          completedCount: 0
        },
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total
        }
      }
    });

  } catch (error) {
    console.error('Get payments error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get payments'
    });
  }
});

// Update user status
router.patch('/users/:userId/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { isActive } = req.body;
    const { userId } = req.params;

    const user = await User.findByIdAndUpdate(
      userId,
      { isActive },
      { new: true }
    ).select('-wallet.transactions');

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    res.status(200).json({
      status: 'success',
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
      data: user
    });

  } catch (error) {
    console.error('Update user status error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update user status'
    });
  }
});

// Update driver verification status
router.patch('/drivers/:driverId/verify', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { isVerified } = req.body;
    const { driverId } = req.params;

    const driver = await User.findByIdAndUpdate(
      driverId,
      { isVerified },
      { new: true }
    ).select('-wallet.transactions');

    if (!driver) {
      return res.status(404).json({
        status: 'error',
        message: 'Driver not found'
      });
    }

    if (driver.role !== 'Driver') {
      return res.status(400).json({
        status: 'error',
        message: 'User is not a driver'
      });
    }

    res.status(200).json({
      status: 'success',
      message: `Driver ${isVerified ? 'verified' : 'unverified'} successfully`,
      data: driver
    });

  } catch (error) {
    console.error('Update driver verification error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update driver verification'
    });
  }
});

// Send notification to all users
router.post('/notifications/broadcast', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { title, message, type = 'system', priority = 'medium' } = req.body;

    if (!title || !message) {
      return res.status(400).json({
        status: 'error',
        message: 'Title and message are required'
      });
    }

    // Get all active users
    const users = await User.find({ isActive: true }).select('_id');

    // Create notifications for all users
    const notifications = users.map(user => ({
      user: user._id,
      title,
      message,
      type,
      priority,
      sentAt: new Date()
    }));

    await Notification.insertMany(notifications);

    res.status(200).json({
      status: 'success',
      message: `Notification sent to ${users.length} users`,
      data: {
        sentTo: users.length
      }
    });

  } catch (error) {
    console.error('Broadcast notification error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to send broadcast notification'
    });
  }
});

// Get system analytics
router.get('/analytics', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { period = 'month' } = req.query;
    
    let startDate;
    const endDate = new Date();
    
    switch (period) {
      case 'week':
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case 'year':
        startDate = new Date();
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
      default:
        startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 1);
    }

    // Get user growth
    const userGrowth = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          newUsers: { $sum: 1 },
          newDrivers: {
            $sum: { $cond: [{ $eq: ['$role', 'Driver'] }, 1, 0] }
          }
        }
      },
      {
        $sort: { '_id': 1 }
      }
    ]);

    // Get ride analytics
    const rideAnalytics = await Ride.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          totalRides: { $sum: 1 },
          completedRides: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          },
          cancelledRides: {
            $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
          },
          revenue: {
            $sum: {
              $cond: [{ $eq: ['$status', 'completed'] }, '$pricing.finalAmount', 0]
            }
          }
        }
      },
      {
        $sort: { '_id': 1 }
      }
    ]);

    // Get vehicle type distribution
    const vehicleDistribution = await Ride.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          status: 'completed'
        }
      },
      {
        $group: {
          _id: '$rideType',
          count: { $sum: 1 },
          revenue: { $sum: '$pricing.finalAmount' }
        }
      }
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        period,
        userGrowth,
        rideAnalytics,
        vehicleDistribution
      }
    });

  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get analytics'
    });
  }
});

// Get support tickets (if you implement a support system)
router.get('/support', authenticateToken, requireAdmin, validatePagination, async (req, res) => {
  try {
    // This would be implemented if you have a support ticket system
    res.status(200).json({
      status: 'success',
      message: 'Support system not implemented yet',
      data: {
        tickets: [],
        pagination: {
          current: 1,
          pages: 0,
          total: 0
        }
      }
    });

  } catch (error) {
    console.error('Get support tickets error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get support tickets'
    });
  }
});

module.exports = router;
