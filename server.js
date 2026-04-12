const express = require('express');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON bodies
app.use(express.json({ limit: '50mb' }));

// Serve static files from the root directory
app.use(express.static(path.join(__dirname)));

// Proxy endpoint for Gemini API
app.post('/api/analyze', async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey || apiKey === 'your_api_key_here') {
    return res.status(500).json({ 
      error: { 
        message: 'API Key not configured in .env file. Please add your GEMINI_API_KEY to the .env file.' 
      } 
    });
  }

  try {
    const { contents, generationConfig, model } = req.body;
    const modelName = model || 'gemini-2.0-flash';
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ contents, generationConfig }),
    });

    const data = await response.json();
    
    if (!response.ok) {
        return res.status(response.status).json(data);
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error('Local Proxy Error:', error);
    return res.status(500).json({ error: { message: 'Internal Server Error: ' + error.message } });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`\n🚀 TalentHunt AI is running locally at: http://localhost:${PORT}`);
  console.log(`Backend proxy is active and secure.\n`);
});
