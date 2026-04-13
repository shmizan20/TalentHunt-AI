
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  
  if (!geminiKey && !openaiKey) {
    return res.status(500).json({ error: 'API Key not configured in environment variables' });
  }

  try {
    const { contents, generationConfig, model } = req.body;
    
    // IF OPENAI KEY IS PRESENT, USE OPENAI
    if (openaiKey) {
      const modelName = 'gpt-4o';
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
        
        if (mimeType.startsWith('image/')) {
          messages[0].content.push({
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${base64Data}`
            }
          });
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

      // Format OpenAI response to match Gemini structure
      const resultData = {
        candidates: [
          {
            content: {
              parts: [
                { text: data.choices[0].message.content }
              ]
            }
          }
        ]
      };

      return res.status(200).json(resultData);
    } 
    
    // FALLBACK TO GEMINI
    else {
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
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Failed to process request: ' + error.message });
  }
}
