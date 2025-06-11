const Employer = require('../models/Employer');
const Resume = require('../models/Resume');
const Survey = require('../models/Survey');

const { geocodeLocation, haversineDistance } = require('../utils/geoHelpers');

console.log('📥 Received POST body:', req.body);
exports.postEmployer = async (req, res) => {
  try {
    const { companyName, jobTitle, jobDescription, preferredSkills, location, email, expectedQualifications } = req.body;

    const cleanedSkills = Array.isArray(preferredSkills)
      ? preferredSkills.map(s => s.trim())
      : [];

    const coords = await geocodeLocation(location);

    const employer = new Employer({
      companyName,
      jobTitle,
      jobDescription,
      requiredSkills: cleanedSkills,
      location,
      locationCoordinates: coords || null,
      email,
      expectedQualifications: Array.isArray(expectedQualifications) && expectedQualifications.length > 0
        ? expectedQualifications
        : cleanedSkills
    });

    await employer.save();
    res.status(201).json({ message: 'Employer preferences saved!' });
  } catch (error) {
    console.error('❌ Error saving employer:', error);
    res.status(500).json({ error: 'Failed to save employer.' });
  }
};

exports.getMatches = async (req, res) => {
  const employerEmail = req.query.employerEmail;
  if (!employerEmail) {
    return res.status(400).json({ message: 'Missing employerEmail in query' });
  }

  try {
    const employer = await Employer.findOne({ email: employerEmail });
    if (!employer) {
      return res.status(404).json({ message: 'Employer not found' });
    }

    const expectedQualifications = Array.isArray(employer.expectedQualifications) ? employer.expectedQualifications : [];
    if (expectedQualifications.length === 0) {
      return res.status(400).json({ message: 'Expected qualifications are empty.' });
    }

    const resumes = await Resume.find();
    const surveys = await Survey.find();

    const employerGeo = await geocodeLocation(employer.location);
    if (!employerGeo) {
      return res.status(500).json({ message: 'Failed to geocode employer location.' });
    }

    const employees = resumes.map(resume => {
      const survey = surveys.find(s => s.email === resume.email);
      return survey ? { resume, survey } : null;
    }).filter(Boolean);

    const matchedEmployees = employees.map(({ resume, survey }) => {
      const candidateSkills = Array.isArray(resume.skills) ? resume.skills : [];

      const matchedSkills = candidateSkills.filter(skill =>
        expectedQualifications.includes(skill)
      );

      const matchPercentage = expectedQualifications.length > 0
        ? (matchedSkills.length / expectedQualifications.length) * 100
        : 0;

      const employeeLat = survey.locationCoordinates?.[0]?.lat;
      const employeeLng = survey.locationCoordinates?.[0]?.lng;

      const distance = (typeof employeeLat === 'number' && typeof employeeLng === 'number')
        ? haversineDistance(employerGeo.lat, employerGeo.lng, employeeLat, employeeLng)
        : Infinity;

      return {
        email: resume.email,
        name: resume.fullName,
        matchPercentage,
        distance,
        skills: candidateSkills,
        location: { lat: employeeLat, lng: employeeLng }
      };
    }).filter(emp => emp.matchPercentage >= 90);

    res.json(matchedEmployees);
  } catch (error) {
    console.error('❌ Error matching resumes:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.clearEmployers = async (req, res) => {
  try {
    await Employer.deleteMany({});
    res.json({ message: 'All employer entries deleted.' });
  } catch (error) {
    console.error('❌ Error clearing employers:', error);
    res.status(500).json({ error: 'Failed to delete employer entries.' });
  }
};
