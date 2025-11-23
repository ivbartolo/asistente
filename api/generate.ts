// Import removed - using direct REST API calls for Edge compatibility

export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  // Logging inicial para verificar que la función se ejecuta
  console.log('[API] Función /api/generate llamada');
  console.log('[API] Método:', req.method);
  console.log('[API] URL:', req.url);

  if (req.method !== 'POST') {
    console.log('[API] Método no permitido:', req.method);
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    console.log('[API] Parseando body de la petición...');
    const { prompt, image, systemInstruction, isJson } = await req.json();
    console.log('[API] Body parseado. Prompt length:', prompt?.length || 0);

    // Validar que el prompt existe
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'Prompt is required and must be a non-empty string' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Buscar API Key en este orden (soporta múltiples nombres)
    // NOTA: En Vercel Edge Functions, NO usar VITE_* (solo para frontend)
    console.log('[API] Buscando API Key en variables de entorno...');
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.API_KEY;

    // Debug: mostrar qué variables están disponibles (sin mostrar valores)
    const envKeys = Object.keys(process.env).filter(k =>
      k.includes('API') || k.includes('KEY') || k.includes('GEMINI') || k.includes('GOOGLE')
    );
    console.log('[API] Variables de entorno relacionadas encontradas:', envKeys);
    console.log('[API] GEMINI_API_KEY existe:', !!process.env.GEMINI_API_KEY);
    console.log('[API] GOOGLE_API_KEY existe:', !!process.env.GOOGLE_API_KEY);
    console.log('[API] API_KEY existe:', !!process.env.API_KEY);

    if (!apiKey) {
      console.error('[API] ❌ API Key NO encontrada');
      console.error('[API] Variables disponibles con API/KEY:', envKeys);
      return new Response(JSON.stringify({
        error: 'Server API Key not configured. Please set GEMINI_API_KEY, GOOGLE_API_KEY, or API_KEY environment variable in Vercel.',
        hint: 'Check Settings → Environment Variables in your Vercel project',
        availableEnvVars: envKeys
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log('[API] ✅ API Key encontrada, longitud:', apiKey.length);
    console.log('[API] API Key empieza con:', apiKey.substring(0, 10) + '...');

    // Validar formato de API Key (simple check)
    if (apiKey.length < 20) {
      console.error('[API] API Key demasiado corta:', apiKey.length);
      return new Response(JSON.stringify({ error: 'Invalid API Key format' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Limpiar API Key de posibles espacios o comillas accidentales (común en Vercel)
    const cleanApiKey = apiKey.trim().replace(/^["']|["']$/g, '');

    console.log('[API] API Key válida (sanitized). Preparando petición a Gemini...');

    // Configuración del modelo
    // Usamos gemini-2.0-flash-exp (modelo experimental más reciente)
    const model = "gemini-2.0-flash-exp";
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cleanApiKey}`;

    console.log('[API] Modelo:', model);
    console.log('[API] URL (sin key):', apiUrl.replace(cleanApiKey, 'API_KEY_HIDDEN'));

    // Construir el body para la API de Gemini
    const contents = [];
    const parts = [];

    // Si hay systemInstruction, lo agregamos al inicio del prompt para simularlo en v1
    // Esto evita problemas de compatibilidad con v1beta
    let finalPrompt = prompt;
    if (systemInstruction) {
      finalPrompt = `System Instruction: ${systemInstruction}\n\nUser Request: ${prompt}`;
      console.log('[API] System Instruction merged into prompt for V1 compatibility');
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

    // NOTA: response_mime_type removido temporalmente porque causa 400 en todos los modelos
    // Esto puede ser una limitación de la API key o región
    // El cliente puede parsear JSON desde texto plano de todas formas

    console.log('[API] Enviando petición a Gemini API...');
    let response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    console.log('[API] Respuesta de Gemini, status:', response.status, response.statusText);

    // Si es 404 o 400 (Bad Request, posible modelo inválido), intentar con modelos alternativos
    if (!response.ok && (response.status === 404 || response.status === 400)) {
      console.log(`[API] Error ${response.status} con modelo principal. Intentando alternativas...`);
      const modelAlternatives = [
        "gemini-1.5-flash",
        "gemini-1.5-pro"
      ];

      let success = false; // Initialize success flag
      for (const altModel of modelAlternatives) {
        if (altModel === model) continue;

        console.log(`[API] Intentando con modelo alternativo: ${altModel}...`);
        const altUrl = `https://generativelanguage.googleapis.com/v1beta/models/${altModel}:generateContent?key=${cleanApiKey}`;
        try {
          const altResponse = await fetch(altUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
          });

          if (altResponse.ok) {
            console.log(`[API] Éxito con modelo alternativo: ${altModel}`);
            response = altResponse;
            success = true; // Set success to true
            break;
          } else {
            console.log(`[API] Modelo ${altModel} falló con status: ${altResponse.status}`);
          }
        } catch (altError) {
          console.log(`[API] Error con modelo ${altModel}:`, altError);
        }
      }

      // Si todos los modelos alternativos fallaron, loguear y devolver error
      if (!success) {
        try {
          const errorText = await response.text();
          console.error('[API] FAT AL: Todos los modelos fallaron. Respuesta:', errorText.substring(0, 500));
          return new Response(JSON.stringify({
            error: `Model ${model} not supported. Tried alternatives: ${modelAlternatives.join(', ')}`,
            details: errorText.substring(0, 200),
            suggestion: 'Verify your API key has access to Gemini models'
          }), {
            status: response.status,
            headers: { 'Content-Type': 'application/json' }
          });
        } catch {
          return new Response(JSON.stringify({
            error: `Model ${model} not supported. Tried alternatives: ${modelAlternatives.join(', ')}`,
            suggestion: 'Verify your API key has access to Gemini models'
          }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
    }

    // Manejar otros errores de respuesta
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

      // Mensajes de error más descriptivos
      if (response.status === 401) {
        return new Response(JSON.stringify({
          error: 'Invalid API Key. Please check your GEMINI_API_KEY or GOOGLE_API_KEY environment variable in Vercel.'
        }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (response.status === 429) {
        return new Response(JSON.stringify({
          error: '⏱️ Límite de solicitudes excedido',
          message: 'Tu API Key ha alcanzado el límite de requests por minuto. Por favor espera 60 segundos antes de intentar de nuevo.',
          suggestion: 'Si esto ocurre frecuentemente, considera actualizar tu plan en Google AI Studio para obtener límites más altos.'
        }), {
          status: 429,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({
        error: errorData.error || errorData.message || 'Error from Gemini API',
        details: errorData
      }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Parsear respuesta exitosa
    let data;
    try {
      data = await response.json();
    } catch (parseError) {
      return new Response(JSON.stringify({
        error: 'Invalid JSON response from Gemini API'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validar estructura de respuesta
    if (!data.candidates || !Array.isArray(data.candidates) || data.candidates.length === 0) {
      return new Response(JSON.stringify({
        error: 'Invalid response structure from Gemini API',
        details: data
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Extraer el texto de la respuesta de Gemini
    const candidate = data.candidates[0];
    if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
      return new Response(JSON.stringify({
        error: 'No content in Gemini API response',
        details: data
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const text = candidate.content.parts[0]?.text || "";

    if (!text) {
      return new Response(JSON.stringify({
        error: 'Empty response from Gemini API',
        details: data
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ text }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('[API] Error interno:', error);
    return new Response(JSON.stringify({
      error: 'Internal Server Error',
      message: error?.message || String(error)
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
