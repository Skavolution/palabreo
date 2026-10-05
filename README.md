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

## Escribir a mano con el lápiz

En el modo **Escribir** hay dos pestañas:

- **✏️ A mano**: escribes la palabra con el lápiz en el recuadro. Palabreo envía los **trazos** al reconocedor de escritura de Google, el mismo motor del teclado Gboard. Es gratis, sin key, y entiende cursiva e imprenta. Si al dejar de escribir ya leyó la palabra correcta, la acepta sola. Si una letra es ambigua (por ejemplo «rn» y «m») y la palabra correcta aparece entre las lecturas alternativas, también cuenta, y te dice qué leyó. Cuando se detecta un lápiz activo, se ignoran los toques de la palma.
  - Orden de los reconocedores: primero el del navegador, si existe (sin conexión); luego Google (directo, o a través del Worker si el navegador lo bloquea); y por último, solo si activaste «Completar con IA», Claude visión.
- **⌨️ Teclado**: un campo de texto preparado para la escritura a mano de **Gboard** (Ajustes de Gboard → Idiomas → English → Escritura a mano).

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
