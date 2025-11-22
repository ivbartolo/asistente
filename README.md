<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1bS88iV9DYBD0bv6XBK5R1ToztgY592iI

## Configuración de API Key

Esta aplicación requiere una **API Key de Google Gemini** para funcionar.

### Obtener la API Key

1. Ve a [Google AI Studio](https://aistudio.google.com/apikey)
2. Inicia sesión con tu cuenta de Google
3. Haz clic en "Create API Key" o "Get API Key"
4. Copia la clave generada (solo se muestra una vez)

### Configurar la API Key

#### Para desarrollo local:

1. Crea un archivo `.env.local` en la raíz del proyecto:
```bash
GOOGLE_API_KEY=tu_api_key_aqui
```

2. O alternativamente puedes usar:
```bash
API_KEY=tu_api_key_aqui
```

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
