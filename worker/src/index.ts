import Anthropic from '@anthropic-ai/sdk';

/**
 * Palabreo's optional Worker.
 *  GET  /fetch?url=…   CORS proxy, only for the free sources the app uses.
 *  POST /enrich        Claude fills just the card fields the free sources missed.
 *  POST /extract       Claude reads a textbook page photo when free OCR is not enough.
 * Every route requires `Authorization: Bearer <APP_TOKEN>` (it's a personal app).
 */
export interface Env {
  ANTHROPIC_API_KEY: string;
  APP_TOKEN: string;
  /** Optional override, e.g. "claude-haiku-4-5" to make the AI fallback cheaper. */
  MODEL?: string;
}

const DEFAULT_MODEL = 'claude-opus-5-5';

const ALLOWED_HOSTS = new Set([
  'api.dictionaryapi.dev', 'en.wiktionary.org', 'api.mymemory.translated.net', 'tatoeba.org',
  'api.openverse.org', 'pixabay.com', 'api.pexels.com',
]);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

const CARD_FIELDS = {
  es: 'traducción breve al español (la acepción más común)',
  ipa: 'transcripción IPA estadounidense entre barras, ej. /ˈwɔːtər/',
  pos: 'categoría gramatical breve en español (sustantivo, verbo, adjetivo, frase…)',
  emoji: 'un único emoji que represente la palabra',
  example: 'oración de ejemplo natural y sencilla, nivel A2–B1, que use la palabra',
  exampleEs: 'traducción al español de la oración de ejemplo',
  exampleIpaWords: 'IPA de la oración de ejemplo palabra por palabra, cada palabra entre sus propias barras, separadas por espacios',
  exampleIpaNative: 'IPA de la oración de ejemplo como la diría un hablante nativo de forma fluida (enlaces, contracciones y reducciones), toda entre una sola barra inicial y una final',
} as const;
type Field = keyof typeof CARD_FIELDS;

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (req.headers.get('Authorization') !== `Bearer ${env.APP_TOKEN}`) return json({ error: 'unauthorized' }, 401);

    const url = new URL(req.url);
    try {
      if (req.method === 'GET' && url.pathname === '/fetch') return await proxy(req, url);
      if (req.method === 'POST' && url.pathname === '/enrich') return await enrich(req, env);
      if (req.method === 'POST' && url.pathname === '/extract') return await extract(req, env);
      return json({ error: 'not found' }, 404);
    } catch (e) {
      if (e instanceof Anthropic.RateLimitError) return json({ error: 'rate_limited' }, 429);
      if (e instanceof Anthropic.APIError) return json({ error: `anthropic ${e.status}` }, 502);
      return json({ error: String(e) }, 500);
    }
  },
};

async function proxy(req: Request, url: URL): Promise<Response> {
  const target = new URL(url.searchParams.get('url') ?? '');
  if (target.protocol !== 'https:' || !ALLOWED_HOSTS.has(target.hostname)) return json({ error: 'host not allowed' }, 400);
  const headers: Record<string, string> = { 'User-Agent': 'Palabreo/1.0 (personal flashcards app)' };
  const pexels = req.headers.get('X-Pexels-Key');
  if (pexels && target.hostname === 'api.pexels.com') headers.Authorization = pexels;
  const r = await fetch(target, { headers, cf: { cacheTtl: 86_400, cacheEverything: true } });
  return new Response(r.body, { status: r.status, headers: { 'Content-Type': r.headers.get('Content-Type') ?? 'application/json', ...CORS } });
}

/** Ask Claude for a JSON object matching `schema`; refusals and parse failures become errors. */
async function askJson<T>(env: Env, content: Anthropic.Beta.BetaContentBlockParam[], schema: Record<string, unknown>): Promise<T> {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const model = env.MODEL || DEFAULT_MODEL;
  const usesFallbacks = !model.startsWith('claude-haiku');
  const response = await client.beta.messages.create({
    model,
    max_tokens: 16000,
    output_config: { effort: 'low', format: { type: 'json_schema', schema } },
    ...(usesFallbacks ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
    messages: [{ role: 'user', content }],
  });
  if (response.stop_reason === 'refusal') throw new Error('refused');
  const text = response.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')?.text;
  if (!text) throw new Error('empty response');
  return JSON.parse(text) as T;
}

async function enrich(req: Request, env: Env): Promise<Response> {
  const body = (await req.json()) as { card?: Record<string, string>; fields?: string[] };
  const card = body.card ?? {};
  const fields = (body.fields ?? []).filter((f): f is Field => f in CARD_FIELDS);
  if (!card.en || !fields.length) return json({});

  const known = Object.entries(card)
    .filter(([k, v]) => v && (k === 'en' || k in CARD_FIELDS))
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n');
  const wanted = fields.map((f) => `- ${f}: ${CARD_FIELDS[f]}`).join('\n');
  const prompt =
    'Completas fichas de vocabulario en inglés para un hispanohablante. ' +
    'Esto es lo que ya tiene la ficha (respétalo; si hay oración de ejemplo, las transcripciones son de ESA oración):\n' +
    `${known}\n\nDevuelve solo estos campos:\n${wanted}`;

  const schema = {
    type: 'object',
    properties: Object.fromEntries(fields.map((f) => [f, { type: 'string' }])),
    required: fields,
    additionalProperties: false,
  };
  return json(await askJson(env, [{ type: 'text', text: prompt }], schema));
}

async function extract(req: Request, env: Env): Promise<Response> {
  const body = (await req.json()) as { mediaType?: string; data?: string };
  const mediaType = body.mediaType ?? 'image/jpeg';
  if (!body.data || !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mediaType)) {
    return json({ error: 'imagen no válida' }, 400);
  }
  const schema = {
    type: 'object',
    properties: {
      title: { type: 'string' },
      words: {
        type: 'array',
        items: {
          type: 'object',
          properties: { en: { type: 'string' }, es: { type: 'string' } },
          required: ['en', 'es'],
          additionalProperties: false,
        },
      },
    },
    required: ['title', 'words'],
    additionalProperties: false,
  };
  const prompt =
    'Esta es una foto de una página de un libro de inglés. Extrae el vocabulario que el estudiante debe aprender ' +
    '(palabras y frases cortas de las listas, recuadros o imágenes rotuladas; no las instrucciones ni oraciones de ejercicios). ' +
    'Escribe cada palabra en inglés en minúsculas salvo nombres propios. En "es" pon la traducción si aparece en la página, si no una cadena vacía. ' +
    'En "title" pon la unidad/lección si aparece (ej. "Unit 8 – Lesson A"), si no una cadena vacía.';
  const result = await askJson<{ title: string; words: { en: string; es: string }[] }>(
    env,
    [
      { type: 'image', source: { type: 'base64', media_type: mediaType as 'image/jpeg', data: body.data } },
      { type: 'text', text: prompt },
    ],
    schema,
  );
  return json({ title: result.title, words: result.words.map((w) => (w.es ? w : { en: w.en })) });
}
