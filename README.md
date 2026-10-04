# Palabreo

Fichas de vocabulario en inglés para hispanohablantes, como app web instalable (PWA). Le das una **foto de la página del libro** o una **lista de palabras** y Palabreo arma solo cada ficha: traducción, IPA, audio nativo, un ejemplo real con su traducción e imagen. Después estudias con repaso espaciado (SM-2), opción múltiple, escritura y emparejar, también sin conexión.

## Gratis primero, IA solo si falta algo

| Dato | De dónde sale (gratis) |
|---|---|
| IPA, categoría, audio mp3 | [Free Dictionary API](https://dictionaryapi.dev) + CMUdict (offline) |
| Traducción | Wiktionary → [MyMemory](https://mymemory.translated.net) |
| Ejemplo + traducción | [Tatoeba](https://tatoeba.org) (oraciones reales traducidas por personas) |
| IPA de la oración | CMUdict, palabra por palabra |
| Imagen | [Openverse](https://openverse.org) (sin key); Pixabay / Pexels con key gratuita |
| Emoji | emojilib (offline) |
| Foto del libro → palabras | Tesseract.js (OCR en el navegador) |

Todo se guarda en caché en el dispositivo, así que cada palabra se busca una sola vez. Si en Ajustes conectas el Worker y activas **«Completar con IA»**, Claude rellena solo los campos que quedaron vacíos (por ejemplo la IPA de habla nativa) y puede leer fotos difíciles.

## Estructura

```
app/      PWA: Vite + React + TypeScript, datos en IndexedDB (Dexie)
worker/   Cloudflare Worker opcional: proxy CORS + IA de respaldo (Claude)
```

## Desarrollo

```bash
cd app
npm install
npm run dev        # http://localhost:5173
npm test           # pruebas unitarias
npm run build      # build de producción en app/dist
```

## Publicarla (gratis) en Cloudflare

1. **App:** en Cloudflare → Workers & Pages → *Create* → *Pages* → conecta este repo.
   Build command `npm run build`, directorio raíz `app`, output `dist`.
   Abre la URL en la tablet y elige «Añadir a pantalla de inicio».
2. **Worker (opcional):**
   ```bash
   cd worker
   npm install
   npx wrangler login
   npx wrangler secret put ANTHROPIC_API_KEY
   npx wrangler secret put APP_TOKEN    # una cadena larga al azar
   npx wrangler deploy
   ```
   En la app, en Ajustes, pega la URL del Worker y el mismo `APP_TOKEN`. El modelo por defecto es `claude-opus-5-5`. Para gastar menos, define `MODEL = "claude-haiku-4-5"` en `wrangler.toml`.

## Pasar tus mazos del artefacto anterior

En Ajustes → Copia de seguridad → Importar, elige un JSON con `{ "decks": [...], "cards": [...] }`. Acepta el formato del artefacto Palabreo; las fotos guardadas dentro del artefacto no se pueden trasladar.
