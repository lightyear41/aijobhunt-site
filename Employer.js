const mongoose = require('mongoose');

const employerSchema = new mongoose.Schema({
  companyName: { type: String, required: true }, // ✅ Add this
  username: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },

  jobTitle: { type: String, required: true },
  jobDescription: { type: String },
  requiredSkills: [{ type: String }],
  expectedQualifications: [{ type: String }],
  location: { type: String },
  locationCoordinates: {
    lat: { type: Number },
    lng: { type: Number }
  }
}, { timestamps: true });

module.exports = mongoose.model('Employer', employerSchema);
