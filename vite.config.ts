import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Plugin para manejar rutas API en desarrollo
function apiPlugin() {
  return {
    name: 'api-plugin',
    configureServer(server) {
      // Cargar variables de entorno
      const env = loadEnv(server.config.mode, process.cwd(), '');
      
      server.middlewares.use('/api/generate', async (req, res, next) => {
        if (req.method !== 'POST') {
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Method Not Allowed' }));
          return;
        }

        try {
          // Leer el cuerpo de la petición
          let body = '';
          req.on('data', chunk => {
            body += chunk.toString();
          });

          req.on('end', async () => {
            try {
              const { prompt, image, systemInstruction, isJson } = JSON.parse(body);
              
              // Validar prompt
              if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Prompt is required and must be a non-empty string' }));
                return;
              }

              // Obtener API Key desde variables de entorno (cargadas por Vite)
              const apiKey = env.GOOGLE_API_KEY || env.API_KEY || process.env.GOOGLE_API_KEY || process.env.API_KEY;

              if (!apiKey) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                  error: 'Server API Key not configured. Please set GOOGLE_API_KEY or API_KEY environment variable.' 
                }));
                return;
              }

              if (apiKey.length < 20) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid API Key format' }));
                return;
              }

              // Llamar a la API de Gemini
              const model = "gemini-1.5-flash";
              const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
              
              const contents = [];
              const parts = [];
              parts.push({ text: prompt });
              
              if (image) {
                parts.push({
                  inline_data: {
                    mime_type: "image/jpeg",
                    data: image
                  }
                });
              }
              
              contents.push({ parts });

              const body: any = {
                contents: contents,
                generationConfig: {
                  response_mime_type: isJson ? "application/json" : "text/plain"
                }
              };

              if (systemInstruction) {
                body.systemInstruction = {
                  parts: [{ text: systemInstruction }]
                };
              }

              const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
              });

              if (!response.ok) {
                let errorData;
                try {
                  errorData = await response.json();
                } catch {
                  errorData = { 
                    error: `API Error: ${response.status} ${response.statusText}`,
                    message: 'Failed to parse error response from Gemini API'
                  };
                }
                
                const statusCode = response.status === 401 ? 401 : response.status === 429 ? 429 : 500;
                res.writeHead(statusCode, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                  error: errorData.error || errorData.message || 'Error from Gemini API',
                  details: errorData 
                }));
                return;
              }

              const data = await response.json();

              if (!data.candidates || !Array.isArray(data.candidates) || data.candidates.length === 0) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                  error: 'Invalid response structure from Gemini API',
                  details: data 
                }));
                return;
              }

              const candidate = data.candidates[0];
              if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                  error: 'No content in Gemini API response',
                  details: data 
                }));
                return;
              }

              const text = candidate.content.parts[0]?.text || "";
              
              if (!text) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                  error: 'Empty response from Gemini API',
                  details: data 
                }));
                return;
              }

              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ text }));

            } catch (error) {
              console.error('API Error:', error);
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Internal Server Error' }));
            }
          });
        } catch (error) {
          console.error('Request parsing error:', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal Server Error' }));
        }
      });
    }
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    apiPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'Ideaverse AI',
        short_name: 'Ideaverse',
        description: 'Tu segundo cerebro potenciado por IA',
        theme_color: '#ffffff',
        background_color: '#f0f2f5',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
});
