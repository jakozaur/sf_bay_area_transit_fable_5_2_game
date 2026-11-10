/** DOM adapter: the only file in packages/input that listens to DOM events (camera-controls aside). */
import type { InputMapper } from './actions.ts';

/** Elements whose keystrokes belong to the UI, not the game. */
function isTextEntry(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

/**
 * Feeds `mapper` from pointer events on `canvas` and key events on its window.
 * Returns a detach function that removes every listener it added.
 */
export function attachDom(canvas: HTMLElement, mapper: InputMapper): () => void {
  const doc = canvas.ownerDocument;
  const win = doc.defaultView;
  if (win === null) throw new Error('attachDom: canvas is not attached to a window');
  const ac = new AbortController();
  const opts = { signal: ac.signal };
  const local = (e: PointerEvent): { x: number; y: number } => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  canvas.addEventListener(
    'pointerdown',
    (e) => {
      mapper.feed({ kind: 'pointerdown', ...local(e), button: e.button });
      // A tool claimed the gesture: keep receiving its moves when the pointer leaves the canvas.
      if (mapper.claimed) canvas.setPointerCapture(e.pointerId);
    },
    opts,
  );
  // pointerup is taken from the document: camera-controls captures the pointer during drags.
  doc.addEventListener('pointerup', (e) => mapper.feed({ kind: 'pointerup', ...local(e), button: e.button }), opts);
  canvas.addEventListener('pointermove', (e) => mapper.feed({ kind: 'pointermove', ...local(e) }), opts);
  canvas.addEventListener('pointerleave', () => mapper.feed({ kind: 'pointerleave' }), opts);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault(), opts);
  win.addEventListener(
    'keydown',
    (e) => {
      if (isTextEntry(e.target) || e.altKey) return;
      if (e.ctrlKey || e.metaKey) {
        // Undo and redo are the only chords the game reads; the rest stay with the browser.
        if (e.code !== 'KeyZ' && e.code !== 'KeyY') return;
        e.preventDefault();
        mapper.feed({ kind: 'keydown', code: e.code, repeat: e.repeat, ctrl: true, shift: e.shiftKey });
        return;
      }
      // Space and Backspace would scroll the page or go back; in the game they pause and delete.
      if (e.code === 'Space' || e.code === 'Backspace') e.preventDefault();
      mapper.feed({ kind: 'keydown', code: e.code, repeat: e.repeat });
    },
    opts,
  );
  // Shift + wheel steps the active tool's option. Taken in the capture phase on the window so the camera's own
  // wheel listener on the canvas never sees it; a plain wheel passes through untouched.
  win.addEventListener(
    'wheel',
    (e) => {
      if (!e.shiftKey || e.target !== canvas) return;
      e.preventDefault();
      e.stopPropagation();
      // Browsers turn Shift + vertical wheel into a horizontal scroll: read whichever axis moved.
      mapper.feed({ kind: 'wheel', deltaY: e.deltaY !== 0 ? e.deltaY : e.deltaX, shift: true });
    },
    { signal: ac.signal, capture: true, passive: false },
  );
  win.addEventListener('keyup', (e) => mapper.feed({ kind: 'keyup', code: e.code }), opts);
  win.addEventListener('blur', () => mapper.feed({ kind: 'blur' }), opts);
  doc.addEventListener(
    'visibilitychange',
    () => {
      if (doc.visibilityState === 'hidden') mapper.feed({ kind: 'blur' });
    },
    opts,
  );
  return () => ac.abort();
}
