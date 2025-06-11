require('dotenv').config();
const axios = require('axios');

const apiKey = process.env.GOOGLE_MAPS_API_KEY;

async function geocodeLocation(location) {
  if (!apiKey) {
    throw new Error('Missing Google Maps API key');
  }

  if (!location || location.trim() === '') {
    throw new Error('Invalid location: input is empty');
  }

  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${apiKey}`;

  try {
    const response = await axios.get(url);

    if (
      response.data.status !== 'OK' ||
      !response.data.results ||
      response.data.results.length === 0
    ) {
      throw new Error(`Geocoding failed: ${response.data.status}`);
    }

    const { lat, lng } = response.data.results[0].geometry.location;
    return { lat, lng };
  } catch (error) {
    console.error('📍 Geocoding error:', error.message || error);
    throw new Error(`Geocoding failed: ${error.message}`);
  }
}

module.exports = { geocodeLocation };
