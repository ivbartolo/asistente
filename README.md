<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1bS88iV9DYBD0bv6XBK5R1ToztgY592iI

## Solución de Problemas

### Error: "cdn.tailwindcss.com should not be used in production"
**Solución**: Este error aparece si hay una versión en caché del navegador. Para solucionarlo:
1. Limpia la caché del navegador (Ctrl+Shift+Delete o Cmd+Shift+Delete)
2. O haz un hard refresh (Ctrl+F5 o Cmd+Shift+R)
3. La aplicación ya usa Tailwind CSS vía PostCSS, no el CDN

### Error 404: /index.css
**Solución**: Este error puede aparecer en desarrollo. El CSS se procesa correctamente en producción. Si persiste:
1. Asegúrate de que `index.css` existe en la raíz del proyecto
2. Verifica que `import './index.css'` esté en `index.tsx`
3. Reinicia el servidor de desarrollo: `npm run dev`

### Error 500: /api/generate
**Solución**: Este error indica que la API Key no está configurada. Ver sección "Configuración de API Key" más abajo.

### Error 429: Rate limit (Too Many Requests)
**Solución**: Google Gemini impone límites por minuto y por día sobre cada API Key. Si ves este error:
1. Espera entre 30 y 60 segundos antes de volver a intentar (el servidor ahora reintenta automáticamente, pero puede que la cuota siga ocupada).
2. Revisa en [Google AI Studio → Usage](https://aistudio.google.com/app/apikey) si agotaste tu cuota diaria o mensual.
3. Evita lanzar múltiples brainstorms consecutivos; cada acción consume una request completa.
4. Si necesitas más capacidad, considera actualizar tu plan o solicitar aumento de cuota en Google AI Studio.

### Error: Speech Recognition Network
**Solución**: Este error ocurre cuando el reconocimiento de voz no puede conectarse. Asegúrate de:
1. Tener conexión a internet
2. Permitir el acceso al micrófono en tu navegador
3. Usar HTTPS (requerido para Speech Recognition API)

## Configuración de API Key

Esta aplicación requiere una **API Key de Google Gemini** para funcionar.

### Obtener la API Key

1. Ve a [Google AI Studio](https://aistudio.google.com/apikey)
2. Inicia sesión con tu cuenta de Google
3. Haz clic en "Create API Key" o "Get API Key"
4. Copia la clave generada (solo se muestra una vez)

### Configurar la API Key

#### Para desarrollo local:

1. Copia el archivo de ejemplo:
```bash
cp .env.example .env.local
```

2. Edita `.env.local` y agrega tu API Key:
```bash
GOOGLE_API_KEY=tu_api_key_aqui
```

3. O alternativamente puedes usar:
```bash
API_KEY=tu_api_key_aqui
```

**Importante**: 
- El archivo `.env.local` está en `.gitignore` y no se subirá al repositorio
- Reinicia el servidor de desarrollo (`npm run dev`) después de crear o modificar `.env.local`
- Las variables de entorno se cargan automáticamente por Vite

#### Para producción en Vercel:

1. **Conectar el repositorio a Vercel:**
   - Ve a [vercel.com](https://vercel.com) e inicia sesión
   - Haz clic en "Add New Project"
   - Importa tu repositorio de GitHub (`ivbartolo/asistente`)
   - Vercel detectará automáticamente que es un proyecto Vite

2. **Configurar Variables de Entorno:**
   - En la página del proyecto, ve a **Settings** → **Environment Variables**
   - Agrega una de las siguientes variables (el código busca en este orden):
     - **Opción 1 (Recomendada):** `GEMINI_API_KEY` 
     - **Opción 2:** `GOOGLE_API_KEY`
     - **Opción 3:** `API_KEY`
   - **Valor:** Tu API Key de Google Gemini
   - **Environment:** Selecciona Production, Preview y Development
   - Haz clic en "Save"
   - **⚠️ IMPORTANTE:** 
     - **NO uses `VITE_GEMINI_API_KEY`** en Vercel (solo funciona en desarrollo local)
     - Las variables `VITE_*` son solo para el frontend, no para funciones serverless
     - Después de agregar la variable, necesitas hacer un nuevo deploy para que tome efecto

3. **Configuración del Proyecto:**
   - **Framework Preset:** Vite (se detecta automáticamente)
   - **Build Command:** `npm run build` (por defecto)
   - **Output Directory:** `dist` (por defecto)
   - **Install Command:** `npm install` (por defecto)

4. **Desplegar:**
   - Haz clic en "Deploy"
   - Vercel construirá y desplegará tu aplicación automáticamente
   - Una vez completado, tendrás una URL como `tu-proyecto.vercel.app`

5. **Verificar el despliegue:**
   - La función serverless `/api/generate` se desplegará automáticamente
   - Verifica que la aplicación funcione correctamente en la URL de producción

**Nota:** El archivo `vercel.json` ya está configurado en el proyecto para optimizar el despliegue.

### Probar la función /api/generate

#### Opción 1: Script de prueba (Recomendado)
```bash
# Probar en local
node test-api.js

# Probar en producción (reemplaza con tu URL de Vercel)
node test-api.js https://tu-proyecto.vercel.app
```

#### Opción 2: Desde el navegador (Consola del navegador)
Abre la consola del navegador (F12) y ejecuta:
```javascript
fetch('/api/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt: 'Responde solo con OK',
    isJson: false
  })
})
.then(r => r.json())
.then(data => console.log('✅ Respuesta:', data))
.catch(err => console.error('❌ Error:', err));
```

#### Opción 3: Desde Vercel Dashboard
1. Ve a tu proyecto en Vercel
2. Haz clic en el deployment más reciente
3. Ve a la pestaña **"Functions"**
4. Busca `/api/generate`
5. Haz clic en "View Function Logs" para ver los logs en tiempo real
6. Los logs mostrarán si la API Key se encontró y si hay errores

#### Opción 4: Usando curl
```bash
# Local
curl -X POST http://localhost:5173/api/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Responde solo con OK","isJson":false}'

# Producción (reemplaza con tu URL)
curl -X POST https://tu-proyecto.vercel.app/api/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Responde solo con OK","isJson":false}'
```

## Run Locally

**Prerequisites:**  Node.js

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configura la API Key (ver sección anterior)

3. Run the app:
   ```bash
   npm run dev
   ```
