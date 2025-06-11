const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema({
  username: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },

  resume: { type: String }, // File path or URL to uploaded resume
  skills: [{ type: String }],
  qualifications: [{ type: String }],
  location: { type: String },
  locationCoordinates: {
    lat: { type: Number },
    lng: { type: Number }
  },
  survey: {
    type: mongoose.Schema.Types.Mixed // Can store survey responses
  },
  parsedData: {
    type: mongoose.Schema.Types.Mixed // Gemini resume parser results
  }
}, { timestamps: true });

module.exports = mongoose.model('Employee', employeeSchema);
