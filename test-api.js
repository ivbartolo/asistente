#!/usr/bin/env node

/**
 * Script de prueba para verificar que /api/generate funciona correctamente
 * 
 * Uso:
 *   node test-api.js                    # Prueba en localhost:5173
 *   node test-api.js https://tu-app.vercel.app  # Prueba en producción
 */

const baseUrl = process.argv[2] || 'http://localhost:5173';
const apiUrl = `${baseUrl}/api/generate`;

console.log('🧪 Probando función /api/generate...');
console.log(`📍 URL: ${apiUrl}\n`);

const testPrompt = "Responde con solo 'OK' si puedes leer este mensaje.";

async function testAPI() {
  try {
    console.log('📤 Enviando petición...');
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: testPrompt,
        isJson: false
      })
    });

    console.log(`📊 Status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const error = await response.json();
      console.error('❌ Error:', error);
      console.log('\n🔍 Posibles causas:');
      console.log('   - API Key no configurada en Vercel');
      console.log('   - Variable de entorno incorrecta (debe ser GEMINI_API_KEY)');
      console.log('   - La función no se desplegó correctamente');
      process.exit(1);
    }

    const data = await response.json();
    console.log('✅ Respuesta recibida:');
    console.log(`   Texto: ${data.text.substring(0, 100)}${data.text.length > 100 ? '...' : ''}`);
    console.log('\n🎉 ¡La función funciona correctamente!');
    
  } catch (error) {
    console.error('❌ Error de conexión:', error.message);
    console.log('\n🔍 Verifica:');
    console.log('   - Que el servidor esté corriendo (npm run dev)');
    console.log('   - Que la URL sea correcta');
    console.log('   - Que no haya problemas de red');
    process.exit(1);
  }
}

testAPI();

