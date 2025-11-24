import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// Plugin para manejar rutas API en desarrollo
function apiPlugin() {
  return {
    name: 'api-plugin',
    configureServer(server) {
      server.middlewares.use('/api/generate', async (req, res, next) => {
        // Cargar variables de entorno dentro del middleware para asegurar que se carguen correctamente
        const env = loadEnv(server.config.mode, process.cwd(), '');

        // Función auxiliar para leer .env.local directamente si loadEnv no funciona
        const getApiKey = () => {
          // Primero intentar con loadEnv
          let apiKey = env.GOOGLE_API_KEY || env.API_KEY || env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY;

          if (apiKey) {
            console.log('[API Plugin] API Key encontrada via loadEnv');
            return apiKey;
          }

          // Si no funciona, leer .env.local directamente
          const cwd = process.cwd();
          const envLocalPath = resolve(cwd, '.env.local');

          if (existsSync(envLocalPath)) {
            try {
              const envContent = readFileSync(envLocalPath, 'utf-8');
              const lines = envContent.split('\n');
              for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed && !trimmed.startsWith('#')) {
                  const match = trimmed.match(/^(?:GOOGLE_API_KEY|API_KEY|VITE_GEMINI_API_KEY|GEMINI_API_KEY)=(.+)$/);
                  if (match) {
                    apiKey = match[1].trim().replace(/^["']|["']$/g, ''); // Remover comillas si las hay
                    if (apiKey) {
                      console.log('[API Plugin] API Key encontrada en .env.local');
                      return apiKey;
                    }
                  }
                }
              }
            } catch (err) {
              console.error('[API Plugin] Error reading .env.local:', err);
            }
          } else {
            console.log('[API Plugin] .env.local no encontrado en:', envLocalPath);
          }

          // Último recurso: process.env
          apiKey = process.env.GOOGLE_API_KEY || process.env.API_KEY || process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
          if (apiKey) {
            console.log('[API Plugin] API Key encontrada en process.env');
            return apiKey;
          }

          console.error('[API Plugin] API Key NO encontrada en ningún lugar');
          return null;
        };

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
              console.log('[API Plugin] Request body recibido, parseando JSON...');
              let parsedBody;
              try {
                parsedBody = JSON.parse(body);
              } catch (parseError) {
                console.error('[API Plugin] Error parseando JSON del body:', parseError);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid JSON in request body', details: String(parseError) }));
                return;
              }

              const { prompt, image, systemInstruction, isJson } = parsedBody;
              console.log('[API Plugin] Body parseado correctamente. Prompt length:', prompt?.length || 0);

              // Validar prompt
              if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Prompt is required and must be a non-empty string' }));
                return;
              }

              // Obtener API Key usando la función auxiliar
              console.log('[API Plugin] Obteniendo API Key...');
              const apiKey = getApiKey();

              if (!apiKey) {
                console.error('API Key not found. Checked:', {
                  env: Object.keys(env).filter(k => k.includes('API') || k.includes('KEY')),
                  processEnv: Object.keys(process.env).filter(k => k.includes('API') || k.includes('KEY')),
                  envLocalExists: existsSync(process.cwd() + '/.env.local')
                });
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  error: 'Server API Key not configured. Please set GOOGLE_API_KEY, API_KEY, VITE_GEMINI_API_KEY, or GEMINI_API_KEY in .env.local'
                }));
                return;
              }

              if (apiKey.length < 20) {
                console.error('[API Plugin] API Key demasiado corta:', apiKey.length);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid API Key format' }));
                return;
              }

              console.log('[API Plugin] API Key válida. Preparando petición a Gemini...');

              const contents = [];
              const parts = [];

              // Si hay systemInstruction, lo agregamos al inicio del prompt para simularlo en v1
              let finalPrompt = prompt;
              if (systemInstruction) {
                finalPrompt = `System Instruction: ${systemInstruction}\n\nUser Request: ${prompt}`;
                console.log('[API Plugin] System Instruction merged into prompt for V1 compatibility');
              }

              parts.push({ text: finalPrompt });

              if (image) {
                parts.push({
                  inline_data: {
                    mime_type: "image/jpeg",
                    data: image
                  }
                });
              }

              contents.push({ parts });

              const requestBody: any = {
                contents: contents
              };

              // Usamos v1beta para soporte de modelos más recientes como gemini-2.0-flash
              const apiVersion = 'v1beta';
              const model = 'gemini-2.0-flash';
              const apiUrl = `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent?key=${apiKey}`;

              console.log('[API Plugin] API Version:', apiVersion);
              console.log('[API Plugin] Model:', model);
              console.log('[API Plugin] URL de API:', apiUrl.replace(apiKey, 'API_KEY_HIDDEN'));

              console.log('[API Plugin] Enviando petición a Gemini API...');
              let response;
              try {
                response = await fetch(apiUrl, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify(requestBody)
                });
                console.log('[API Plugin] Respuesta recibida, status:', response.status);
              } catch (fetchError: any) {
                console.error('[API Plugin] Error en fetch:', fetchError);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  error: 'Network error calling Gemini API',
                  message: fetchError?.message || String(fetchError)
                }));
                return;
              }

              if (!response.ok) {
                let errorData;
                try {
                  errorData = await response.json();
                } catch {
                  const text = await response.text();
                  errorData = {
                    error: `API Error: ${response.status} ${response.statusText}`,
                    message: 'Failed to parse error response from Gemini API',
                    rawResponse: text.substring(0, 500) // Primeros 500 caracteres
                  };
                }

                console.error('[API Plugin] Error de Gemini API:', {
                  status: response.status,
                  statusText: response.statusText,
                  errorData
                });

                // Si es 404, intentar con diferentes variantes del modelo
                if (response.status === 404) {
                  console.log('[API Plugin] Modelo no encontrado, intentando alternativas...');

                  let success = false;

                  // Fallback simplificado para v1
                  const alternatives = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro"];

                  for (const altModel of alternatives) {
                    console.log(`[API Plugin] Intentando con modelo alternativo v1: ${altModel}...`);
                    const altUrl = `https://generativelanguage.googleapis.com/v1/models/${altModel}:generateContent?key=${apiKey}`;
                    try {
                      const altResponse = await fetch(altUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(requestBody)
                      });

                      if (altResponse.ok) {
                        console.log(`[API Plugin] Éxito con modelo alternativo: ${altModel}`);
                        response = altResponse;
                        success = true;
                        break;
                      } else {
                        console.log(`[API Plugin] Modelo ${altModel} falló con status: ${altResponse.status}`);
                      }
                    } catch (altError) {
                      console.log(`[API Plugin] Error con modelo ${altModel}:`, altError);
                    }
                  }

                  if (!success) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                      error: `Model ${model} not found for API version ${apiVersion}.`,
                      apiVersion: apiVersion,
                      attemptedModel: model,
                      details: errorData,
                      suggestion: 'Verify your API key has access to Gemini models. Try updating to latest Gemini models.'
                    }));
                    return;
                  }
                } else {
                  const statusCode = response.status === 401 ? 401 : response.status === 429 ? 429 : 500;
                  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({
                    error: errorData.error || errorData.message || 'Error from Gemini API',
                    details: errorData
                  }));
                  return;
                }
              }

              console.log('[API Plugin] Parseando respuesta JSON...');
              let data;
              try {
                data = await response.json();
                console.log('[API Plugin] Respuesta parseada correctamente');
              } catch (jsonError: any) {
                console.error('[API Plugin] Error parseando respuesta JSON:', jsonError);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  error: 'Invalid JSON response from Gemini API',
                  message: jsonError?.message || String(jsonError)
                }));
                return;
              }

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

              console.log('[API Plugin] Respuesta exitosa, enviando al cliente...');
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ text }));

            } catch (error: any) {
              console.error('API Error:', error);
              const errorMessage = error?.message || String(error);
              const errorStack = error?.stack || '';
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                error: 'Internal Server Error',
                message: errorMessage,
                stack: process.env.NODE_ENV === 'development' ? errorStack : undefined
              }));
            }
          });
        } catch (error: any) {
          console.error('Request parsing error:', error);
          const errorMessage = error?.message || String(error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: 'Internal Server Error',
            message: errorMessage
          }));
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
