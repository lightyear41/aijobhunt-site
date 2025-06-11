const express = require('express');
const router = express.Router();
const Survey = require('../models/Survey');
const { geocodeLocation } = require('../utils/geocode');
const requireLogin = require('../middleware/requireLogin');

// POST /survey - Save survey using session-based userId and email
router.post('/survey', requireLogin, async (req, res) => {
  try {
    const userId = req.session.user?.userId || req.session.user?._id; // adjust based on your session structure
    const email = req.session.user?.email;

    if (!userId || !email) {
      return res.status(401).json({ error: 'Unauthorized. Please log in.' });
    }

    const { locations, ...otherData } = req.body;

    if (!Array.isArray(locations)) {
      return res.status(400).json({ error: 'Invalid locations input' });
    }

    // Geocode each location string to get coordinates
    const coordsArray = await Promise.all(
      locations.map(loc => (loc && loc.trim() ? geocodeLocation(loc) : null))
    );

    // Filter out any null results from geocoding failures
    const filteredCoords = coordsArray.filter(Boolean);

    // Create new survey document with userId and email
    const survey = new Survey({
      userId,           // NEW: link survey to user by ObjectId
      email,
      locations,
      locationCoordinates: filteredCoords,
      ...otherData
    });

    await survey.save();

    res.status(201).json({ message: 'Survey saved!' });
  } catch (err) {
    console.error('❌ Survey error:', err.message);
    res.status(500).json({ error: 'Failed to save survey.' });
  }
});

module.exports = router;
