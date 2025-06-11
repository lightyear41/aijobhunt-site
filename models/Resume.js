const mongoose = require('mongoose');

// Subdocument schema for work experience details
const jobDetailsSchema = new mongoose.Schema({
  responsibilities: mongoose.Schema.Types.Mixed, // could be string or array
  achievements: [String],
  location: String,
  raw: mongoose.Schema.Types.Mixed
}, { _id: false });

// Subdocument schema for work experience
const workExperienceSchema = new mongoose.Schema({
  jobTitle: String,
  company: String,
  duration: String,
  jobDetails: jobDetailsSchema
}, { _id: false });

// Subdocument for location
const locationSchema = new mongoose.Schema({
  city: String,
  state: String,
  country: String,
  latitude: Number,
  longitude: Number
}, { _id: false });

// Subdocument for parsed qualifications
const qualificationsSchema = new mongoose.Schema({
  degrees: [String],
  certifications: [String],
  totalYearsExperience: Number
}, { _id: false });

// Main Resume schema
const resumeSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  fullName: { type: String, required: true },
  email: { type: String, required: true },
  phoneNumber: { type: String },
  education: [{ type: String }],
  skills: [{ type: String }],
  workExperience: [workExperienceSchema],
  location: locationSchema,
  qualifications: qualificationsSchema,
  survey: { type: mongoose.Schema.Types.ObjectId, ref: 'Survey', default: null },
  fileName: { type: String },
  originalName: { type: String },
  filePath: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('Resume', resumeSchema);
