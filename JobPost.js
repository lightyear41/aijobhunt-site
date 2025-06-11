const mongoose = require('mongoose');

const jobPostSchema = new mongoose.Schema({
  employerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employer',
    required: true
  },
  jobTitle: {
    type: String,
    required: true
  },
  jobDescription: {
    type: String,
    required: true
  },
  requiredSkills: {
    type: [String],
    default: []
  },
  expectedQualifications: {
    type: [String],
    default: []
  },
  location: {
    type: String,
    required: true
  },
  locationCoordinates: {
    lat: {
      type: Number,
      required: false
    },
    lng: {
      type: Number,
      required: false
    }
  },
  salary: {
    type: String
  },
  jobType: {
    type: String,
    enum: ['remote', 'hybrid', 'onsite'],
    required: true
  }
}, { timestamps: true });

module.exports = mongoose.model('JobPost', jobPostSchema);
