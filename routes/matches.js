const express = require('express');
const router = express.Router();
const Employer = require('../models/Employer');
let Employee;

try {
  Employee = require('../models/Employee');
} catch (err) {
  console.error("❌ Failed to load Employee model:", err);
}

// --- GET: Diagnostic Match Endpoint ---
router.get("/api/matches", async (req, res) => {
  console.log("🔥 /api/matches endpoint hit");

  try {
    const { employerEmail } = req.query;

    if (!employerEmail) {
      return res.status(400).json({ message: "Missing employerEmail in query" });
    }

    const employer = await Employer.findOne({ email: employerEmail });
    if (!employer) {
      return res.status(404).json({ message: "Employer not found" });
    }

    console.log("✅ Employer found:", employer);
    console.log("📌 Employer expected qualifications:", employer.expectedQualifications);
    console.log("📌 Employer skills:", employer.skills);

    const employees = await Employee.find();
    const matches = [];

    for (const resume of employees) {
      const resumeSkills = resume.skills || [];
      const employerSkills = employer.expectedQualifications || employer.skills || [];

      const matchedSkills = resumeSkills.filter(skill =>
        employerSkills.some(eq =>
          eq.toLowerCase().trim() === skill.toLowerCase().trim()
        )
      );

      const matchScore = Math.round((matchedSkills.length / employerSkills.length) * 100);

      console.log("Expected:", employerSkills);
      console.log("Resume Skills:", resumeSkills);
      console.log("Matched Skills:", matchedSkills);

      if (matchScore >= 90) {
        matches.push({
          name: resume.fullName || resume.username,
          email: resume.email,
          phoneNumber: resume.phoneNumber,
          education: resume.education,
          skills: resume.skills,
          workExperience: resume.workExperience,
          score: matchScore
        });
      }
    }

    res.json({ matches });

  } catch (error) {
    console.error("❌ Error fetching matches:", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// --- POST: Get Matches Based on Resume and Score ---
router.post("/get-matches", async (req, res) => {
  console.log("🚀 /get-matches endpoint hit");

  const { minScore = 0 } = req.body;

  try {
    const employees = await Employee.find();
    const matches = [];

    for (const resume of employees) {
      let matchScore = 0;

      if (resume.skills && resume.skills.length > 0) {
        matchScore += Math.min(resume.skills.length * 5, 100);
      }

      if (matchScore >= minScore) {
        matches.push({
          name: resume.fullName || resume.username,
          email: resume.email,
          phoneNumber: resume.phoneNumber,
          education: resume.education,
          skills: resume.skills,
          workExperience: resume.workExperience,
          score: matchScore
        });
      }
    }

    console.log(`✅ Returning ${matches.length} matches`);
    res.json(matches);

  } catch (err) {
    console.error("❌ Error in /get-matches:", err.message);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

module.exports = router;
