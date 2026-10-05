import { useCallback, useEffect, useRef, useState } from 'react';
import { getSettings, saveSettings } from '../settings';
import type { Ink, Stroke } from './ink';
import { hasInk } from './ink';

const HEIGHT = 180;
const IDLE_MS = 1100;

interface Props {
  disabled?: boolean;
  /** Fired after the pen rests for a moment (a free "preview" read). */
  onIdle?: (ink: Ink) => void;
  /** Fired by the "Comprobar" button. */
  onSubmit: (ink: Ink, png: () => Promise<Blob | null>) => void;
  busy?: boolean;
}

/** Render the strokes on a clean white canvas (no guide line) for image-based recognizers. */
export function inkToPng(ink: Ink): Promise<Blob | null> {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(ink.width));
  c.height = Math.max(1, Math.round(ink.height));
  const ctx = c.getContext('2d');
  if (!ctx) return Promise.resolve(null);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  paintStrokes(ctx, ink.strokes, 1);
  return new Promise((resolve) => c.toBlob(resolve, 'image/png'));
}

function paintStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[], scale: number) {
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 4 * scale;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [xs, ys] of strokes) {
    ctx.beginPath();
    ctx.moveTo(xs[0] * scale, ys[0] * scale);
    if (xs.length === 1) ctx.lineTo(xs[0] * scale + 0.1, ys[0] * scale);
    for (let i = 1; i < xs.length; i++) ctx.lineTo(xs[i] * scale, ys[i] * scale);
    ctx.stroke();
  }
}

export function InkPad({ disabled, onIdle, onSubmit, busy }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const active = useRef<{ id: number; stroke: Stroke } | null>(null);
  const t0 = useRef(0);
  const penInSession = useRef(getSettings().penSeen);
  const idleTimer = useRef<number>(undefined);
  const [count, setCount] = useState(0); // re-render buttons when strokes change
  const [width, setWidth] = useState(0);

  const ink = useCallback((): Ink => ({ strokes: strokes.current, width, height: HEIGHT }), [width]);

  const redraw = useCallback(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    // Writing guide: a dashed baseline.
    ctx.strokeStyle = '#d9d2c0';
    ctx.lineWidth = 1.5 * dpr;
    ctx.setLineDash([8 * dpr, 7 * dpr]);
    ctx.beginPath();
    ctx.moveTo(16 * dpr, HEIGHT * 0.72 * dpr);
    ctx.lineTo(c.width - 16 * dpr, HEIGHT * 0.72 * dpr);
    ctx.stroke();
    ctx.setLineDash([]);
    paintStrokes(ctx, strokes.current, dpr);
  }, []);

  // Size the canvas to its box (and on rotation), keeping strokes in CSS pixels.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const fit = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = c.getBoundingClientRect().width;
      c.width = Math.round(w * dpr);
      c.height = Math.round(HEIGHT * dpr);
      setWidth(w);
      redraw();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(c);
    return () => ro.disconnect();
  }, [redraw]);

  useEffect(() => () => clearTimeout(idleTimer.current), []);

  const point = (e: PointerEvent | React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top, performance.now() - t0.current] as const;
  };

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    if (e.pointerType === 'pen' && !penInSession.current) {
      penInSession.current = true;
      if (!getSettings().penSeen) saveSettings({ penSeen: true });
    }
    // Palm rejection: once an active pen has been used, fingers don't draw.
    if (e.pointerType === 'touch' && penInSession.current) return;
    if (active.current) return;
    e.preventDefault();
    clearTimeout(idleTimer.current);
    if (!strokes.current.length) t0.current = performance.now();
    const [x, y, t] = point(e);
    const stroke: Stroke = [[x], [y], [t]];
    strokes.current.push(stroke);
    active.current = { id: e.pointerId, stroke };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* pointer already gone (or synthetic): drawing still works without capture */
    }
    redraw();
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    const a = active.current;
    if (!a || a.id !== e.pointerId) return;
    e.preventDefault();
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
    const ctx = canvasRef.current!.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    const [xs, ys, ts] = a.stroke;
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 4 * dpr;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(xs[xs.length - 1] * dpr, ys[ys.length - 1] * dpr);
    for (const ev of events.length ? events : [e.nativeEvent]) {
      const [x, y, t] = point(ev);
      xs.push(x); ys.push(y); ts.push(t);
      ctx.lineTo(x * dpr, y * dpr);
    }
    ctx.stroke();
  }

  function up(e: React.PointerEvent<HTMLCanvasElement>) {
    const a = active.current;
    if (!a || a.id !== e.pointerId) return;
    active.current = null;
    setCount(strokes.current.length);
    if (onIdle) {
      clearTimeout(idleTimer.current);
      idleTimer.current = window.setTimeout(() => hasInk(ink()) && onIdle(ink()), IDLE_MS);
    }
  }

  function undo() {
    strokes.current.pop();
    setCount(strokes.current.length);
    redraw();
  }
  function clear() {
    strokes.current = [];
    setCount(0);
    redraw();
  }

  return (
    <div className="inkpad">
      <canvas
        ref={canvasRef}
        className={`inkpad-canvas${disabled ? ' disabled' : ''}`}
        style={{ height: HEIGHT }}
        aria-label="Recuadro para escribir a mano"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      />
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn btn-ghost" style={{ flex: 1 }} disabled={disabled || !count} onClick={undo}>↶ Deshacer</button>
        <button className="btn btn-ghost" style={{ flex: 1 }} disabled={disabled || !count} onClick={clear}>🗑️ Borrar</button>
        <button className="btn btn-primary" style={{ flex: 1.4 }} disabled={disabled || busy || !count}
          onClick={() => { clearTimeout(idleTimer.current); const k = ink(); onSubmit(k, () => inkToPng(k)); }}>
          {busy ? 'Leyendo…' : '✅ Comprobar'}
        </button>
      </div>
    </div>
  );
}
