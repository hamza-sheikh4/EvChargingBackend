'use strict'

/*
|--------------------------------------------------------------------------
| Application Constants
|--------------------------------------------------------------------------
*/

// JWT
exports.JWT_EXPIRES_IN = '30d';

// File
exports.IMAGE_SIZE = 10000000; // 10MB for image uploads

// Listings
exports.LISTING_STALE_DAYS = Number(process.env.LISTING_STALE_DAYS) || 7; // no check-in for this long hides a listing (vision rule 7)
exports.TIME_OFF_MAX_DAYS = 30;
