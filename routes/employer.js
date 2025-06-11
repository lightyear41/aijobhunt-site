const express = require('express');
const router = express.Router();

const JobPost = require('../models/JobPost');
const Resume = require('../models/Resume');
const Employer = require('../models/Employer');
const User = require('../models/User'); // Add this at top if not already
const { geocodeLocation } = require('../utils/geocode');

// Middleware to check employer session
function requireEmployer(req, res, next) {
  const user = req.session.user;
  if (!user || user.role !== 'employer') {
    return res.status(401).json({ message: 'Unauthorized. Please log in as an employer.' });
  }
  next();
}

// ✅ GET /api/employer - fetch employer info from session

router.get('/', requireEmployer, async (req, res) => {
  console.log('📥 GET /api/employer hit!');

  try {
    const userId = req.session.user.userId;

    const user = await User.findById(userId);
    if (!user || user.role !== 'employer') {
      return res.status(404).json({ message: 'Employer not found in users' });
    }

    const employer = await Employer.findOne({ email: user.email });

    const response = {
      username: user.username,
      email: user.email,
      role: user.role,
      companyName: employer?.companyName || null,
      jobTitle: employer?.jobTitle || null,
      locationCoordinates: employer?.locationCoordinates || null,
    };

    console.log('📦 Sending employer info:', response);
    res.status(200).json(response);
  } catch (err) {
    console.error('❌ Error in GET /api/employer:', err.message);
    res.status(500).json({ message: 'Server error fetching employer' });
  }
});


// ✅ POST /api/employer - create a new job post
router.post('/', requireEmployer, async (req, res) => {
  try {
    const employerId = req.session.user.userId;

    const {
      jobTitle,
      jobDescription,
      requiredSkills,
      location,
      expectedQualifications
    } = req.body;

    if (!jobTitle || !jobDescription || !Array.isArray(requiredSkills) || !location) {
      return res.status(400).json({ message: 'Missing required job post fields' });
    }

    const cleanedSkills = requiredSkills.map(s => s.trim()).filter(Boolean);
    const cleanedQualifications = Array.isArray(expectedQualifications)
      ? expectedQualifications.map(s => s.trim()).filter(Boolean)
      : [];

    const coords = await geocodeLocation(location);

    const jobPost = new JobPost({
      employerId,
      jobTitle,
      jobDescription,
      requiredSkills: cleanedSkills,
      expectedQualifications: cleanedQualifications,
      location,
      locationCoordinates: coords || null,
    });

    await jobPost.save();
    res.status(201).json({ message: 'Job post created successfully!', jobPost });
  } catch (error) {
    console.error('❌ Failed to create job post:', error.message);
    res.status(500).json({ error: 'Failed to create job post.' });
  }
});

// ✅ GET /api/employer/matches - get resumes matching latest job post
router.get('/matches', requireEmployer, async (req, res) => {
  try {
    const employerId = req.session.user.userId;
    const latestPost = await JobPost.findOne({ employerId }).sort({ createdAt: -1 });

    if (!latestPost) {
      return res.status(404).json({ message: 'No job post found for this employer' });
    }

    const { expectedQualifications } = latestPost;
    if (!Array.isArray(expectedQualifications) || expectedQualifications.length === 0) {
      return res.status(400).json({ message: 'Expected qualifications are empty.' });
    }

    const resumes = await Resume.find();
    const matches = [];

    for (const resume of resumes) {
      const resumeSkills = Array.isArray(resume.skills) ? resume.skills : [];
      let matchesCount = 0;

      for (const qual of expectedQualifications) {
        if (
          resumeSkills.some(skill =>
            skill.toLowerCase().includes(qual.toLowerCase())
          )
        ) {
          matchesCount++;
        }
      }

      const matchPercentage = (matchesCount / expectedQualifications.length) * 100;

      if (matchPercentage >= 90) {
        matches.push({
          resumeId: resume._id,
          fullName: resume.fullName,
          email: resume.email,
          phoneNumber: resume.phoneNumber,
          skills: resumeSkills,
          matchPercentage,
        });
      }
    }

    res.status(200).json({ matches });
  } catch (err) {
    console.error('❌ Error fetching matches:', err.message);
    res.status(500).json({ error: 'Failed to retrieve matches.' });
  }
});

// ✅ DELETE /api/employer/employer-post/:id - delete a job post
router.delete('/employer-post/:id', requireEmployer, async (req, res) => {
  try {
    const employerId = req.session.user.userId;
    const jobPostId = req.params.id;

    const jobPost = await JobPost.findById(jobPostId);
    if (!jobPost) {
      return res.status(404).json({ message: 'Job post not found' });
    }

    if (jobPost.employerId.toString() !== employerId) {
      return res.status(403).json({ message: 'Forbidden: Not authorized to delete this job post' });
    }

    await JobPost.findByIdAndDelete(jobPostId);
    res.status(200).json({ message: 'Job post deleted successfully' });
  } catch (err) {
    console.error('❌ Error deleting job post:', err.message);
    res.status(500).json({ message: 'Failed to delete job post' });
  }
});

module.exports = router;
