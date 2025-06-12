process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('🔥 Uncaught Exception:', err);
});

// server.js
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const pdfParse = require('pdf-parse');
const session = require('express-session');
const bcrypt = require('bcrypt');
require('dotenv').config();

const saltRounds = 10;
const app = express();
const port = process.env.PORT || 3000;
const upload = multer({ dest: 'uploads/' });

// Import your models
const User = require('./models/User');
const Employer = require('./models/Employer');
const JobPost = require('./models/JobPost');
const Resume = require('./models/Resume');
const Survey = require('./models/Survey');

// Import utilities
const { fuzzyMatch } = require('./utils/fuzzymatch');
const requireEmployer = require('./routes/employer');
let geocodeLocation;
try {
  geocodeLocation = require('./utils/geocode').geocodeLocation;
} catch (err) {
  console.error("❌ Failed to load './utils/geocode':", err.message);
}

// Import routes
const employerRoutes = require('./routes/employer');

console.log("🚀 Starting server setup...");

// Serve static frontend
const frontendDir = path.join(__dirname, '../resume-frontend');
console.log("📂 Serving static files from:", frontendDir);
app.use(express.static(frontendDir));

// Middleware setup
console.log("🛠️ Setting up middleware: JSON, URL Encoded, Sessions, and CORS");
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'resume-frontend')));

// ✅ UPDATED: Allowed origins including www.aijobhunt.org
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5500',
  'http://167.99.237.153:3000',
  'http://aijobhunt.org',
  'https://aijobhunt.org',
  'http://www.aijobhunt.org',
  'https://www.aijobhunt.org'
];

// ✅ Add logging and CORS validation
const corsOptions = {
  origin: function (origin, callback) {
    console.log('🌍 Incoming request from origin:', origin);
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    console.warn('🚫 CORS blocked origin:', origin);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
};

app.use(cors(corsOptions));

// Sessions
console.log("🔐 Setting up session middleware");
app.use(session({
  name: 'sid',
  secret: process.env.SESSION_SECRET || 'your-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 // 1 day
  }
}));

// Mount employer routes
console.log("📁 Mounting employer routes");
app.use('/api/employer', employerRoutes);

// Auth middleware to protect routes
function requireLogin(req, res, next) {
  if (req.session && req.session.user) {
    next();
  } else {
    res.status(401).json({ message: 'Not authenticated' });
  }
}

// Resume Parsing with Gemini
async function parseResumeWithGemini(filePath) {
  console.log('📄 inside parseResumeWithGemini(filePath)');

  const apiKey = process.env.GEMINI_API_KEY;
  const model = 'gemini-1.5-pro';

  if (!apiKey) throw new Error('❌ Missing Gemini API Key');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  console.log('🔍 Using Gemini model:', model);
  console.log('📡 Full URL:', url);

  // Read PDF file content
  const dataBuffer = fs.readFileSync(filePath);
  const pdfData = await pdfParse(dataBuffer);
  const resumeText = pdfData.text;

  const prompt = `
You are a professional resume parser. Analyze the resume text below and extract ONLY the following fields. Return only VALID JSON — no markdown, no explanations.

{
  "Full Name": "string",
  "Email": "string",
  "Phone Number": "string",
  "Education": ["string", "..."],
  "Skills": ["string", "..."],
  "Work Experience": [
    {
      "Job Title": "string",
      "Company": "string",
      "Duration": "string",
      "Location": "string (if available)",
      "Responsibilities": ["string", "..."],
      "Achievements": ["string", "..."]
    }
  ],
  "Hidden Soft Skills": ["string", "..."]
}

Resume:
"""
${resumeText}
"""
`;

  try {
    const response = await axios.post(
      url,
      {
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }]
          }
        ]
      },
      {
        headers: { 'Content-Type': 'application/json' }
      }
    );

    const part = response.data?.candidates?.[0]?.content?.parts?.[0];

    if (!part || !part.text) {
      throw new Error('❌ Gemini API returned no valid content');
    }

    let rawOutput = part.text;

    // Defensive string conversion and cleanup
    if (typeof rawOutput !== 'string') {
      if (rawOutput === null || rawOutput === undefined) {
        throw new Error('rawOutput is null or undefined');
      } else if (typeof rawOutput === 'object') {
        rawOutput = JSON.stringify(rawOutput);
      } else {
        rawOutput = String(rawOutput);
      }
    }

    const cleanedOutput = rawOutput.replace(/```json\s*|```/g, '').trim();

    return JSON.parse(cleanedOutput);

  } catch (err) {
    console.error('❌ Gemini API error or JSON parsing error:', err.response?.data || err.message);
    throw new Error('Failed to get a valid response from Gemini API');
  }
}

// Resume Upload Route (example)
app.post('/api/upload-resume', upload.single('resume'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    const parsedData = await parseResumeWithGemini(req.file.path);
    // Delete uploaded file after parsing
    fs.unlinkSync(req.file.path);
    res.json({ success: true, parsedData });
  } catch (err) {
    console.error('Error parsing resume:', err);
    res.status(500).json({ error: 'Failed to parse resume' });
  }
});

