const fs = require('fs');
const pdfParse = require('pdf-parse');
const axios = require('axios');
const Resume = require('../models/Resume');

const geminiApiKey = process.env.GEMINI_API_KEY;

async function parseResumeWithGemini(filePath) {
  const dataBuffer = fs.readFileSync(filePath);
  const data = await pdfParse(dataBuffer);
  const text = data.text;

  const endpoint = `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;
  const prompt = `
You are a professional resume parser. Extract ONLY the following fields from the resume and return valid JSON:

- Full Name (string)
- Email (string)
- Phone Number (string)
- Education (array of strings)
- Skills (array of strings)
- Work Experience (array of objects with keys: "Job Title", "Company", "Duration")

Respond in ONLY this JSON format, no markdown or extra explanation.

Resume:
${text}
`;

  const response = await axios.post(
    endpoint,
    { contents: [{ parts: [{ text: prompt }] }] },
    { headers: { 'Content-Type': 'application/json' } }
  );

  const output = response.data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!output) throw new Error('Gemini did not return valid content');
  return output;
}

exports.handleResumeUpload = async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'No resume file uploaded.' });

  try {
    if (!req.session?.user?.userId) {
      return res.status(401).json({ error: 'Unauthorized: Missing user session' });
    }

    const rawText = await parseResumeWithGemini(file.path);

    let parsed = rawText.trim().replace(/```json\s*|```/g, '').trim();
    parsed = JSON.parse(parsed);

    const validatedData = {
      fullName: parsed['Full Name'] || 'N/A',
      email: parsed['Email'] || 'N/A',
      phoneNumber: parsed['Phone Number'] || 'N/A',
      education: Array.isArray(parsed['Education']) ? parsed['Education'] : [],
      skills: Array.isArray(parsed['Skills']) ? parsed['Skills'] : [],
      workExperience: Array.isArray(parsed['Work Experience'])
        ? parsed['Work Experience'].map(exp => ({
            jobTitle: exp['Job Title'] || 'N/A',
            company: exp['Company'] || 'N/A',
            duration: exp['Duration'] || 'N/A',
          }))
        : [],

      fileName: file.filename,
      originalName: file.originalname,
      filePath: `/uploads/${file.filename}`,
      userId: req.session.user.userId,
    };

    const resume = new Resume(validatedData);
    await resume.save();

    res.status(200).json({ parsedResume: validatedData });
  } catch (err) {
    console.error('❌ Error processing resume:', err.message || err);
    res.status(500).json({ error: 'Failed to parse and save resume.' });
  } finally {
    if (file && fs.existsSync(file.path)) {
      fs.unlink(file.path, err => {
        if (err) console.warn('⚠️ Failed to delete file:', err.message);
      });
    }
  }
};
