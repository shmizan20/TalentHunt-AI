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

// Proxy endpoint for AI APIs (Gemini or OpenAI)
app.post('/api/analyze', async (req, res) => {
  const geminiKey = process.env.GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  
  if (!geminiKey && !openaiKey) {
    return res.status(500).json({ 
      error: { 
        message: 'No API Key configured in .env file. Please add GEMINI_API_KEY or OPENAI_API_KEY.' 
      } 
    });
  }

  try {
    const { contents, generationConfig, model } = req.body;

    // IF OPENAI KEY IS PRESENT, USE OPENAI
    if (openaiKey) {
      console.log('Using OpenAI API...');
      const modelName = 'gpt-4o'; // Default to gpt-4o for multimodal support
      const apiUrl = 'https://api.openai.com/v1/chat/completions';

      // Transform Gemini format to OpenAI format
      const prompt = contents[0].parts.find(p => p.text)?.text || '';
      const filePart = contents[0].parts.find(p => p.inline_data);
      
      const messages = [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt }
          ]
        }
      ];

      if (filePart) {
        const mimeType = filePart.inline_data.mime_type;
        const base64Data = filePart.inline_data.data;
        
        // OpenAI only supports images in chat completions (no multimodal PDF support yet)
        if (mimeType.startsWith('image/')) {
          messages[0].content.push({
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${base64Data}`
            }
          });
        } else {
          // For PDFs and other files, GPT-4o (Chat API) won't see them as files.
          // Note: In a real production app, we'd extract text here.
          console.warn(`Warning: OpenAI Chat API does not natively support ${mimeType} vision. Only images will work.`);
        }
      }

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiKey}`
        },
        body: JSON.stringify({
          model: modelName,
          messages,
          response_format: { type: 'json_object' },
          temperature: generationConfig?.temperature || 0.3
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        return res.status(response.status).json(data);
      }

      // Format OpenAI response to match Gemini structure so app.js doesn't break
      const choice = data.choices[0];
      const resultData = {
        candidates: [
          {
            content: {
              parts: [
                { text: choice.message.content }
              ]
            }
          }
        ]
      };

      return res.status(200).json(resultData);
    } 
    
    // FALLBACK TO GEMINI
    else {
      console.log('Using Gemini API...');
      const modelName = model || 'gemini-2.0-flash';
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiKey}`;

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
    }
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