// Example protected route usage
app.get('/api/protected-route', requireLogin, (req, res) => {
  res.json({ message: 'You are authenticated and accessed a protected route!' });
});

// Home route to serve frontend's home.html
app.get('/', (req, res) => {
  res.sendFile(path.join(frontendDir, 'home.html'), err => {
    if (err) {
      console.error('Error sending home.html:', err);
      res.status(500).send('Error loading home page');
    }
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('⚠️ Express global error handler:', err);
  res.status(500).json({ message: 'Internal server error', error: err.message });
});

// Connect to MongoDB
console.log("📡 Connecting to MongoDB...");
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB Atlas'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// Env variable checks
console.log('🧪 Loaded .env from:', path.resolve(__dirname, '.env'));
console.log('🔗 MongoDB URI:', process.env.MONGODB_URI ? '✅ Present' : '❌ Missing');
console.log('🗺️ Google Maps API Key:', process.env.GOOGLE_MAPS_API_KEY ? '✅ Present' : '❌ Missing');
console.log('🧠 Gemini API Key:', process.env.GEMINI_API_KEY ? '✅ Present' : '❌ Missing');

// Start server
app.listen(port, '0.0.0.0', () => {
  console.log(`✅ Server listening at http://167.99.237.153:${port}`);
});



//////////////////////////////////////////////////////////////////////
////////////  SIGNIN-EMPLOYEE //////////////////////////////////////////
//////////////////////////////////////////////////////////////////////

// 🔐 Employee Sign-In Route
app.post('/api/signin-employee', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email, role: 'jobseeker' });

    console.log("🔍 User from DB:", user);

    if (!user) return res.status(400).json({ message: 'Invalid email or password' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid email or password' });

    req.session.user = {
      userId: user._id.toString(),
      email: user.email,
      role: user.role.toLowerCase(),
      agreedToEULA: user.agreedToEULA || false,
      username: user.username || null,
    };

    req.session.save(err => {
      if (err) {
        console.error('❌ Session save error during sign-in:', err);
        return res.status(500).json({ message: 'Server error saving session' });
      }

      console.log(`✅ Employee ${user.email} signed in successfully`);
      console.log("🆔 Session data:", req.session.user);

      res.status(200).json({
        message: 'Sign in successful',
        userId: user._id.toString(),
        email: user.email,
        role: user.role,
      });
    });

  } catch (err) {
    console.error('❌ Sign-in error:', err);
    res.status(500).json({ message: 'Server error during sign-in' });
  }
});

// 🔓 Logout Route (for job seekers and others)
app.post('/api/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('❌ Logout error:', err);
      return res.status(500).json({ message: 'Error during logout' });
    }
    res.clearCookie('connect.sid'); // Replace 'connect.sid' if your session cookie name is different
    res.json({ message: 'Logged out successfully' });
  });
});

//////////////////////////////////////////////////////////////////////
////////////  SIGNUP-EMPLOYEE //////////////////////////////////////////
//////////////////////////////////////////////////////////////////////

