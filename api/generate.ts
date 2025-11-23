// Import removed - using direct REST API calls for Edge compatibility

export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const { prompt, image, systemInstruction, isJson } = await req.json();
    
    // Validar que el prompt existe
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'Prompt is required and must be a non-empty string' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const apiKey = process.env.GOOGLE_API_KEY || process.env.API_KEY || process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Server API Key not configured. Please set GOOGLE_API_KEY or API_KEY environment variable.' }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validar formato básico de API key (debe tener al menos 20 caracteres)
    if (apiKey.length < 20) {
      return new Response(JSON.stringify({ error: 'Invalid API Key format' }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Usar gemini-2.0-flash-exp que es el modelo más reciente
    const model = "gemini-2.0-flash-exp";
    const apiUrl = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`;
    
    const contents = [];
    const parts = [];
    
    if (systemInstruction) {
       // La API REST soporta system_instruction a nivel de top-level, no dentro de contents
    }

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
        contents: contents
    };
    
    // Agregar generationConfig solo si es necesario y con la estructura correcta
    if (isJson) {
        body.generationConfig = {
            responseMimeType: "application/json"
        };
    }

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

    // Manejar errores de respuesta antes de parsear JSON
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
          error: 'Invalid API Key. Please check your GOOGLE_API_KEY environment variable.' 
        }), { 
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ 
          error: 'Rate limit exceeded. Please try again later.' 
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

  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
  }
}
