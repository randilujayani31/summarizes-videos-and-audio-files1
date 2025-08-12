require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');

const app = express();
const PORT = 5000;

// Middleware
app.use(cors());
app.use(express.json());

// OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); // make sure this folder exists
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `audio-${Date.now()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // limit to 100MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/m4a', 'audio/webm'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported audio format'));
    }
  },
});

// Route: Summarize
app.post('/summarize', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const audioPath = req.file.path;

  try {
    // 1. Transcribe
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(audioPath),
      model: 'whisper-1',
    });

    const transcriptText = transcription.text;

    // 2. Summarize
    const summaryResponse = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You summarize meeting transcripts clearly and identify key points and action items.',
        },
        {
          role: 'user',
          content: `Transcript: ${transcriptText}\n\nSummarize the meeting and list the key points and action items.`,
        },
      ],
    });

    const summaryText = summaryResponse.choices[0].message.content;

    // 3. Cleanup
    fs.unlink(audioPath, (err) => {
      if (err) console.error('File cleanup error:', err);
    });

    // 4. Send result
    res.json({
      transcript: transcriptText,
      summary: summaryText,
    });

  } catch (err) {
    console.error('Error in summarization:', err.response?.data || err.message || err);
    res.status(500).json({ error: 'Summarization failed' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
