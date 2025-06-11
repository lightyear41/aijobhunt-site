const express = require('express');
const router = express.Router();
const Resume = require('../models/Resume');
const requireLogin = require('../middleware/requireLogin');

// Utility function to clean simple arrays
const cleanArray = (arr) => (Array.isArray(arr) ? arr.filter(Boolean) : []);

// Converts PascalCase fields like "Job Title" to camelCase
const cleanWorkExperience = (data) => {
  return Array.isArray(data)
    ? data.map(entry => {
        // Skip null or invalid entries
        if (!entry || typeof entry !== 'object') return null;

        return {
          jobTitle: entry.jobTitle || entry['Job Title'] || '',
          company: entry.company || entry['Company'] || '',
          duration: entry.duration || entry['Duration'] || ''
        };
      }).filter(item => item.jobTitle || item.company || item.duration) // remove empty ones
    : [];
};

router.post('/upload', requireLogin, async (req, res) => {
  try {
    console.log("Incoming workExperience (raw):", req.body.workExperience);

    // Parse stringified JSON fields if needed
    const parseJSON = (value) => {
      if (typeof value === 'string') {
        try {
          return JSON.parse(value);
        } catch {
          return [];
        }
      }
      return value;
    };

    const {
      fullName,
      email,
      phoneNumber,
      location,
      qualifications,
      fileName,
      originalName,
      filePath
    } = req.body;

    const skills = parseJSON(req.body.skills);
    const education = parseJSON(req.body.education);
    const workExperience = parseJSON(req.body.workExperience);

    const newResume = new Resume({
      userId: req.session.user.userId,
      fullName: fullName || '',
      email: email || '',
      phoneNumber: phoneNumber || '',
      skills: cleanArray(skills), // ✅ Changed from `requiredSkills` to `skills`
      education: cleanArray(education),
      workExperience: cleanWorkExperience(workExperience),
      location: location || null,
      qualifications: qualifications || null,
      fileName: fileName || '',
      originalName: originalName || '',
      filePath: filePath || ''
    });

    await newResume.save();

    res.status(201).json({ message: 'Resume uploaded successfully', resume: newResume });
  } catch (err) {
    console.error('❌ Error uploading resume:', err);
    res.status(500).json({ message: 'Failed to upload resume' });
  }
});



module.exports = router;
