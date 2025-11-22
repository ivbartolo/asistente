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

#### Para producción (Vercel/Netlify):

**Vercel:**
- Ve a tu proyecto → Settings → Environment Variables
- Agrega `GOOGLE_API_KEY` con tu API key

**Netlify:**
- Ve a Site settings → Environment variables
- Agrega `GOOGLE_API_KEY` con tu API key

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
