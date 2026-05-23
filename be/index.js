import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const modelsToTry = [
  { name: 'gemini-2.5-flash', version: 'v1beta' },
  { name: 'gemini-2.0-flash', version: 'v1beta' },
  { name: 'gemini-1.5-flash', version: 'v1beta' },
  { name: 'gemini-2.5-pro', version: 'v1beta' },
  { name: 'gemini-1.5-pro', version: 'v1beta' }
];

app.post('/api/chat', async (req, res) => {
  const requestBody = req.body;

  const keysToTry = [];
  if (process.env.GEMINI_API_KEY) keysToTry.push(process.env.GEMINI_API_KEY);
  if (process.env.GEMINI_API_KEY_BACKUP) keysToTry.push(process.env.GEMINI_API_KEY_BACKUP);

  if (keysToTry.length === 0) {
    return res.status(500).json({ error: { message: "No Gemini API Keys configured on backend." } });
  }

  let lastError = null;
  let succeeded = false;
  let responseData = null;
  let responseStatus = 500;

  for (let k = 0; k < keysToTry.length; k++) {
    const currentKey = keysToTry[k];

    for (let i = 0; i < modelsToTry.length; i++) {
      const m = modelsToTry[i];
      let attempts = 0;
      const maxAttempts = 3;

      while (attempts < maxAttempts) {
        try {
          const url = `https://generativelanguage.googleapis.com/${m.version}/models/${m.name}:generateContent?key=${currentKey}`;
          const apiRes = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
          });

          if (apiRes.ok) {
            const data = await apiRes.json();
            responseData = data;
            succeeded = true;
            console.log(`Successfully generated content using model: ${m.name} (${m.version}) with Key index ${k}`);
            break;
          } else {
            const errData = await apiRes.json().catch(() => ({}));
            const errMsg = errData.error?.message || `Model ${m.name} returned error (Status ${apiRes.status})`;
            console.warn(`Model ${m.name} (${m.version}) attempt ${attempts + 1} with Key index ${k} failed: ${errMsg}`);

            if (apiRes.status === 429 && attempts < maxAttempts - 1) {
              console.log(`Rate limited (429) on ${m.name}. Retrying in 1.5 seconds...`);
              await new Promise(resolve => setTimeout(resolve, 1500));
              attempts++;
              continue;
            }

            lastError = new Error(errMsg);
            responseStatus = apiRes.status;
            break;
          }
        } catch (err) {
          console.warn(`Fetch error for model ${m.name} (${m.version}) with Key index ${k}:`, err);
          lastError = err;
          break;
        }
      }

      if (succeeded) break;
    }

    if (succeeded) break;
  }

  if (succeeded) {
    return res.json(responseData);
  } else {
    return res.status(responseStatus || 500).json({
      error: {
        message: lastError ? lastError.message : "Failed to connect to Gemini API."
      }
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
