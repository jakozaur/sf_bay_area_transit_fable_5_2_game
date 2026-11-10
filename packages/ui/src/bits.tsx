/** Small shared components: button, route bullet, sheet shell, dimension line, stars. */
import type { ComponentChildren, JSX } from 'preact';
import type { PanelId } from './contract.ts';
import type { UiStoreInternal } from './store.ts';

export interface StoreProps {
  store: UiStoreInternal;
}

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter((p) => typeof p === 'string' && p !== '').join(' ');
}

interface BtnProps {
  onClick: () => void;
  children: ComponentChildren;
  kind?: 'primary' | 'plain';
  big?: boolean;
  onInk?: boolean;
  /** Non-null disables the button and becomes its tooltip. */
  disabledReason?: string | null;
  pressed?: boolean;
  testId?: string;
  title?: string;
  label?: string;
}

export function Btn(p: BtnProps): JSX.Element {
  const disabled = p.disabledReason !== undefined && p.disabledReason !== null;
  return (
    <button
      type="button"
      class={cx('bv-btn', p.kind === 'primary' && 'is-primary', p.big === true && 'is-big', p.onInk === true && 'on-ink')}
      disabled={disabled}
      title={disabled ? (p.disabledReason ?? undefined) : p.title}
      aria-pressed={p.pressed}
      aria-label={p.label}
      data-testid={p.testId}
      onClick={p.onClick}
    >
      {p.children}
    </button>
  );
}

export function Bullet(p: { children: ComponentChildren; tone?: 'hi' | 'off' | 'ink' }): JSX.Element {
  return (
    <span class={cx('bv-bullet', p.tone !== undefined && `is-${p.tone}`)} aria-hidden="true">
      {p.children}
    </span>
  );
}

interface SheetProps extends StoreProps {
  id: PanelId;
  title: string;
  sub?: string;
  wide?: boolean;
  children: ComponentChildren;
}

/** A side panel on the right: a drawing sheet with an ink title block and a close button. */
export function Sheet(p: SheetProps): JSX.Element {
  return (
    <div class={cx('bv-right', p.wide === true && 'is-wide')}>
      <section class="bv-sheet bv-live" data-testid={`panel-${p.id}`} aria-label={p.title}>
        <header class="bv-sheet-head">
          <h2>{p.title}</h2>
          {p.sub !== undefined && <span class="sub">{p.sub}</span>}
          <button type="button" class="bv-close" data-testid="panel-close" onClick={() => p.store.openPanel(null)}>
            Close <span class="bv-kbd">Esc</span>
          </button>
        </header>
        <div class="bv-sheet-body">{p.children}</div>
      </section>
    </div>
  );
}

/**
 * A dimension line: a value drawn to scale between two ticks, as on a drawing. `share` is 0..1 of the widest bar.
 * The label sits beside the line so the row reads "who, how much".
 */
export function Dim(p: { who: string; value: string; share: number; tone: 'you' | 'ghost' | 'plain'; note?: string }): JSX.Element {
  const pct = Math.max(0, Math.min(1, p.share)) * 100;
  return (
    <div class={cx('bv-dim', p.tone !== 'plain' && `is-${p.tone}`)}>
      <div class="who">
        <b>{p.who}</b>
        {p.note !== undefined && <div class="bv-soft">{p.note}</div>}
      </div>
      <div class="track">
        <div class="line" style={{ width: `${pct}%` }} />
        <div class="val" style={{ left: pct < 45 ? `calc(${pct}% + 8px)` : '6px' }}>
          {p.value}
        </div>
      </div>
    </div>
  );
}

export function Stars(p: { n: number; of?: number }): JSX.Element {
  const of = p.of ?? 3;
  const n = Math.max(0, Math.min(of, Math.round(p.n)));
  return (
    <span class="bv-stars" role="img" aria-label={`${n} of ${of} stars`}>
      {'★'.repeat(n)}
      <span class="off">{'★'.repeat(of - n)}</span>
    </span>
  );
}

export function Bar(p: { value: number; hi?: boolean }): JSX.Element {
  const pct = Math.max(0, Math.min(1, p.value)) * 100;
  return (
    <div
      class={cx('bv-bar', p.hi === true && 'is-hi')}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
    >
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}
