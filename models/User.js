const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: String,
  password: String,
  role: String,
  username: String,
  agreedToEULA: { type: Boolean, default: false }
});

module.exports = mongoose.model('User', userSchema);

