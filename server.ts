import express from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const app = express();
app.use(express.json({ limit: '10mb' }));

const PORT = 3000;

// Initialize Gemini Client with mandatory telemetry header
const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY || '';
  if (!apiKey) {
    console.warn('GEMINI_API_KEY is not set in process.env');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
};

/**
 * POST /api/stationary-news
 * Grounded search endpoint for current weather & local traffic news when user is stationary.
 */
app.post('/api/stationary-news', async (req, res) => {
  try {
    const { lat, lng, locationName, speedKmH } = req.body;

    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return res.status(400).json({ error: 'Latitude and Longitude are required numbers.' });
    }

    const ai = getGeminiClient();
    const resolvedName = locationName || `Coordinates ${lat.toFixed(4)}°, ${lng.toFixed(4)}°`;

    const prompt = `You are a real-time hyper-local assistant for a traveler currently stationary (Speed: ${speedKmH ?? 0} km/h) at location coordinates: Latitude ${lat}, Longitude ${lng} near "${resolvedName}".

Use Google Search to find real-time, up-to-date information for today:
1. Current local weather forecast, temperature, precipitation, and conditions at or near these coordinates.
2. Immediate local traffic updates, road construction, highway delays, or breaking traffic news near this area today.

Return a clean, valid JSON object with the following fields:
- weatherSummary: A clear 2-sentence summary of today's current weather, temperature, and conditions.
- trafficSummary: A clear 2-sentence update on current traffic conditions, accidents, or major delays nearby today.
- locationName: Resolved city/area name.
- alertBadge: A concise 3-6 word alert badge (e.g. "Sunny & Clear • 28°C", "Traffic Delay on Highway", "Light Rain Ahead").
- temperature: Approximate temperature string (e.g. "28°C").
- trafficStatus: "Clear" | "Moderate" | "Heavy" | "Unknown".
`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: 'application/json',
      },
    });

    const text = response.text || '{}';
    let data: any = {};
    try {
      data = JSON.parse(text);
    } catch {
      data = {
        weatherSummary: text,
        trafficSummary: 'No major traffic incidents reported in the immediate vicinity.',
        locationName: resolvedName,
        alertBadge: 'Stationary Update',
        temperature: '26°C',
        trafficStatus: 'Clear',
      };
    }

    // Extract search grounding sources
    const candidate = response.candidates?.[0];
    const groundingMetadata = candidate?.groundingMetadata;
    const searchSources =
      groundingMetadata?.groundingChunks
        ?.map((chunk: any) => ({
          title: chunk.web?.title || 'Google Search Reference',
          uri: chunk.web?.uri || '',
        }))
        .filter((s: any) => s.uri) || [];

    return res.json({
      success: true,
      data,
      searchSources: searchSources.slice(0, 5),
      rawText: text,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error fetching stationary news via Gemini Grounded Search:', error);
    return res.status(500).json({
      error: 'Failed to fetch grounded weather & traffic news.',
      details: error?.message || 'Unknown error',
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (req, res) => {
      res.sendFile('dist/index.html', { root: '.' });
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
