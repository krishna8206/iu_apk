const { body, param, query, validationResult } = require('express-validator');

// Handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: 'error',
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// User validation rules
const validateUserSignup = [
  body('fullName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Full name must be between 2 and 50 characters'),

  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),

  body('phone')
    .matches(/^[6-9]\d{9}$/)
    .withMessage('Please provide a valid 10-digit phone number'),

  body('gender')
    .isIn(['Male', 'Female', 'Other'])
    .withMessage('Gender must be Male, Female, or Other'),

  body('dateOfBirth')
    .isISO8601()
    .withMessage('Please provide a valid date of birth'),

  body('role')
    .isIn(['User', 'Driver'])
    .withMessage('Role must be User or Driver'),

  // App context: enforce which app is performing signup
  body('expectedRole')
    .isIn(['User', 'Driver'])
    .withMessage('expectedRole must be either "User" or "Driver"'),

  handleValidationErrors
];

const validateUserLogin = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),

  // Optional: which app is attempting login (User app vs Driver app)
  body('expectedRole')
    .isIn(['User', 'Driver'])
    .withMessage('expectedRole must be either "User" or "Driver"'),

  handleValidationErrors
];

const validateOTP = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),

  body('otp')
    .isLength({ min: 4, max: 6 })
    .isNumeric()
    .withMessage('OTP must be 4-6 digits'),

  // Enforce role during login OTP verification and allow same shape for signup
  body('expectedRole')
    .isIn(['User', 'Driver'])
    .withMessage('expectedRole must be either "User" or "Driver"'),

  handleValidationErrors
];

// Driver validation rules
const validateDriverInfo = [
  body('vehicleType')
    .isIn(['Bike', 'Auto', 'Car', 'Truck'])
    .withMessage('Vehicle type must be Bike, Auto, Car, or Truck'),

  body('vehicleNumber')
    .trim()
    .isLength({ min: 5, max: 20 })
    .withMessage('Vehicle number must be between 5 and 20 characters'),

  body('licenseNumber')
    .trim()
    .isLength({ min: 10, max: 20 })
    .withMessage('License number must be between 10 and 20 characters'),

  handleValidationErrors
];

// Ride validation rules
const validateRideRequest = [
  body('rideType')
    .isIn(['Bike', 'Auto', 'Car', 'Truck', 'Delivery'])
    .withMessage('Invalid ride type'),

  body('pickup.address')
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('Pickup address must be between 5 and 200 characters'),

  body('pickup.coordinates')
    .isArray({ min: 2, max: 2 })
    .withMessage('Pickup coordinates must be an array of 2 numbers [longitude, latitude]'),

  body('pickup.coordinates.*')
    .isFloat()
    .withMessage('Coordinates must be valid numbers'),

  body('destination.address')
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('Destination address must be between 5 and 200 characters'),

  body('destination.coordinates')
    .isArray({ min: 2, max: 2 })
    .withMessage('Destination coordinates must be an array of 2 numbers [longitude, latitude]'),

  body('destination.coordinates.*')
    .isFloat()
    .withMessage('Coordinates must be valid numbers'),

  body('passengers')
    .optional()
    .isInt({ min: 1, max: 6 })
    .withMessage('Number of passengers must be between 1 and 6'),

  handleValidationErrors
];

// Payment validation rules
const validatePayment = [
  body('amount')
    .isFloat({ min: 1 })
    .withMessage('Amount must be a positive number'),

  body('method')
    .isIn(['cash', 'card', 'upi', 'wallet', 'razorpay'])
    .withMessage('Invalid payment method'),

  body('currency')
    .optional()
    .isIn(['INR', 'USD'])
    .withMessage('Currency must be INR or USD'),

  handleValidationErrors
];

// Location validation
const validateLocation = [
  body('longitude')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be between -180 and 180'),

  body('latitude')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be between -90 and 90'),

  handleValidationErrors
];

// MongoDB ObjectId validation
const validateObjectId = (paramName) => [
  param(paramName)
    .isMongoId()
    .withMessage(`Invalid ${paramName} ID`),

  handleValidationErrors
];

// Pagination validation
const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),

  handleValidationErrors
];

module.exports = {
  handleValidationErrors,
  validateUserSignup,
  validateUserLogin,
  validateOTP,
  validateDriverInfo,
  validateRideRequest,
  validatePayment,
  validateLocation,
  validateObjectId,
  validatePagination
};
