# Despliegue Web y Compartir la Herramienta

## 1) Arquitectura objetivo (estable)
- Frontend: `index.html` + `app.js` + `styles.css` en Vercel o Netlify.
- Backend asesor: `advisor_server.js` en Render/Railway/Fly.
- API keys: solo en variables de entorno del backend (no en navegador).
- Memoria conversacional: centralizada en backend por `session_id`.

## 2) Qué ya quedó implementado en código
- El frontend ya no depende fijo de `127.0.0.1`; ahora usa backend configurable:
  - Por `meta` en `index.html`: `<meta name="advisor-base-url" ...>`
  - O con comando en chat: `/advisor base https://tu-backend`
- El frontend envía `session_id` al backend y mantiene esa sesión.
- El backend expone:
  - `POST /api/advisor`
  - `GET /api/advisor/config`
  - `POST /api/advisor/session/new`
  - `POST /api/advisor/session/clear`
  - `GET /health`
- El backend usa proveedor LLM por servidor:
  - `ADVISOR_LLM_PROVIDER=openai|ollama|auto`
  - `OPENAI_API_KEY` en servidor.

## 3) Paso a paso: backend público (Render recomendado)
1. Sube este proyecto a GitHub.
2. En Render crea un `Web Service` desde ese repo.
3. Configura:
   - Build Command: `npm ci --omit=dev`
   - Start Command: `npm start`
4. Variables de entorno mínimas:
   - `ADVISOR_LLM_PROVIDER=openai`
   - `OPENAI_API_KEY=...`
   - `OPENAI_MODEL=gpt-5-mini`
   - `ADVISOR_HOST=0.0.0.0`
   - `ADVISOR_PORT=10000`
   - `ADVISOR_SESSION_PERSIST=1`
   - `ADVISOR_SESSION_STORE_FILE=/var/data/advisor_sessions.json`
5. (Recomendado) agrega disco persistente en Render y monta `/var/data`.
6. Verifica backend:
   - `https://TU_BACKEND/health`
   - `https://TU_BACKEND/api/advisor/config`

## 4) Paso a paso: frontend público (Vercel o Netlify)
1. Despliega la carpeta raíz como sitio estático.
2. Antes de desplegar, en `index.html` define:
   - `<meta name="advisor-base-url" content="https://TU_BACKEND">`
3. Publica y valida que cargue `index.html` y `app.js`.

## 5) Verificación funcional (checklist)
1. Abre el frontend público.
2. Busca una empresa y corre análisis.
3. En chat pregunta algo financiero.
4. Debe responder sin pedir API key en navegador.
5. Ejecuta `/status` en chat:
   - Debe mostrar backend y sesión de servidor.
6. Refresca la página y vuelve a preguntar:
   - Debe mantener coherencia por sesión.

## 6) Qué le dices a la persona con quien lo compartes
- Solo necesita abrir el link del frontend.
- No debe configurar API keys.
- Debe usar NIT o nombre para cargar empresa y luego preguntar en chat.
- Si quiere reiniciar conversación: botón limpiar chat o comando `/advisor reset_session`.

## 7) Operación y seguridad
- Nunca compartir `OPENAI_API_KEY` por chat/correo.
- Rotar API key periódicamente.
- Monitorear consumo del backend (tokens y latencia).
- Si usas disco persistente: respaldar archivo de sesiones.
