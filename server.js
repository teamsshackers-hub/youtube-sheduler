require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { google } = require('googleapis');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ dest: 'uploads/' });
const scheduledVideos = [];

const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.REDIRECT_URI
);

// Auth URL
app.get('/auth', (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/youtube.upload']
  });
  res.redirect(url);
});

// Auth Callback
app.get('/auth/callback', async (req, res) => {
  const { code } = req.query;
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  fs.writeFileSync('tokens.json', JSON.stringify(tokens));
  res.send('Login successful! App band karo aur wapas jao.');
});

// Upload Video
app.post('/schedule', upload.single('video'), (req, res) => {
  const { title, description, scheduleTime, privacy } = req.body;
  const videoPath = req.file.path;

  scheduledVideos.push({
    id: Date.now(),
    title, description, scheduleTime,
    privacy: privacy || 'public',
    videoPath, status: 'scheduled'
  });

  res.json({ success: true, message: 'Video scheduled!' });
});

// Get all videos
app.get('/videos', (req, res) => {
  res.json(scheduledVideos);
});

// Cron job - har minute check karo
cron.schedule('* * * * *', async () => {
  const now = new Date();

  for (const video of scheduledVideos) {
    if (video.status !== 'scheduled') continue;
    if (new Date(video.scheduleTime) > now) continue;

    try {
      if (fs.existsSync('tokens.json')) {
        const tokens = JSON.parse(fs.readFileSync('tokens.json'));
        oauth2Client.setCredentials(tokens);
      }

      const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

      await youtube.videos.insert({
        part: ['snippet', 'status'],
        requestBody: {
          snippet: { title: video.title, description: video.description },
          status: { privacyStatus: video.privacy }
        },
        media: {
          body: fs.createReadStream(video.videoPath)
        }
      });

      video.status = 'published';
      console.log(`Published: ${video.title}`);
    } catch (err) {
      video.status = 'failed';
      console.error(err.message);
    }
  }
});

app.listen(3000, () => console.log('Server running on port 3000'));
