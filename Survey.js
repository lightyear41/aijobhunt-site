const mongoose = require('mongoose');

const SurveySchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    required: true, 
    ref: 'Resume' // or 'User' if you use that model name
  },

  email: { type: String, required: true }, // ✅ Link survey to user by email (optional now)

  jobTitles: [{ type: String }], // Desired job titles

  minSalary: { type: Number }, // ✅ Extracted minimum salary

  locations: [{ type: String }], // e.g., city names or ZIP codes

  locationCoordinates: [{
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  }],

  jobType: { type: String, enum: ['remote', 'hybrid', 'onsite'], default: 'onsite' },

  excludeFilters: [{ type: String }], // Keywords or companies to avoid

  timestamp: { type: Date, default: Date.now } // Optional: redundant if using timestamps below
}, {
  timestamps: true // ✅ Adds `createdAt` and `updatedAt`
});

module.exports = mongoose.model('Survey', SurveySchema);
