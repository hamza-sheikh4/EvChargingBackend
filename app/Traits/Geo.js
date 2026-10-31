'use strict'

const crypto = require('crypto');

const METERS_PER_DEGREE_LAT = 111320;
const APPROX_MIN_METERS = 50;
const APPROX_MAX_METERS = 100;

let o = {}

/** The point `meters` away in the direction `bearing` (radians, 0 is north). Accurate at city scale. */
o.offsetMeters = ({ latitude, longitude }, meters, bearing) => ({
  latitude: latitude + (meters * Math.cos(bearing)) / METERS_PER_DEGREE_LAT,
  longitude: longitude + (meters * Math.sin(bearing)) / (METERS_PER_DEGREE_LAT * Math.cos((latitude * Math.PI) / 180)),
});

/**
 * What drivers see before the host accepts (vision rule 2): 50 to 100 m from the pin
 * in a random direction. Stored once per pin, so repeated looks cannot be averaged back to it.
 */
o.approximate = (exact) => {
  const meters = APPROX_MIN_METERS + (crypto.randomInt(0, 1001) / 1000) * (APPROX_MAX_METERS - APPROX_MIN_METERS);
  return o.offsetMeters(exact, meters, (crypto.randomInt(0, 3600) / 3600) * 2 * Math.PI);
};

module.exports = o;
