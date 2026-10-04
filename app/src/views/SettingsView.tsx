import { useEffect, useRef, useState } from 'react';
import { getSettings, saveSettings, type Settings } from '../settings';
import { download, exportBackup, importBackup } from '../backup';
import { englishVoices, speakText } from '../speech';
import { applyTheme } from '../App';
import { Topbar, useNav } from '../ui';

export function SettingsView() {
  const { go, toast } = useNav();
  const [s, setS] = useState<Settings>(getSettings());
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { englishVoices().then(setVoices); }, []);

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => {
    const next = saveSettings({ [k]: v });
    setS(next);
    if (k === 'theme') applyTheme(next.theme);
  };

  return (
    <>
      <Topbar back={() => go({ name: 'home' })} title="Inicio" />
      <h2 style={{ marginBottom: 16 }}>Ajustes</h2>

      <div className="section-title">Apariencia y voz</div>
      <div className="form-card">
        <div className="field">
          <label htmlFor="theme">Tema</label>
          <select id="theme" value={s.theme} onChange={(e) => set('theme', e.target.value as Settings['theme'])}>
            <option value="auto">Automático</option><option value="light">Claro</option><option value="dark">Oscuro</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="voice">Voz en inglés (cuando la palabra no trae audio nativo)</label>
          <select id="voice" value={s.voiceURI} onChange={(e) => { set('voiceURI', e.target.value); speakText('Hello! This is my voice.'); }}>
            <option value="">Automática (la más natural)</option>
            {voices.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>)}
          </select>
          {!voices.length && <div className="field-hint">No hay voces en inglés en este dispositivo. Instala una en los ajustes del sistema (Texto a voz).</div>}
        </div>
      </div>

      <div className="section-title">Imágenes gratis (opcional)</div>
      <div className="form-card">
        <p className="field-hint" style={{ marginTop: 0, marginBottom: 12 }}>Openverse funciona sin nada. Con una key gratuita de Pixabay o Pexels aparecen más imágenes y de mejor calidad.</p>
        <div className="field"><label htmlFor="pixabay">Key de Pixabay</label><input id="pixabay" type="password" value={s.pixabayKey} onChange={(e) => set('pixabayKey', e.target.value.trim())} /></div>
        <div className="field"><label htmlFor="pexels">Key de Pexels</label><input id="pexels" type="password" value={s.pexelsKey} onChange={(e) => set('pexelsKey', e.target.value.trim())} /></div>
      </div>

      <div className="section-title">Worker e IA (opcional)</div>
      <div className="form-card">
        <p className="field-hint" style={{ marginTop: 0, marginBottom: 12 }}>
          Tu Worker de Cloudflare hace de intermediario si el navegador bloquea alguna fuente y, si lo activas, completa con IA lo que falte (la pronunciación nativa de la oración, frases hechas) o lee fotos difíciles.
        </p>
        <div className="field"><label htmlFor="proxy">URL del Worker</label><input id="proxy" type="url" placeholder="https://palabreo.tu-usuario.workers.dev" value={s.proxyUrl} onChange={(e) => set('proxyUrl', e.target.value.trim())} /></div>
        <div className="field"><label htmlFor="token">Token del Worker</label><input id="token" type="password" value={s.proxyToken} onChange={(e) => set('proxyToken', e.target.value.trim())} /></div>
        <label className="check">
          <input type="checkbox" checked={s.aiFallback} disabled={!s.proxyUrl} onChange={(e) => set('aiFallback', e.target.checked)} />
          <span>Completar con IA lo que las fuentes gratis no encuentren<br /><span className="field-hint">De pago, pero solo se pide lo que falta: unos centavos al mes.</span></span>
        </label>
      </div>

      <div className="section-title">Copia de seguridad</div>
      <div className="form-card">
        <p className="field-hint" style={{ marginTop: 0, marginBottom: 12 }}>Tus mazos viven en este dispositivo. Exporta una copia de vez en cuando. También puedes importar el JSON de tu artefacto Palabreo anterior.</p>
        <div className="row">
          <button className="btn btn-ghost" onClick={async () => download(await exportBackup(), `palabreo-${new Date().toISOString().slice(0, 10)}.json`)}>⬇️ Exportar</button>
          <button className="btn btn-ghost" onClick={() => fileRef.current?.click()}>⬆️ Importar</button>
        </div>
        <input ref={fileRef} className="hidden-input" type="file" accept="application/json,.json" onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try {
            const r = await importBackup(f);
            toast(`Importados ${r.decks} mazos y ${r.cards} fichas.`);
          } catch {
            toast('Ese archivo no parece una copia de Palabreo.');
          }
        }} />
      </div>
    </>
  );
}