// 👤 Employee Sign-Up Route
app.post('/api/signup-employee', async (req, res) => {
  try {
    const { username, password, email } = req.body;

    if (!email || !password || !username) {
      return res.status(400).json({ message: 'Username, email, and password are required.' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const newUser = new User({
      email,
      password: hashedPassword,
      role: 'jobseeker',
      username
    });

    await newUser.save();

    req.session.user = {
      userId: newUser._id,
      email: newUser.email,
      role: newUser.role.toLowerCase(),
      username: newUser.username,
      agreedToEULA: newUser.agreedToEULA || false,
    };

    req.session.save(err => {
      if (err) {
        console.error('❌ Session save error:', err);
        return res.status(500).json({ message: 'Server error saving session' });
      }
      res.status(201).json({ message: 'User created and signed in' });
    });

  } catch (err) {
    console.error('❌ Signup error:', err);
    res.status(500).json({ message: 'Server error during signup' });
  }
});



//////////////////////////////////////////////////////////////////////
////////////  AUTHENTICATION //////////////////////////////////////////
//////////////////////////////////////////////////////////////////////

// 🔐 Login Route (for both employers and employees)
app.post('/api/auth', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ error: 'Email and password are required.' });

    const user = await User.findOne({ email });
    if (!user)
      return res.status(400).json({ error: 'User not found.' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(401).json({ error: 'Invalid credentials.' });

    // Save essential user info in session for authorization checks later
    req.session.user = {
      userId: user._id.toString(),
      email: user.email,
      role: user.role.toLowerCase(), // e.g. 'employer' or 'candidate'
      username: user.username || null,
    };

    req.session.save(err => {
      if (err) {
        console.error('❌ Session save error:', err);
        return res.status(500).json({ error: 'Server error saving session.' });
      }
      console.log('✅ Logged in user:', req.session.user);
      res.json({ message: 'Login successful.' });
    });
  } catch (err) {
    console.error('❌ Login error:', err);
    res.status(500).json({ error: 'Server error during login.' });
  }
});



//////////////////////////////////////////////////////////////////////
////////////  SIGNIN-EMPLOYER //////////////////////////////////////////
//////////////////////////////////////////////////////////////////////

// 👤 Sign In Route for Employers Only
app.post('/api/signin-employer', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email, role: 'employer' });

    console.log("User from DB:", user);

    if (!user) return res.status(400).json({ message: 'Invalid email or password' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid email or password' });

    req.session.user = {
      userId: user._id.toString(),
      email: user.email,
      role: user.role.toLowerCase(),
      username: user.username || null,
      agreedToEULA: user.agreedToEULA || false,
    };

    req.session.save(err => {
      if (err) return res.status(500).json({ message: 'Server error saving session' });

      console.log(`✅ Employer ${user.email} signed in successfully`);
      console.log("Employer session:", req.session.user);

      res.status(200).json({
        message: 'Sign in successful',
        email: user.email,
        role: user.role,
        username: user.username || null
      });
    });
  } catch (err) {
    console.error('❌ Employer sign-in error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});


//////////////////////////////////////////////////////////////////////
////////////  SIGNUP-EMPLOYER //////////////////////////////////////////
//////////////////////////////////////////////////////////////////////

// 🆕 Sign Up Route for Employers
app.post('/api/signup-employer', async (req, res) => {
  try {
    const { email, password, username } = req.body;
    console.log("📥 Received signup data:", { email, password, username });

    if (!email || !password || !username) {
      console.log("❌ Missing required fields");
      return res.status(400).json({ message: 'Email, password, and company name are required.' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      console.log("❌ User already exists with that email");
      return res.status(400).json({ message: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, saltRounds);
    console.log("🔑 Password hashed");

    const newUser = new User({
      email,
      username,
      password: hashedPassword,
      role: 'employer'
    });
    await newUser.save();
    console.log("✅ New employer saved to DB:", newUser._id);

    req.session.user = {
      userId: newUser._id,
      email: newUser.email,
      username: newUser.username,
      role: newUser.role.toLowerCase(),
      agreedToEULA: newUser.agreedToEULA || false,
    };

    req.session.save(err => {
      if (err) {
        console.error("❌ Error saving session:", err);
        return res.status(500).json({ message: 'Failed to create session' });
      }

      console.log("✅ Session created:", req.session.user);
      res.status(201).json({
        message: 'Employer created and signed in',
        user: {
          userId: newUser._id,
          username: newUser.username,
          role: newUser.role
        }
      });
    });
  } catch (err) {
    console.error('❌ Employer signup error:', err);
    res.status(500).json({ message: 'Server error during employer signup' });
  }
});


//////////////////////////////////////////////////////////////////////
////////////  HAVERSINEDISTANCE //////////////////////////////////////////
//////////////////////////////////////////////////////////////////////

// 🌍 Utility: Haversine distance
const haversineDistance = (coords1, coords2) => {
  const toRad = x => (x * Math.PI) / 180;
  const R = 3959; // miles

  const dLat = toRad(coords2.lat - coords1.lat);
  const dLng = toRad(coords2.lng - coords1.lng);

  const lat1 = toRad(coords1.lat);
  const lat2 = toRad(coords2.lat);

  const a = Math.sin(dLat / 2) ** 2 +
            Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};


//////////////////////////////////////////////////////////////////////
////////////  MATCHES //////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////

// 🎯 MATCHES: Find best candidates

app.post('/api/matches', async (req, res) => {
  console.log('🔵 /api/matches hit');
  try {
    const { jobPostId, maxDistance = 20000 } = req.body;

    if (!jobPostId) return res.status(400).json({ message: 'jobPostId is required' });

    const jobPost = await JobPost.findById(jobPostId);
    if (!jobPost) return res.status(404).json({ message: 'Job post not found' });

    const {
      jobTitle,
      requiredSkills = [],
      salary: employerMaxSalary,
      locationCoordinates: employerLocation,
      jobType: employerJobType,
    } = jobPost;

    if (!jobTitle || typeof jobTitle !== 'string') {
      return res.status(400).json({ message: 'Job title is required for matching' });
    }

    if (
      !employerLocation ||
      typeof employerLocation.lat !== 'number' ||
      typeof employerLocation.lng !== 'number'
    ) {
      return res.status(400).json({ message: 'Invalid employer location' });
    }

    if (!employerJobType) {
      return res.status(400).json({ message: 'Job type is required for matching' });
    }

    console.log(`🔍 Max distance: ${maxDistance} miles = ${(parseFloat(maxDistance) * 1.60934).toFixed(2)} km`);
    console.log('🔎 Required skills:', requiredSkills);
    console.log('💰 Employer max salary:', employerMaxSalary);
    console.log('🏢 Employer job type:', employerJobType);

    const candidates = await Resume.find({}).populate('survey');
    console.log(`📋 Found ${candidates.length} resumes`);

    const matches = [];

    for (const candidate of candidates) {
      const candidateId = candidate.userId || candidate._id;
      console.log(`\n👤 Checking resume userId: ${candidateId}, email: ${candidate.email}`);

      const survey = candidate.survey;
      if (!survey) {
        console.log(`⚠️ No survey linked in resume for userId ${candidateId}, skipping candidate`);
        continue;
      }

      const candidateExpectedSalary = parseFloat(survey.minSalary);
      const maxSalary = parseFloat(employerMaxSalary);
      if (!isNaN(maxSalary) && !isNaN(candidateExpectedSalary)) {
        if (candidateExpectedSalary > maxSalary) {
          console.log(`💸 Candidate expects ${candidateExpectedSalary}, exceeds max ${maxSalary}, skipping`);
          continue;
        }
      }

      const candidateJobType = survey.jobType;
      if (!candidateJobType) {
        console.log('⚠️ Candidate missing jobType, skipping');
        continue;
      }

      const jobTypeCompatible =
        (employerJobType === 'remote' && (candidateJobType === 'remote' || candidateJobType === 'hybrid')) ||
        (employerJobType === 'onsite' && (candidateJobType === 'onsite' || candidateJobType === 'hybrid')) ||
        (employerJobType === 'hybrid');

      if (!jobTypeCompatible) {
        console.log(`🚫 Job type mismatch. Employer: ${employerJobType}, Candidate: ${candidateJobType}`);
        continue;
      }

      const seekerJobTitles = (survey.jobTitles || []).map(t => t.toLowerCase());
      const titleMatch = seekerJobTitles.some(t =>
        fuzzyMatch(jobTitle.toLowerCase(), t) || fuzzyMatch(t, jobTitle.toLowerCase())
      );
      if (!titleMatch) {
        console.log('🚫 Job title mismatch, skipping');
        continue;
      }

      const locCoord = survey.locationCoordinates?.[0];
      if (!locCoord || typeof locCoord.lat !== 'number' || typeof locCoord.lng !== 'number') {
        console.log('⚠️ No valid locationCoordinates, skipping');
        continue;
      }

      const distance = haversineDistance(employerLocation, locCoord);
      console.log(`📍 Distance: ${distance.toFixed(2)} miles`);
      if (distance > parseFloat(maxDistance)) {
        console.log('🚫 Distance too far, skipping');
        continue;
      }

      const candidateSkills = (candidate.skills || []).map(s => s.toLowerCase());
      const hiddenSoftSkills = (candidate.hiddenSoftSkills || []).map(s => s.toLowerCase());

      let responsibilities = [];
      if (Array.isArray(candidate.workExperience)) {
        candidate.workExperience.forEach(exp => {
          if (Array.isArray(exp.Responsibilities)) {
            responsibilities = responsibilities.concat(exp.Responsibilities.map(r => r.toLowerCase()));
          }
        });
      }

      const candidateSkillPool = [...new Set([...candidateSkills, ...hiddenSoftSkills, ...responsibilities])];
      const required = (requiredSkills || []).map(s => s.toLowerCase());

      const skillMatches = required.filter(reqSkill =>
        candidateSkillPool.some(candSkill => fuzzyMatch(candSkill, reqSkill))
      ).length;

      const candidateEducation = candidate.education || [];
      const educationMatch = candidateEducation.some(edu => {
        const fieldsToCheck = [edu.degree, edu.fieldOfStudy, edu.institution]
          .filter(Boolean)
          .map(f => f.toLowerCase());
        return fieldsToCheck.some(field =>
          fuzzyMatch(field, jobTitle.toLowerCase()) || required.some(skill => fuzzyMatch(field, skill))
        );
      });

      let skillScore = 0;
      if (required.length > 0) {
        skillScore = skillMatches / required.length;
      } else {
        skillScore = candidateSkillPool.length > 0 ? 1 : 0;
      }

      const educationScore = educationMatch ? 1 : 0;

      const totalWeight = 1.0;
      const combinedScore = ((skillScore * 0.7) + (educationScore * 0.3)) / totalWeight;

      if (combinedScore === 0) {
        console.log('❌ No skill or education matches, skipping');
        continue;
      }

      const matchPercentage = (combinedScore * 100).toFixed(1);

      matches.push({
        ...candidate.toObject(),
        matchPercentage,
        distanceMiles: distance.toFixed(2),
        distanceKm: (distance * 1.60934).toFixed(2),
        timestamp: candidate.createdAt,
        minSalary: survey.minSalary || 'N/A'
      });
    }

    console.log(`\n🎯 Total matches found: ${matches.length}`);
    res.json({ matches });

  } catch (err) {
    console.error('❌ Error finding matches:', err);
    res.status(500).json({ message: 'Server error finding matches', error: err.message, stack: err.stack });
  }
});













//////////////////////////////////////////////////////////////////////
////////////  EMPLOYER-POST //////////////////////////////////////////
//////////////////////////////////////////////////////////////////////

// 📄 GET: All job posts for employer
app.get('/api/employer-post', requireEmployer, async (req, res) => {
  console.log('Session user:', req.session.user);
  try {
    const employerId = req.session.user?.userId;
    if (!employerId) {
      console.log('Unauthorized: no employerId in session');
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const jobPosts = await JobPost.find({ employerId });

    // Get employer info (adjust based on your schema/model)
    const employer = await Employer.findById(employerId); // or User.findById()

    const employerName = employer?.companyName || employer?.name || 'Employer';

    res.json({ employerName, posts: jobPosts });
  } catch (err) {
    console.error('Error fetching job posts:', err);
    res.status(500).json({ message: 'Server error' });
  }
});


// 📄 GET: Specific job post by ID
app.get('/api/employer-post/:postId', requireEmployer, async (req, res) => {
  try {
    const employerId = req.session.user?.userId;
    if (!employerId) return res.status(401).json({ message: 'Unauthorized' });

    const { postId } = req.params;
    const post = await JobPost.findOne({ _id: postId, employerId });

    if (!post) return res.status(404).json({ message: 'Job post not found or unauthorized' });

    res.json(post);
  } catch (err) {
    console.error('❌ Error fetching job post:', err);
    res.status(500).json({ message: 'Server error' });
  }
});


// 📝 POST: Create a new job post
app.post('/api/employer-post', requireEmployer, async (req, res) => {
  try {
    console.log('📨 Creating new job post');
    console.log('📥 Request body:', req.body);
    console.log('👤 Session user:', req.session?.user);

    const employerId = req.session.user?.userId;
    if (!employerId) {
      console.warn('⚠️ No employerId in session');
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const {
      jobTitle,
      jobDescription,
      location,
      salary,
      requiredSkills,
      expectedQualifications,
      jobType // <-- ✅ include jobType
    } = req.body;

    // ✅ Validate jobType
    const validJobTypes = ['remote', 'hybrid', 'onsite'];
    if (!validJobTypes.includes(jobType)) {
      return res.status(400).json({ message: 'Invalid or missing jobType' });
    }

    if (!location || typeof location !== 'string') {
      console.error('❌ Missing or invalid location:', location);
      return res.status(400).json({ message: 'Missing or invalid location' });
    }

    const locationCoordinates = await geocodeLocation(location);
    console.log('📍 Geocoded location:', locationCoordinates);

    if (!locationCoordinates || typeof locationCoordinates.lat !== 'number' || typeof locationCoordinates.lng !== 'number') {
      console.error('❌ Geocode failed:', locationCoordinates);
      return res.status(400).json({ message: 'Failed to geocode location' });
    }

    const newPost = new JobPost({
      employerId,
      jobTitle,
      jobDescription,
      location,
      locationCoordinates,
      salary,
      requiredSkills,
      expectedQualifications,
      jobType // ✅ now it gets saved properly
    });

    await newPost.save();
    console.log('✅ Job post created:', newPost._id);

    res.status(201).json({ message: 'Job post created', postId: newPost._id });
  } catch (err) {
    console.error('❌ Error creating job post:', err);
    res.status(500).json({ message: 'Server error' });
  }
});




// JOB POSTS: DELETE - Delete a job post
app.delete('/api/employer-post/:postId', requireEmployer, async (req, res) => {
  try {
    const employerId = req.session.user?.userId;
    if (!employerId) return res.status(401).json({ message: 'Unauthorized' });

    const { postId } = req.params;
    const deleted = await JobPost.findOneAndDelete({ _id: postId, employerId });

    if (!deleted) return res.status(404).json({ message: 'Job post not found or unauthorized' });

    console.log(`🗑️ Deleted job post ${postId} for employer ${employerId}`);
    res.json({ message: 'Job post deleted' });
  } catch (err) {
    console.error('❌ Error deleting job post:', err);
    res.status(500).json({ message: 'Server error' });
  }
});


//////////////////////////////////////////////////////////////////////
////////////  SURVEY ////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////

app.post('/api/survey', requireLogin, async (req, res) => {
  try {
    const { jobTitles, minSalary, locations, jobType, excludeFilters } = req.body;
    const userEmail = req.session.user?.email;
    const userId = req.session.user?.userId || req.session.user?._id;

    console.log("🧠 Survey POST request received");
    console.log("📧 Session email:", userEmail);
    console.log("🆔 Session userId:", userId);

    if (!userEmail || !userId) {
      console.log("❌ Missing email or userId in session");
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (!Array.isArray(locations) || locations.length === 0) {
      console.log("❌ No valid locations provided");
      return res.status(400).json({ message: 'At least one location is required' });
    }

    // ✅ Ensure minSalary is a number
    const salary = parseInt(minSalary, 10);
    if (isNaN(salary)) {
      return res.status(400).json({ message: 'Invalid minSalary. Must be a number.' });
    }

    const locationCoordinates = [];
    for (const loc of locations) {
      if (!loc || loc.trim() === '' || loc.toLowerCase().includes('remote')) continue;

      try {
        const coords = await geocodeLocation(loc);
        locationCoordinates.push(coords);
        console.log(`📍 Geocoded ${loc}:`, coords);
      } catch (geoErr) {
        console.log(`❌ Geocoding failed for: ${loc}`);
        return res.status(400).json({ message: `Geocoding failed for location: ${loc}` });
      }
    }

    const newSurvey = new Survey({
      userId,
      email: userEmail,
      jobTitles,
      minSalary: salary,
      locations,
      locationCoordinates,
      jobType,
      excludeFilters
    });

    await newSurvey.save();
    console.log("✅ Survey saved:", newSurvey._id);

    const updatedResume = await Resume.findOneAndUpdate(
      { userId },
      { survey: newSurvey._id },
      { new: true }
    );

    if (!updatedResume) {
      console.log("⚠️ Resume not found for userId:", userId);
      return res.status(404).json({ message: 'Resume not found for user' });
    }

    console.log("🔗 Survey linked to resume ID:", updatedResume._id);

    res.status(200).json({
      message: 'Survey saved and linked to resume successfully',
      savedResumeId: updatedResume._id
    });

  } catch (err) {
    console.error('❌ Error saving survey:', err);
    res.status(500).json({ message: 'Server error saving survey' });
  }
});





//////////////////////////////////////////////////////////////////////
////////////  UPLOAD-RESUME //////////////////////////////////////////
//////////////////////////////////////////////////////////////////////


// GET: Fetch all resumes for the logged-in user
app.get('/api/upload-resume', async (req, res) => {
  try {
    console.log('🟢 GET /api/upload-resume called');
    if (!req.session?.user?.userId) {
      console.warn('🚫 No user session found during GET resumes');
      return res.status(401).json({ message: 'Unauthorized: No user session' });
    }

    const resumes = await Resume.find({ userId: req.session.user.userId });
    console.log(`📄 Fetched ${resumes.length} resumes for user ${req.session.user.userId}`);
    res.json(resumes);
  } catch (err) {
    console.error('❌ Error fetching resumes:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ✅ Alias GET: /api/resumes → returns same as /api/upload-resume
app.get('/api/resumes', async (req, res) => {
  try {
    console.log('🟢 GET /api/resumes called');
    if (!req.session?.user?.userId) {
      console.warn('🚫 No user session found during GET resumes alias');
      return res.status(401).json({ message: 'Unauthorized: No user session' });
    }

    const resumes = await Resume.find({ userId: req.session.user.userId });
    console.log(`📄 Fetched ${resumes.length} resumes for user ${req.session.user.userId}`);
    res.json(resumes);
  } catch (err) {
    console.error('❌ Error fetching resumes:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET: Fetch a single resume by ID
app.get('/api/upload-resume/download/:id', async (req, res) => {
  try {
    console.log(`🟢 GET /api/upload-resume/download/${req.params.id} called`);

    // Check user session
    if (!req.session?.user?.userId) {
      console.warn('🚫 No user session found during GET resume download');
      return res.status(401).json({ message: 'Unauthorized: No user session' });
    }

    const resume = await Resume.findById(req.params.id);
    if (!resume) {
      console.warn(`⚠️ Resume not found with ID ${req.params.id}`);
      return res.status(404).json({ message: 'Resume not found' });
    }

    // Authorization check: only resume owner allowed
    if (resume.userId.toString() !== req.session.user.userId) {
      console.warn(`🚫 Unauthorized access attempt to resume ${req.params.id}`);
      return res.status(403).json({ message: 'Unauthorized access' });
    }

    // Assume resume.filePath contains the absolute or relative path to the stored resume file
    if (!resume.filePath) {
      console.warn(`⚠️ Resume ${req.params.id} missing filePath`);
      return res.status(404).json({ message: 'Resume file not found' });
    }

    // Construct full path (adjust if needed)
    const resumeFilePath = path.isAbsolute(resume.filePath)
      ? resume.filePath
      : path.join(__dirname, resume.filePath);

    // Check if file exists
    if (!fs.existsSync(resumeFilePath)) {
      console.warn(`⚠️ Resume file missing at path: ${resumeFilePath}`);
      return res.status(404).json({ message: 'Resume file not found on server' });
    }

    // Set headers to trigger download in browser
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(resumeFilePath)}"`);
    res.setHeader('Content-Type', 'application/pdf');

    // Stream the file to response
    const fileStream = fs.createReadStream(resumeFilePath);
    fileStream.pipe(res);

    fileStream.on('error', (err) => {
      console.error('❌ File stream error:', err);
      res.status(500).end();
    });

  } catch (err) {
    console.error('❌ Error fetching resume file:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE: Delete a resume by ID
app.delete('/api/upload-resume/:id', async (req, res) => {
  try {
    console.log(`🟢 DELETE /api/upload-resume/${req.params.id} called`);
    if (!req.session?.user?.userId) {
      console.warn('🚫 No user session found during DELETE resume');
      return res.status(401).json({ message: 'Unauthorized: No user session' });
    }

    const deleted = await Resume.findOneAndDelete({
      _id: req.params.id,
      userId: req.session.user.userId,
    });

    if (!deleted) {
      console.warn(`⚠️ Resume not found for deletion with ID ${req.params.id}`);
      return res.status(404).json({ message: 'Resume not found' });
    }

    console.log(`🗑️ Resume ${req.params.id} deleted for user ${req.session.user.userId}`);
    res.status(200).json({ message: 'Resume deleted' });
  } catch (err) {
    console.error('❌ Error deleting resume:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST: Upload and parse a resume
// POST: Upload and parse a resume
app.post('/api/resume', upload.single('resume'), async (req, res) => {
  try {
    console.log('📥 Resume upload request received');

    if (!req.session?.user?.userId) {
      console.warn('🚫 Missing session userId. Session data:', req.session);
      return res.status(401).json({ message: 'Unauthorized: Missing session userId' });
    }

    console.log('👤 Uploading resume for user session:', req.session.user);

    if (!req.file) {
      return res.status(400).json({ message: 'No resume file uploaded' });
    }

    // Parse with Gemini
    const parsed = await parseResumeWithGemini(req.file.path);

    if (typeof parsed !== 'object' || parsed === null) {
      console.warn('⚠️ Gemini response was not valid JSON:', parsed);
      return res.status(500).json({ message: 'Gemini response was not valid JSON' });
    }

    console.log('🔍 Gemini Parsed Output:', JSON.stringify(parsed, null, 2));

    // Helpers to clean the data
    const cleanArray = (arr) => {
      if (!Array.isArray(arr)) return [];
      return arr.filter(item => {
        if (typeof item === 'string') return item.trim().length > 0;
        if (typeof item === 'object' && item !== null) return Object.keys(item).length > 0;
        return false;
      });
    };

    const cleanWorkExperience = (data) => {
      if (!Array.isArray(data)) return [];
      return data.map(entry => {
        if (!entry || typeof entry !== 'object') return null;
        const jobTitle = entry.jobTitle || entry['Job Title'] || entry.title || '';
        const company = entry.company || entry['Company'] || '';
        const duration = entry.duration || entry['Duration'] || entry.years || '';
        const responsibilities = entry.responsibilities || entry['Responsibilities'] || entry.description || '';
        const location = entry.location || entry['Location'] || '';
        const achievements = entry.achievements || entry['Achievements'] || [];
        if (!jobTitle && !company && !duration) return null;
        return {
          jobTitle,
          company,
          duration,
          jobDetails: {
            responsibilities,
            achievements: Array.isArray(achievements) ? achievements : [achievements],
            location,
            raw: entry
          }
        };
      }).filter(Boolean);
    };

    // Extract and clean fields
    const education = cleanArray(parsed.Education || parsed.education);
    const rawWorkExperience = cleanArray(parsed['Work Experience'] || parsed.workExperience);
    const workExperience = cleanWorkExperience(rawWorkExperience);
    const skills = cleanArray(parsed.Skills || parsed.skills);

    console.log('📚 Cleaned Education:', education);
    console.log('💼 Raw Work Experience:', rawWorkExperience);
    console.log('✅ Cleaned Work Experience:', workExperience);
    console.log('🛠️ Cleaned Skills:', skills);

    // Save to MongoDB
    const resume = new Resume({
      userId: req.session.user.userId,
      email: parsed.Email || 'N/A',
      fullName: parsed['Full Name'] || 'N/A',
      phoneNumber: parsed['Phone Number'] || 'N/A',
      education,
      workExperience,
      skills,
      originalName: req.file.originalname || 'unknown',
      fileName: req.file.filename || 'unknown',
      path: req.file.path || ''
    });

    await resume.save();

    console.log('📄 Resume saved successfully to MongoDB:', resume);

    res.status(201).json({ parsedResume: parsed, message: 'Resume uploaded successfully' });

  } catch (err) {
    console.error('❌ Resume upload error:', err);
    res.status(500).json({ message: 'Server error during resume upload' });
  } finally {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlink(req.file.path, err => {
        if (err) console.warn('⚠️ Failed to delete file:', err.message);
        else console.log('🧹 Temporary file deleted:', req.file.path);
      });
    }
  }
});




// GET: Render a resume as HTML
app.get('/resume-html/:id', async (req, res) => {
  try {
    if (!req.session?.user?.userId) {
      return res.status(401).send('Unauthorized');
    }

    const resume = await Resume.findById(req.params.id);
    if (!resume) return res.status(404).send('Resume not found');

    if (resume.userId.toString() !== req.session.user.userId) {
      return res.status(403).send('Forbidden');
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Resume of ${resume.fullName}</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: auto; padding: 2rem; line-height: 1.6; background: #fdfdfd; }
          h1, h2 { color: #222; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
          ul { padding-left: 20px; }
          .section { margin-bottom: 30px; }
        </style>
      </head>
      <body>
        <h1>${resume.fullName}</h1>
        <p><strong>Email:</strong> ${resume.email}</p>
        <p><strong>Phone:</strong> ${resume.phoneNumber}</p>

        <div class="section">
          <h2>Skills</h2>
          <ul>
            ${(resume.skills || []).map(skill => `<li>${skill}</li>`).join('')}
          </ul>
        </div>

        <div class="section">
          <h2>Education</h2>
          <ul>
            ${(resume.education || []).map(ed => `<li>${ed}</li>`).join('')}
          </ul>
        </div>

        <div class="section">
          <h2>Work Experience</h2>
          <ul>
            ${(resume.workExperience || []).map(job => `
              <li>
                <strong>${job.jobTitle}</strong> at ${job.company}<br />
                <em>${job.duration}</em><br />
                ${job.jobDetails?.responsibilities || ''}
              </li>
            `).join('')}
          </ul>
        </div>
      </body>
      </html>
    `;

    res.send(html);
  } catch (err) {
    console.error('❌ Error rendering resume as HTML:', err);
    res.status(500).send('Server error');
  }
});




//////////////////////////////////////////////////////////////////////
////////////  EULA-AGREEMENT //////////////////////////////////////////
//////////////////////////////////////////////////////////////////////

// ✅ Accept EULA
app.post('/api/eula-agreement', async (req, res) => {
  console.log('📩 Incoming POST /api/eula-agreement');

  if (!req.session?.user || !req.session.user.userId) {
    console.warn('❌ No valid session or user ID found for EULA agreement');
    return res.status(401).json({ message: 'Not logged in' });
  }

  try {
    const userId = req.session.user.userId;
    console.log(`🔍 Attempting to update EULA for user ID: ${userId}`);

    const user = await User.findByIdAndUpdate(
      userId,
      { agreedToEULA: true },
      { new: true }
    );

    if (!user) {
      console.warn(`❌ User with ID ${userId} not found`);
      return res.status(404).json({ message: 'User not found' });
    }

    console.log(`✅ EULA agreement recorded for user ${user._id}`);
    res.json({ message: 'EULA agreement recorded', role: user.role });
  } catch (err) {
    console.error('❌ Error updating EULA agreement:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ✅ Check if user agreed to EULA
app.get('/api/check-eula', async (req, res) => {
  console.log('📩 Incoming GET /api/check-eula');

  if (!req.session?.user || !req.session.user.userId) {
    console.warn('🔍 No session or user found for check-eula');
    return res.json({ agreed: false });
  }

  try {
    const userId = req.session.user.userId;
    const user = await User.findById(userId);

    const agreed = !!user?.agreedToEULA;
    console.log(`🧾 EULA status for user ${userId}: ${agreed}`);
    res.json({ agreed });
  } catch (err) {
    console.error('❌ Error checking EULA agreement:', err);
    res.status(500).json({ agreed: false });
  }
});

// ✅ Get current user session
app.get('/api/current-user', (req, res) => {
  console.log('📩 Incoming GET /api/current-user');

  if (req.session?.user) {
    console.log('👤 Current session user:', req.session.user);
    return res.json(req.session.user);
  } else {
    console.warn('❌ No active session found');
    return res.status(401).json({ message: 'No active session' });
  }
});


app.get('/test-insert', async (req, res) => {
  try {
    const testResume = new Resume({
      userId: 'test123',
      fullName: 'Debug Test',
      email: 'debug@example.com',
      phoneNumber: '123-456-7890',
      education: ['Debug University'],
      skills: ['Debugging', 'Logging'],
      workExperience: [{
        JobTitle: 'Debugger',
        Company: 'Debug Inc.',
        Duration: '1 year'
      }]
    });

    await testResume.save();
    console.log('✅ Test resume inserted:', testResume._id);
    res.send('✅ Test resume inserted successfully');
  } catch (err) {
    console.error('❌ Test insert failed:', err);
    res.status(500).send('Insert failed');
  }
});

// Your existing API routes above...

app.get('/test-write', async (req, res) => {
  try {
    const user = await User.create({
      email: "test@email.com",
      password: "1234",
      role: "employee",
      username: "testUser"
    });
    res.send(`Inserted: ${user._id}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Insert failed");
  }
});



app.get('/api/debug-session', (req, res) => {
  console.log('🐞 Session debug data:', req.session);
  res.json(req.session);
});


app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});
