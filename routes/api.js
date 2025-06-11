const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const User = require('../models/User');

// POST /api/register
router.post('/register', async (req, res) => {
  console.log('📥 Register request body:', req.body);

  const { username, password } = req.body;
  if (!username || !password) {
    console.log('⚠️ Missing username or password');
    return res.status(400).json({ message: 'Missing username or password' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, password: hashedPassword });

    const savedUser = await newUser.save();
    console.log('✅ User saved to MongoDB:', savedUser);

    res.status(201).json({ message: 'User created' });
  } catch (err) {
    console.error('❌ Error saving user:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
