/**
 * The whole stylesheet of the UI, injected once by mountUi.
 * Direction: transit signage over an engineering drawing. Ink bands with white condensed type carry the live
 * numbers (signage); pale drafting-paper sheets carry the documents (project, reforms, receipt); comparisons
 * are drawn as dimension lines to scale. One accent, hi-vis orange, marks the player's own number and the one
 * button to press next. Red means a violated rule, green means done, and neither is used for anything else.
 * Fonts are system faces (DIN on macOS, Bahnschrift on Windows): the game ships no font files.
 */
export const STYLE_ID = 'bayvox-ui-style';

export const CSS = `
.bv {
  --ink: #0e1c2b;
  --ink-2: #1c3148;
  --ink-3: #2b4763;
  --fog: #a6b8c8;
  --paper: #edf1f2;
  --paper-2: #dfe6e9;
  --rule: #a9b8c2;
  --soft: #4b5e6f;
  --hi: #ff5a1f;
  --hi-ink: #b03a09;
  --bad: #d4222b;
  --bad-on-ink: #ff7a80;
  --good: #18794e;
  --good-on-ink: #58d29a;
  --f-sign: 'DIN Condensed', 'Bahnschrift', 'Roboto Condensed', 'Arial Narrow', sans-serif;
  --f-text: 'DIN Alternate', 'Bahnschrift', 'Helvetica Neue', Helvetica, Arial, sans-serif;
  position: fixed;
  inset: 0;
  z-index: 10;
  pointer-events: none;
  overflow: hidden;
  font: 14px/1.4 var(--f-text);
  color: var(--ink);
  font-variant-numeric: tabular-nums;
  -webkit-font-smoothing: antialiased;
  user-select: none;
}
.bv *, .bv *::before, .bv *::after { box-sizing: border-box; }
.bv :where(h1, h2, h3, p, ul, ol, dl, dd, fieldset) { margin: 0; padding: 0; border: 0; }
.bv :where(ul, ol) { list-style: none; }
.bv :where(button) { font: inherit; color: inherit; background: none; border: 0; padding: 0; margin: 0; cursor: pointer; text-align: left; }
.bv button:disabled { cursor: not-allowed; }
.bv :focus-visible { outline: 3px solid var(--hi); outline-offset: 2px; }
.bv-live { pointer-events: auto; }
.bv-num { font-family: var(--f-sign); font-weight: 700; letter-spacing: 0.01em; }
.bv-bad { color: var(--bad); }
.bv-good { color: var(--good); }
.bv-soft { color: var(--soft); }
.bv-hi { color: var(--hi-ink); }
.bv-small { font-size: 12px; line-height: 1.35; }
.bv-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

/* ---------------------------------------------------------------- buttons */
.bv .bv-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  min-height: 32px; padding: 5px 12px 4px; border-radius: 3px;
  border: 1.5px solid var(--ink); background: var(--paper); color: var(--ink);
  font-weight: 700; line-height: 1.15; text-align: center;
}
.bv .bv-btn:hover:not(:disabled) { background: #fff; }
.bv .bv-btn:active:not(:disabled) { transform: translateY(1px); }
.bv .bv-btn:disabled { border-color: var(--rule); color: #7d8c99; background: var(--paper-2); }
.bv .bv-btn.is-primary { background: var(--hi); border-color: var(--hi); color: #1a0a02; }
.bv .bv-btn.is-primary:hover:not(:disabled) { background: #ff7440; }
.bv .bv-btn.is-primary:disabled { background: var(--paper-2); border-color: var(--rule); color: #7d8c99; }
.bv .bv-btn.is-big { min-height: 44px; padding: 8px 20px 6px; font: 700 24px/1 var(--f-sign); letter-spacing: 0.02em; }
.bv .bv-btn.on-ink { background: transparent; border-color: var(--ink-3); color: #fff; }
.bv .bv-btn.on-ink:hover:not(:disabled) { background: var(--ink-2); border-color: var(--fog); }
.bv .bv-btn.on-ink:disabled { color: #6f8496; border-color: var(--ink-2); background: transparent; }
.bv .bv-btn.on-ink[aria-pressed='true'] { background: #fff; border-color: #fff; color: var(--ink); }
/* A pressed button under the pointer keeps its own colours: the plain hover rule would put dark text on dark. */
.bv .bv-btn.on-ink[aria-pressed='true']:hover:not(:disabled) { background: var(--paper-2); border-color: #fff; color: var(--ink); }
.bv .bv-link { text-decoration: underline; text-underline-offset: 2px; font-weight: 700; }
.bv a.bv-link { color: inherit; }
.bv .bv-link:hover { color: var(--hi-ink); }
.bv .bv-link.on-ink:hover { color: var(--hi); }

/* Route bullet: the round badge of transit signage. Carries a hotkey digit or a campaign number. */
.bv-bullet {
  flex: none; display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 50%;
  background: #fff; color: var(--ink); font: 700 15px/1 var(--f-sign); padding-top: 2px;
}
.bv-bullet.is-hi { background: var(--hi); color: #1a0a02; }
.bv-bullet.is-off { background: transparent; color: var(--fog); box-shadow: inset 0 0 0 1.5px var(--ink-3); }
.bv-bullet.is-ink { background: var(--ink); color: #fff; }

/* ---------------------------------------------------------------- top band */
.bv-top {
  position: absolute; top: 0; left: 0; right: 0; height: 52px; display: flex; align-items: stretch;
  background: var(--ink); color: #fff; border-bottom: 3px solid var(--hi);
}
.bv-top-cell { display: flex; flex-direction: column; justify-content: center; padding: 0 14px; border-right: 1px solid var(--ink-3); white-space: nowrap; }
.bv-top-cell .k { font-size: 11px; line-height: 1.1; color: var(--fog); }
.bv-top-cell .v { font: 700 22px/1 var(--f-sign); font-variant-numeric: tabular-nums; padding-top: 4px; }
.bv-top-cell .v.bv-bad { color: var(--bad-on-ink); }
/* Fixed cells, wide enough for the longest text each can hold ("28 May 2031", "-$99.9M", "999 PC"): a value that
   changes never changes the width of its cell, so nothing to the right of it moves. */
.bv-top-cell.is-date .v { width: 11.5ch; }
.bv-top-cell.is-funds .v { width: 7.5ch; }
.bv-top-cell.is-pc .v { width: 6.5ch; }
/* The time cell has one width whatever it holds ("Next decision", or pause and the three bore speeds): the
   buttons right of it stay where they are when a machine launches or breaks through. */
.bv-speed { flex: none; box-sizing: border-box; width: 336px; min-width: 0; margin: 0; display: flex; align-items: center; gap: 4px; padding: 0 12px; border: 0; border-right: 1px solid var(--ink-3); }
.bv .bv-speed .bv-btn { flex: none; min-width: 40px; min-height: 30px; padding: 4px 8px 2px; font: 700 17px/1 var(--f-sign); white-space: nowrap; }
.bv-hold-slot { flex: none; width: 96px; margin-left: auto; padding-left: 6px; }
.bv-hold { font-size: 12px; color: var(--hi); white-space: nowrap; }
.bv-headline { flex: 1; min-width: 0; display: flex; align-items: center; gap: 12px; padding: 0 14px; }
.bv-headline .pair { display: flex; flex-direction: column; justify-content: center; }
.bv-headline .k { font-size: 11px; line-height: 1.1; color: var(--fog); white-space: nowrap; }
.bv-headline .v { font: 700 17px/1 var(--f-sign); font-variant-numeric: tabular-nums; padding-top: 4px; white-space: nowrap; min-height: 21px; }
.bv-headline .gap { flex: none; box-sizing: content-box; width: 5.4ch; text-align: center; font: 700 30px/1 var(--f-sign); font-variant-numeric: tabular-nums; padding: 6px 8px 2px; border: 2px solid #fff; border-radius: 3px; white-space: nowrap; }
.bv-headline .gap.is-met { color: var(--good-on-ink); border-color: var(--good-on-ink); }
.bv-headline .gap.is-missed { color: var(--bad-on-ink); border-color: var(--bad-on-ink); }
.bv-headline .none { color: var(--fog); }
.bv-nav { display: flex; align-items: center; gap: 6px; padding: 0 12px; }
.bv .bv-nav .bv-btn { min-height: 30px; padding: 4px 10px 3px; }

/* ---------------------------------------------------------------- objective strip */
.bv-strip {
  position: absolute; top: 52px; left: 0; right: 0; min-height: 40px; display: flex; align-items: center; gap: 16px;
  padding: 4px 14px; background: rgba(237, 241, 242, 0.96); border-bottom: 1.5px solid var(--ink);
}
/* Strip map: mission stages as stops on a line. */
.bv-stops { display: flex; align-items: center; flex: none; }
.bv-stop { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--soft); }
.bv-stop .dot { width: 12px; height: 12px; border-radius: 50%; border: 3px solid var(--ink); background: var(--paper); }
.bv-stop.is-done .dot { background: var(--ink); }
.bv-stop.is-now { color: var(--ink); font-weight: 700; }
.bv-stop.is-now .dot { border-color: var(--hi); background: var(--hi); box-shadow: 0 0 0 2px var(--ink); }
.bv-stop .link { width: 20px; height: 3px; background: var(--ink); margin: 0 2px 0 6px; }
.bv-objective { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; }
.bv-objective .what { font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 0 1 auto; }
/* The hint is the instruction: it wraps to a second line instead of ending in an ellipsis. */
.bv-objective .hint { color: var(--soft); font-size: 13px; line-height: 1.25; flex: 1 1 0; min-width: 0; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
/* How far the phase of a time-lapse is: the one thing that moves while the map does not. */
.bv-lapse { flex: none; display: flex; align-items: center; gap: 8px; width: 200px; font-size: 12px; color: var(--soft); white-space: nowrap; }
.bv-lapse .bv-bar { flex: 1; }
.bv-lapse .left { font-weight: 700; color: var(--ink); }
.bv .bv-strip .bv-btn { min-height: 28px; flex: none; }

/* ---------------------------------------------------------------- sheets (panels) */
.bv-sheet {
  background: var(--paper); border-radius: 3px; display: flex; flex-direction: column; min-height: 0;
  box-shadow: 0 0 0 1.5px var(--ink), 0 14px 34px rgba(6, 14, 24, 0.5);
}
.bv-sheet-head { flex: none; display: flex; align-items: center; gap: 10px; padding: 7px 8px 5px 12px; background: var(--ink); color: #fff; border-radius: 3px 3px 0 0; }
.bv-sheet-head h2 { flex: 1; font: 700 22px/1 var(--f-sign); padding-top: 3px; letter-spacing: 0.02em; }
.bv-sheet-head .sub { font-size: 12px; color: var(--fog); }
.bv .bv-close { min-height: 26px; padding: 3px 8px 2px; border: 1.5px solid var(--ink-3); border-radius: 3px; color: #fff; font-size: 12px; font-weight: 700; }
.bv .bv-close:hover { background: var(--ink-2); border-color: var(--fog); }
.bv-sheet-body { flex: 1; min-height: 0; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 12px; }
.bv-sheet-body::-webkit-scrollbar { width: 8px; }
.bv-sheet-body::-webkit-scrollbar-thumb { background: var(--rule); border-radius: 4px; }
.bv-sec { display: flex; flex-direction: column; gap: 6px; }
.bv-sec > h3 { font: 700 17px/1.1 var(--f-sign); letter-spacing: 0.02em; padding-bottom: 3px; border-bottom: 1.5px solid var(--ink); }
.bv-rows > li, .bv-row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 3px 0; border-bottom: 1px solid var(--paper-2); }
.bv-rows > li:last-child { border-bottom: 0; }
.bv-row .v, .bv-rows .v { font-weight: 700; text-align: right; }
.bv-rows > li > span:first-child { flex: none; max-width: 60%; }
.bv-note { font-size: 12px; line-height: 1.35; color: var(--soft); }
.bv-evidence { font-size: 12px; line-height: 1.35; color: var(--soft); padding-left: 8px; border-left: 2px solid var(--rule); }
.bv-tag { display: inline-block; padding: 2px 6px 0; border-radius: 2px; font-size: 11px; font-weight: 700; line-height: 1.5; background: var(--paper-2); color: var(--ink); white-space: nowrap; }
.bv-tag.is-good { background: var(--good); color: #fff; }
.bv-tag.is-bad { background: var(--bad); color: #fff; }
.bv-tag.is-hi { background: var(--hi); color: #1a0a02; }
.bv-tag.is-ink { background: var(--ink); color: #fff; }
.bv-problems li { color: var(--bad); font-weight: 700; padding: 2px 0 2px 16px; position: relative; }
.bv-problems li::before { content: ''; position: absolute; left: 2px; top: 8px; width: 8px; height: 8px; background: var(--bad); transform: rotate(45deg); }

.bv-right { position: absolute; top: 104px; right: 12px; bottom: 76px; width: 400px; display: flex; flex-direction: column; justify-content: flex-start; }
.bv-right.is-wide { width: 414px; }
.bv-right .bv-sheet { max-height: 100%; }
.bv-left { position: absolute; top: 104px; left: 12px; bottom: 76px; width: 300px; display: flex; flex-direction: column; justify-content: flex-start; }
.bv-left .bv-sheet { max-height: 100%; }

/* ---------------------------------------------------------------- dimension line (the comparison bar) */
.bv-dim { display: grid; grid-template-columns: 96px 1fr; align-items: center; column-gap: 10px; }
.bv-dim .who { font-size: 12px; line-height: 1.2; }
.bv-dim .track { position: relative; height: 34px; }
.bv-dim .line { position: absolute; left: 0; top: 0; bottom: 0; min-width: 4px; border-left: 2px solid currentColor; border-right: 2px solid currentColor; }
.bv-dim .line::before { content: ''; position: absolute; left: 0; right: 0; bottom: 7px; height: 2px; background: currentColor; }
.bv-dim .val { position: absolute; top: 0; font: 700 19px/1 var(--f-sign); padding-top: 3px; white-space: nowrap; }
.bv-dim.is-you { color: var(--hi-ink); }
.bv-dim.is-you .line::before { height: 4px; bottom: 6px; background: var(--hi); }
.bv-dim.is-you .line { border-color: var(--hi); }
.bv-dim.is-ghost { color: var(--soft); }
.bv-dim.is-ghost .line::before { background: repeating-linear-gradient(90deg, currentColor 0 6px, transparent 6px 10px); }

/* ---------------------------------------------------------------- tool panel */
.bv-hint { font-size: 13px; line-height: 1.35; padding: 6px 8px; background: var(--paper-2); border-left: 3px solid var(--ink); }
.bv-opt { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 2px 8px; }
.bv-opt label, .bv-opt .lab { font-size: 13px; }
.bv-opt .val { font-weight: 700; }
.bv-opt input[type='range'] { grid-column: 1 / -1; width: 100%; margin: 0; accent-color: var(--hi); pointer-events: auto; }
.bv-choices { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 4px; }
/* Choices with a price tag: one row each, the tag on the right, the note of the chosen one under it. */
.bv-picks { grid-column: 1 / -1; display: flex; flex-direction: column; gap: 3px; }
.bv .bv-pick { display: grid; grid-template-columns: 1fr auto; gap: 0 8px; align-items: baseline; width: 100%; padding: 4px 8px 3px; border: 1.5px solid var(--rule); border-radius: 3px; background: #f6f8f9; font-size: 13px; }
.bv .bv-pick:hover:not(:disabled) { border-color: var(--ink); background: #fff; }
.bv .bv-pick[aria-pressed='true'] { border-color: var(--ink); background: #fff; box-shadow: inset 4px 0 0 var(--hi); }
.bv-pick .name { font-weight: 700; }
.bv-pick .tag { font: 700 16px/1.1 var(--f-sign); white-space: nowrap; }
.bv-pick .note { grid-column: 1 / -1; font-size: 12px; line-height: 1.3; color: var(--soft); }
.bv .bv-choices .bv-btn { min-height: 28px; padding: 3px 8px 2px; font-size: 13px; }
.bv .bv-btn[aria-pressed='true'] { background: var(--ink); color: #fff; }
.bv .bv-btn[aria-pressed='true']:not(.on-ink):hover:not(:disabled) { background: var(--ink-2); color: #fff; }
.bv-cmds { display: flex; flex-wrap: wrap; gap: 6px; }
.bv-cmds .bv-btn.is-primary { flex: 1 1 100%; }

/* ---------------------------------------------------------------- design chooser */
.bv-option { display: grid; grid-template-columns: 1fr auto; gap: 2px 10px; width: 100%; padding: 8px 10px; border: 1.5px solid var(--rule); border-radius: 3px; background: #f6f8f9; }
.bv button.bv-option:hover:not(:disabled) { border-color: var(--ink); background: #fff; }
.bv .bv-option.is-selected { border-color: var(--ink); box-shadow: inset 4px 0 0 var(--hi); background: #fff; }
.bv .bv-option.is-locked { background: var(--paper-2); }
.bv-option .name { font-weight: 700; font-size: 15px; }
.bv-option .price { font: 700 20px/1 var(--f-sign); padding-top: 3px; text-align: right; white-space: nowrap; }
.bv-option .desc { grid-column: 1; font-size: 12px; line-height: 1.35; color: var(--soft); }
.bv-option .side { grid-column: 2; grid-row: 2 / span 2; text-align: right; font-size: 12px; line-height: 1.35; white-space: nowrap; }
.bv-option .meta { grid-column: 1; display: flex; flex-wrap: wrap; gap: 4px; align-items: center; padding-top: 2px; }
.bv-option .time { grid-column: 1 / -1; font-size: 12px; line-height: 1.35; color: var(--soft); padding-top: 2px; }
.bv-lock { grid-column: 1 / -1; font-size: 12px; font-weight: 700; color: var(--bad); padding-top: 2px; }
.bv-option-wrap { display: flex; flex-direction: column; gap: 3px; }
/* The machine of a tunnel choice: silhouette, name, three facts, one line of note. */
.bv-machine { grid-column: 1 / -1; display: grid; grid-template-columns: 44px 1fr; gap: 1px 10px; align-items: center; margin-top: 4px; padding: 6px 8px 5px; border-left: 3px solid var(--ink); background: var(--paper-2); text-align: left; }
.bv-machine .shape { grid-row: 1 / span 2; color: var(--ink); }
.bv-machine .name { font-weight: 700; font-size: 13px; }
.bv-machine .facts { display: flex; flex-wrap: wrap; gap: 0 12px; font-size: 12px; font-variant-numeric: tabular-nums; }
.bv-machine .note { grid-column: 1 / -1; font-size: 12px; line-height: 1.35; color: var(--soft); }

/* ---------------------------------------------------------------- project panel: phase timeline */
.bv-phases { position: relative; display: flex; flex-direction: column; }
.bv-phase { position: relative; display: grid; grid-template-columns: 22px 1fr auto; gap: 0 8px; padding: 0 0 10px; }
.bv-phase::before { content: ''; position: absolute; left: 9.5px; top: 14px; bottom: -2px; width: 3px; background: var(--rule); }
.bv-phase:last-child::before { display: none; }
.bv-phase.is-done::before { background: var(--ink); }
.bv-phase .dot { width: 16px; height: 16px; margin: 2px 3px 0; border-radius: 50%; border: 3px solid var(--rule); background: var(--paper); position: relative; z-index: 1; }
.bv-phase.is-done .dot { border-color: var(--ink); background: var(--ink); }
.bv-phase.is-current .dot { border-color: var(--ink); background: var(--hi); }
.bv-phase .name { font-weight: 700; }
.bv-phase.is-todo .name { font-weight: 400; color: var(--soft); }
.bv-phase .when { font-size: 12px; color: var(--soft); white-space: nowrap; text-align: right; }
.bv-phase .more { grid-column: 2 / -1; display: flex; flex-direction: column; gap: 5px; padding-top: 3px; }
.bv-bar { height: 6px; background: var(--paper-2); border-radius: 3px; overflow: hidden; }
.bv-bar > i { display: block; height: 100%; background: var(--ink); }
.bv-bar.is-hi > i { background: var(--hi); }
.bv-item { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; align-items: center; padding: 5px 0; border-bottom: 1px solid var(--paper-2); }
.bv-item:last-child { border-bottom: 0; }
.bv-item .name { font-weight: 700; }
.bv-item .acts { display: flex; gap: 4px; }
.bv .bv-item .bv-btn { min-height: 26px; padding: 2px 8px 1px; font-size: 13px; }
.bv-item .bv-bar { grid-column: 1 / -1; }

/* ---------------------------------------------------------------- reforms: four lines, reforms are the stops */
.bv-reforms { display: flex; flex-direction: column; }
.bv-reform { position: relative; padding: 0 0 8px 26px; }
.bv-reform::before { content: ''; position: absolute; left: 7.5px; top: 12px; bottom: -4px; width: 3px; background: var(--ink); }
.bv-reform:last-child::before { display: none; }
.bv-reform .stop { position: absolute; left: 1px; top: 5px; width: 16px; height: 16px; border-radius: 50%; border: 3px solid var(--ink); background: var(--paper); z-index: 1; }
.bv-reform.is-enacted .stop { background: var(--good); border-color: var(--good); }
.bv-reform.is-locked .stop { border-color: var(--rule); }
.bv-reform-row { display: flex; align-items: flex-start; gap: 8px; }
.bv-reform-row > .bv-tag { margin-top: 4px; }
.bv-reform-row > .cost { flex: none; padding-top: 6px; font: 700 15px/1 var(--f-sign); white-space: nowrap; color: var(--soft); }
.bv .bv-reform-row > .bv-btn { flex: none; min-height: 28px; padding: 4px 10px 3px; }
.bv .bv-reform-head { flex: 1; min-width: 0; display: flex; flex-direction: column; padding: 3px 6px 2px; border-radius: 3px; }
.bv .bv-fold { align-self: flex-start; padding: 3px 6px 2px; border-radius: 3px; font-weight: 700; color: var(--soft); }
.bv .bv-fold::before { content: '+ '; }
.bv .bv-fold[aria-expanded='true']::before { content: '- '; }
.bv .bv-fold:hover { background: var(--paper-2); }
.bv .bv-reform-head:hover { background: var(--paper-2); }
.bv-reform-head .title { font-weight: 700; }
.bv-reform.is-locked .title { color: var(--soft); font-weight: 400; }
.bv-reform-head .fx { font-size: 12px; color: var(--soft); }
.bv-reform-head .fx.is-saving { color: var(--good); font-weight: 700; }
.bv-reform-body { display: flex; flex-direction: column; gap: 6px; margin: 4px 0 4px 6px; padding: 8px 10px; background: #fff; border: 1.5px solid var(--ink); border-radius: 3px; }
.bv-effect { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.bv-effect > div { padding: 5px 8px 3px; background: var(--paper); border-radius: 2px; }
.bv-effect .k { font-size: 11px; color: var(--soft); line-height: 1.2; }
.bv-effect .v { font: 700 19px/1.1 var(--f-sign); padding-top: 2px; }

/* ---------------------------------------------------------------- receipt */
.bv-receipt { width: 100%; border-collapse: collapse; font-size: 13px; }
.bv-right .bv-receipt th, .bv-right .bv-receipt td { padding-left: 4px; padding-right: 4px; }
.bv-right .bv-dim { grid-template-columns: 84px 1fr; }
.bv-receipt th, .bv-receipt td { padding: 4px 6px 3px; text-align: right; vertical-align: top; border-bottom: 1px solid var(--paper-2); }
.bv-receipt th:first-child, .bv-receipt td:first-child { text-align: left; padding-left: 0; }
.bv-receipt th:last-child, .bv-receipt td:last-child { padding-right: 0; }
.bv-receipt thead th { font-size: 12px; font-weight: 700; line-height: 1.2; border-bottom: 1.5px solid var(--ink); vertical-align: bottom; }
.bv-receipt .is-you { color: var(--hi-ink); }
.bv-receipt td.n { font-weight: 700; white-space: nowrap; }
.bv-receipt tr.grp td { font: 700 16px/1.1 var(--f-sign); letter-spacing: 0.02em; padding-top: 9px; border-bottom: 1.5px solid var(--ink); }
.bv-receipt tr.tot td { font: 700 19px/1.1 var(--f-sign); border-top: 2px solid var(--ink); border-bottom: 0; padding-top: 6px; }
.bv-receipt tr.perkm td { border-bottom: 0; font-weight: 700; }
.bv-receipt .lab { font-weight: 700; }
.bv-receipt .by { display: flex; flex-wrap: wrap; gap: 3px; align-items: center; padding-top: 2px; font-size: 12px; font-weight: 400; color: var(--soft); }
.bv .bv-chip { padding: 1px 5px 0; border: 1px solid var(--rule); border-radius: 2px; font-size: 11px; line-height: 1.5; font-weight: 700; color: var(--ink); background: #fff; }
.bv .bv-chip.is-done { border-color: var(--good); background: var(--good); color: #fff; }
.bv button.bv-chip:hover { border-color: var(--ink); }
.bv-ratios { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.bv-ratios > div { padding: 6px 8px 4px; border: 1.5px solid var(--ink); border-radius: 3px; background: #fff; }
.bv-ratios .v { font: 700 26px/1 var(--f-sign); padding-top: 2px; }
.bv-ratios .k { font-size: 11px; line-height: 1.25; color: var(--soft); }
.bv-dims { display: flex; flex-direction: column; gap: 4px; }

.bv-fxlist { display: flex; flex-direction: column; gap: 1px; font-size: 13px; font-weight: 700; }
.bv-fxlist li { padding-left: 12px; position: relative; }
.bv-fxlist li::before { content: ''; position: absolute; left: 0; top: 7px; width: 6px; height: 2px; background: var(--ink); }

/* ---------------------------------------------------------------- names on the map, camera help */
.bv-maplabels { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.bv-maplabel { position: absolute; left: 0; top: 0; will-change: transform; }
.bv-maplabel .plate {
  position: absolute; left: 0; bottom: 14px; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center;
  padding: 3px 8px 2px; background: var(--ink); color: #fff; border-radius: 3px; border-bottom: 3px solid var(--hi); white-space: nowrap;
  font-size: 13px; line-height: 1.2; box-shadow: 0 4px 12px rgba(6, 14, 24, 0.5);
}
.bv-maplabel .plate::after { content: ''; position: absolute; left: 50%; top: 100%; width: 2px; height: 14px; margin: 3px 0 0 -1px; background: var(--hi); }
.bv-maplabel .plate span { font-size: 11px; color: var(--fog); }
.bv-maplabel .plate.is-served { border-bottom-color: var(--good-on-ink); }
.bv-maplabel .plate.is-served::after { background: var(--good-on-ink); }
.bv-maplabel .plate.is-stretch { opacity: 0.8; }
/* A plate held at the edge of the free map no longer stands over its point: no pin. */
.bv-maplabel.is-edge .plate::after { display: none; }
.bv-camhelp { position: absolute; left: 12px; bottom: 14px; padding: 5px 9px 4px; background: rgba(14, 28, 43, 0.82); color: var(--fog); border-radius: 3px; font-size: 12px; white-space: nowrap; }
.bv-camhelp b { color: #fff; margin-left: 8px; }
.bv-camhelp b:first-child { margin-left: 0; }

/* ---------------------------------------------------------------- toolbar */
.bv-toolbar { position: absolute; left: 50%; bottom: 12px; transform: translateX(-50%); display: flex; align-items: stretch; background: var(--ink); color: #fff; border-radius: 3px; box-shadow: 0 10px 26px rgba(6, 14, 24, 0.5); }
.bv-toolbar .grp { display: flex; align-items: center; gap: 4px; padding: 7px 8px; border-right: 1px solid var(--ink-3); position: relative; }
.bv-toolbar .grp:last-child { border-right: 0; }
.bv .bv-tool { display: flex; align-items: center; gap: 7px; min-height: 36px; padding: 4px 11px 3px 6px; border-radius: 3px; border: 1.5px solid transparent; color: #fff; font-weight: 700; white-space: nowrap; }
.bv .bv-tool:hover:not(:disabled) { background: var(--ink-2); }
.bv .bv-tool[aria-pressed='true'] { background: #fff; color: var(--ink); }
.bv .bv-tool[aria-pressed='true']:hover:not(:disabled) { background: var(--paper-2); color: var(--ink); }
.bv .bv-tool[aria-pressed='true'] .bv-bullet { background: var(--hi); color: #1a0a02; }
.bv .bv-tool:disabled { color: #6f8496; }
.bv .bv-tool:disabled .bv-bullet { background: transparent; color: #6f8496; box-shadow: inset 0 0 0 1.5px var(--ink-3); }

/* ---------------------------------------------------------------- drive instruments */
.bv-drive { position: absolute; left: 50%; bottom: 72px; transform: translateX(-50%); display: flex; align-items: stretch; background: var(--ink); color: #fff; border-radius: 3px; box-shadow: 0 10px 26px rgba(6, 14, 24, 0.5); border-top: 3px solid var(--hi); }
.bv-drive .cell { display: flex; flex-direction: column; justify-content: center; gap: 3px; padding: 8px 12px 6px; border-right: 1px solid var(--ink-3); min-width: 0; }
.bv-drive .cell:last-child { border-right: 0; }
.bv-drive .k { font-size: 11px; line-height: 1.1; color: var(--fog); white-space: nowrap; }
.bv-drive .v { font: 700 24px/1 var(--f-sign); padding-top: 3px; white-space: nowrap; }
.bv-drive .v small { font: 400 12px/1 var(--f-text); color: var(--fog); }
.bv-drive .s { font-size: 12px; line-height: 1.2; color: var(--fog); white-space: nowrap; }
.bv-drive .s.bv-bad, .bv-drive .v.bv-bad { color: var(--bad-on-ink); }
.bv-thrust { display: flex; gap: 3px; align-items: flex-end; height: 26px; }
.bv-thrust i { width: 9px; background: var(--ink-3); border-radius: 1px; }
.bv-thrust i.on { background: var(--hi); }
.bv-needle { position: relative; width: 74px; height: 74px; border-radius: 50%; border: 2px solid var(--fog); background: var(--ink-2); flex: none; }
.bv-needle::before, .bv-needle::after { content: ''; position: absolute; background: var(--ink-3); }
.bv-needle::before { left: 50%; top: 4px; bottom: 4px; width: 1px; }
.bv-needle::after { top: 50%; left: 4px; right: 4px; height: 1px; }
.bv-needle .tol { position: absolute; border: 1.5px dashed var(--good-on-ink); border-radius: 50%; transform: translate(-50%, -50%); left: 50%; top: 50%; }
.bv-needle .dot { position: absolute; width: 12px; height: 12px; margin: -6px 0 0 -6px; border-radius: 50%; background: var(--good-on-ink); box-shadow: 0 0 0 2px var(--ink); z-index: 1; }
.bv-needle.is-off { border-color: var(--bad-on-ink); }
.bv-needle.is-off .dot { background: var(--bad-on-ink); }
.bv-dev { flex-direction: row !important; align-items: center; gap: 10px !important; }
.bv-dev .s { display: block; }
.bv-geo { display: inline-block; width: 12px; height: 12px; border-radius: 2px; margin-right: 6px; vertical-align: -1px; box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.5); }
.bv-keys { display: grid; grid-template-columns: auto auto; gap: 2px 8px; font-size: 12px; line-height: 1.25; color: var(--fog); white-space: nowrap; }
.bv-keys kbd, .bv-kbd { font: 700 11px/1.3 var(--f-text); padding: 1px 4px 0; border: 1px solid currentColor; border-radius: 2px; }
.bv-keys kbd { color: #fff; border-color: var(--fog); }
.bv-drive .acts { display: flex; flex-direction: column; gap: 4px; }
/* The instrument cells have fixed widths: the strip does not change size or slide sideways when a number gains a digit. */
.bv-drive[aria-label] > .cell:nth-child(1) { width: 172px; }
.bv-drive[aria-label] > .cell:nth-child(1) .s { white-space: normal; }
.bv-drive[aria-label] > .cell:nth-child(2) { width: 68px; }
.bv-drive[aria-label] > .cell:nth-child(3) { width: 150px; }
.bv-drive[aria-label] > .cell:nth-child(4) { width: 150px; }
.bv-drive[aria-label] > .cell:nth-child(5) { width: 204px; }
.bv-drive[aria-label] > .cell:nth-child(6) { width: 250px; }
.bv .bv-drive .bv-btn { min-height: 28px; padding: 3px 10px 2px; font-size: 13px; white-space: nowrap; }

/* ---------------------------------------------------------------- toasts and the breakthrough banner */
/* Notices stand in the top right corner, one width, left edges in line. Beside an open side sheet, and below a banner. */
.bv-toasts { position: absolute; top: 104px; right: 12px; width: 340px; max-width: calc(100% - 24px); display: flex; flex-direction: column; gap: 4px; align-items: stretch; }
.bv-toasts.is-beside-sheet { right: 438px; }
.bv-toasts.is-under-banner { top: 392px; }
.bv .bv-toast { width: 100%; display: flex; align-items: baseline; gap: 8px; padding: 6px 12px 5px; background: var(--ink); color: #fff; border-radius: 3px; border-left: 5px solid var(--fog); font-size: 13px; line-height: 1.3; box-shadow: 0 8px 20px rgba(6, 14, 24, 0.45); animation: bv-drop 180ms ease-out; }
.bv-toast.is-good { border-left-color: var(--good-on-ink); }
.bv-toast.is-bad { border-left-color: var(--bad-on-ink); }
@keyframes bv-drop { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }
.bv-banner { position: absolute; top: 232px; left: 0; right: 0; display: flex; justify-content: center; pointer-events: none; }
.bv-banner .plate { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 14px 44px 10px; background: var(--ink); color: #fff; border-top: 6px solid var(--hi); border-bottom: 6px solid var(--hi); min-width: 60%; animation: bv-through 520ms cubic-bezier(0.2, 0.9, 0.2, 1); }
.bv-banner .big { font: 700 64px/0.95 var(--f-sign); letter-spacing: 0.04em; padding-top: 8px; }
.bv-banner .line { font-size: 16px; color: var(--fog); }
@keyframes bv-through { from { clip-path: inset(0 50% 0 50%); opacity: 0.4; } to { clip-path: inset(0 0 0 0); opacity: 1; } }
.bv-flash { position: absolute; inset: 0; background: #fff; pointer-events: none; animation: bv-flash 700ms ease-out forwards; }
@keyframes bv-flash { from { opacity: 0.85; } to { opacity: 0; } }

/* ---------------------------------------------------------------- the gate card */
/* In the centre of the map, between the two top bars and the toolbar: the next step is where the eye is. */
.bv-gatecard { position: absolute; top: 112px; bottom: 84px; left: 50%; transform: translateX(-50%); width: 540px; max-width: calc(100% - 24px); display: flex; align-items: center; pointer-events: none; }
/* With the backlash box up (folded to its header under a gate), the card ends above it. */
.bv-gatecard:has(~ .bv-backlash) { bottom: 120px; }
.bv-gatecard .bv-sheet { width: 100%; max-height: 100%; pointer-events: auto; border-top: 5px solid var(--hi); }
.bv-gatecard .what { font-size: 15px; line-height: 1.4; }
.bv .bv-offer { display: grid; grid-template-columns: 1fr auto; gap: 0 10px; align-items: baseline; width: 100%; padding: 5px 9px 4px; margin-top: 4px; border: 1.5px solid var(--rule); border-radius: 3px; background: #fff; }
.bv .bv-offer:hover { border-color: var(--ink); }
.bv-offer .name { font-weight: 700; }
.bv-offer .cost { font: 700 17px/1 var(--f-sign); white-space: nowrap; }
.bv-offer .fx { grid-column: 1 / -1; font-size: 12px; color: var(--good); font-weight: 700; }
.bv-notes li { font-size: 12.5px; line-height: 1.35; padding: 2px 0 2px 9px; border-left: 3px solid var(--hi); margin: 4px 0; }

/* ---------------------------------------------------------------- modal: event card */
.bv-scrim { position: absolute; inset: 0; background: rgba(8, 16, 26, 0.45); display: grid; place-items: center; }
.bv-event { width: 540px; max-height: calc(100% - 48px); }
.bv-event .bv-sheet-head { background: var(--bad); }
.bv-event .bv-sheet-head .sub { color: #ffd9db; }
.bv-event h3.title { font: 700 34px/1 var(--f-sign); padding-top: 4px; letter-spacing: 0.01em; }
.bv-event .desc { font-size: 16px; line-height: 1.4; }
.bv .bv-choice { display: grid; grid-template-columns: 1fr auto; gap: 2px 12px; width: 100%; padding: 9px 12px 7px; border: 1.5px solid var(--ink); border-radius: 3px; background: #fff; }
.bv .bv-choice:hover:not(:disabled) { box-shadow: inset 4px 0 0 var(--hi); }
.bv .bv-choice:disabled { border-color: var(--rule); background: var(--paper-2); color: #7d8c99; }
.bv-choice .lab { font-weight: 700; font-size: 15px; }
.bv-choice .costs { display: flex; gap: 10px; font: 700 17px/1.2 var(--f-sign); white-space: nowrap; }
.bv-choice .why { grid-column: 1 / -1; font-size: 12px; }

/* ---------------------------------------------------------------- title and briefing: the station sign */
.bv-title { position: absolute; top: 0; left: 0; bottom: 0; width: 420px; background: var(--ink); color: #fff; display: flex; flex-direction: column; border-right: 6px solid var(--hi); }
.bv-sign { padding: 22px 26px 14px; border-bottom: 1px solid var(--ink-3); }
.bv-sign h1 { font: 700 52px/0.9 var(--f-sign); letter-spacing: 0.01em; text-transform: uppercase; padding-top: 10px; }
.bv-sign .pitch { margin-top: 10px; font-size: 16px; line-height: 1.35; color: var(--fog); max-width: 36ch; }
.bv-sign .target { margin-top: 6px; font-size: 13px; line-height: 1.35; color: var(--hi); max-width: 40ch; }
/* The mission comparison: a sheet beside the mission list, over the map backdrop. */
.bv-vibe { position: absolute; top: 14px; right: 16px; padding: 4px 9px 3px; background: var(--ink); color: #fff; border: 1px solid var(--hi); border-radius: 3px; font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; pointer-events: none; }
.bv-cb { position: absolute; left: 442px; bottom: 16px; max-width: calc(100% - 458px); }
.bv-cb-body { padding: 6px 12px 10px; overflow-x: auto; }
.bv-cb table { border-collapse: collapse; font-size: 12.5px; white-space: nowrap; }
.bv-cb th, .bv-cb td { padding: 4px 8px 3px; text-align: right; border-bottom: 1px solid var(--paper-2); }
.bv-cb th:first-child, .bv-cb td:first-child { text-align: left; padding-left: 0; }
.bv-cb thead th { font-size: 11.5px; border-bottom: 1.5px solid var(--ink); vertical-align: bottom; }
.bv-cb tbody tr:last-child td { border-bottom: 0; }
/* The 2x Poland target: live in the top band, a pass or fail line on the scorecard. */
/* The time line is the same width at 0.94x and at 183x. */
.bv-headline .bv-target .v > span { display: inline-block; width: 9.5ch; }
.bv-target .is-met { color: var(--good-on-ink); }
.bv-target .is-missed { color: var(--bad-on-ink); }
.bv-target-line { margin: 8px 0 2px; padding: 6px 10px 5px; font-size: 14px; border-left: 5px solid var(--bad); background: #fff; }
.bv-target-line.is-met { border-left-color: var(--good); }
/* Social media backlash: wide, bottom centre, above the toolbar; centred in what the open sheet and tool panel leave free. */
.bv-backlash { --l: 0px; --r: 0px; position: absolute; left: calc(var(--l) + (100% - var(--l) - var(--r)) / 2); bottom: 76px; transform: translateX(-50%); width: min(600px, calc(100% - var(--l) - var(--r) - 24px)); background: var(--ink); color: #fff; border-radius: 3px; border-top: 4px solid var(--bad); box-shadow: 0 0 0 1.5px var(--bad), 0 14px 34px rgba(6, 14, 24, 0.6); font-size: 13px; }
.bv-backlash.is-beside-sheet { --r: 424px; }
.bv-backlash.is-beside-tool { --l: 312px; }
.bv-backlash.is-over-drive { bottom: 176px; }
.bv-backlash .flash { position: absolute; inset: 0; border-radius: 3px; background: var(--bad); opacity: 0; pointer-events: none; animation: bv-post-flash 0.5s ease-out; }
.bv-backlash .head { display: flex; align-items: baseline; gap: 10px; padding: 6px 10px 4px; color: var(--fog); font-size: 12px; }
.bv-backlash .head .title { font: 700 15px/1 var(--f-sign); letter-spacing: 0.03em; color: #fff; }
.bv-backlash .head .angry { color: var(--bad-on-ink); font-weight: 700; font-size: 13px; }
.bv-backlash .head .bv-link { margin-left: auto; font-size: 12px; }
.bv-backlash .more { color: #fff; font-weight: 700; }
.bv-backlash ul { list-style: none; margin: 0; padding: 0; }
.bv-backlash li { display: grid; grid-template-columns: auto 1fr auto; gap: 0 10px; align-items: baseline; padding: 5px 10px; border-top: 1px solid var(--ink-3); }
.bv-backlash li.is-fresh { animation: bv-post-shake 0.45s ease-out; }
.bv-backlash .handle { font-weight: 700; color: var(--hi); }
.bv-backlash .stats { color: var(--fog); font-size: 11.5px; white-space: nowrap; }
.bv-backlash .stats b { color: #fff; }
.bv .bv-backlash .x { color: var(--fog); font-weight: 700; padding: 0 4px; line-height: 1; }
.bv .bv-backlash .x:hover { color: #fff; }
.bv-backlash p { grid-column: 1 / -1; margin: 1px 0 0; line-height: 1.3; }
@keyframes bv-post-flash { from { opacity: 0.6; } to { opacity: 0; } }
@keyframes bv-post-shake { 0% { transform: translateX(0); background: rgba(212, 34, 43, 0.45); } 20% { transform: translateX(-8px); } 40% { transform: translateX(7px); } 60% { transform: translateX(-5px); } 80% { transform: translateX(3px); } 100% { transform: translateX(0); background: transparent; } }
/* The backlash on the scorecard: the same posts on paper. */
.bv-backlash-record ul { list-style: none; margin: 0; padding: 0; }
.bv-backlash-record li { display: grid; grid-template-columns: auto 1fr; gap: 0 8px; align-items: baseline; padding: 3px 0; border-bottom: 1px solid var(--paper-2); font-size: 12.5px; }
.bv-backlash-record li:last-child { border-bottom: 0; }
.bv-backlash-record .handle { font-weight: 700; color: var(--bad); }
.bv-backlash-record .stats { color: var(--soft); font-size: 11.5px; }
.bv-backlash-record p { grid-column: 1 / -1; margin: 1px 0 0; line-height: 1.3; }
/* Housing options: a title, what it is, the numbers, one button. */
.bv-housing { display: flex; flex-direction: column; gap: 8px; list-style: none; margin: 0; padding: 0; }
.bv-housing > li { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; padding: 6px 9px; border-left: 3px solid var(--hi); background: #fff; }
.bv-housing > li.is-enacted { border-left-color: var(--good); }
.bv-housing .nums { font-size: 12.5px; font-weight: 700; }
.bv-cb tr.with-housing td { padding-top: 0; font-size: 11.5px; color: var(--soft); }
.bv-cb tr.has-housing td { border-bottom: 0; }
.bv-section-mark { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; color: var(--fog); font-size: 12px; }
/* Twin bore cross-section with its dimension: the Polish baseline, drawn once. */
.bv-bore { display: flex; align-items: center; gap: 6px; }
.bv-bore i { width: 20px; height: 20px; border-radius: 50%; border: 3px solid var(--hi); }
.bv-title-acts { display: flex; gap: 6px 10px; align-items: center; padding: 12px 26px; border-bottom: 1px solid var(--ink-3); flex-wrap: wrap; }
.bv-title-acts .save { font-size: 12px; color: var(--fog); flex: 1 1 100%; }
.bv-missions { flex: 1; min-height: 0; overflow-y: auto; padding: 6px 14px; display: flex; flex-direction: column; gap: 2px; }
.bv .bv-mission { display: grid; grid-template-columns: 26px 1fr auto; gap: 0 10px; align-items: start; width: 100%; padding: 6px 12px 5px; border-radius: 3px; color: #fff; }
.bv .bv-mission:hover:not(:disabled) { background: var(--ink-2); }
.bv .bv-mission .name { font: 700 22px/1 var(--f-sign); padding-top: 4px; letter-spacing: 0.02em; }
.bv .bv-mission .pitch { grid-column: 2 / -1; font-size: 12px; line-height: 1.35; color: var(--fog); display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
.bv .bv-mission:disabled .name { color: #7f93a6; }
.bv .bv-mission .lock { grid-column: 2 / -1; font-size: 12px; color: var(--hi); }
.bv-mission .bv-bullet { margin-top: 1px; }
.bv-stars { font-size: 15px; letter-spacing: 2px; white-space: nowrap; color: var(--hi); }
.bv-stars .off { color: var(--ink-3); }
.bv-sheet .bv-stars .off { color: var(--rule); }
.bv-title-links { display: flex; gap: 12px; flex: none; align-items: flex-start; }
.bv-title-foot { padding: 10px 26px 14px; font-size: 12px; color: var(--fog); border-top: 1px solid var(--ink-3); display: flex; justify-content: space-between; gap: 12px; }
.bv-title-error { margin: 10px 26px 0; padding: 6px 10px; background: var(--bad); color: #fff; font-size: 13px; border-radius: 3px; }
.bv-brief { position: absolute; top: 16px; left: 16px; bottom: 16px; width: 404px; display: flex; flex-direction: column; justify-content: center; }
.bv-brief .bv-sheet { max-height: 100%; }
.bv-brief-facts { display: grid; grid-template-columns: 84px 1fr; gap: 0; }
.bv-brief-facts dt { font-size: 12px; color: var(--soft); padding: 7px 0 6px; border-bottom: 1px solid var(--paper-2); }
.bv-brief-facts dd { font-size: 14px; line-height: 1.35; padding: 6px 0 5px; border-bottom: 1px solid var(--paper-2); }
.bv-brief-facts dd.ghost { font: 700 22px/1.1 var(--f-sign); padding-top: 8px; }
.bv-objectives li { display: grid; grid-template-columns: 18px 1fr; gap: 6px; padding: 3px 0; align-items: baseline; }
.bv-objectives .box { width: 12px; height: 12px; border: 2px solid var(--ink); border-radius: 2px; align-self: center; }
.bv-objectives .is-done .box { background: var(--good); border-color: var(--good); }
.bv-objectives .is-failed .box { background: var(--bad); border-color: var(--bad); }
.bv-objectives .is-stretch { color: var(--soft); }
.bv-objectives .detail { grid-column: 2; font-size: 12px; color: var(--soft); }
.bv-foot { flex: none; display: flex; gap: 8px; align-items: center; justify-content: flex-end; padding: 10px 12px; border-top: 1.5px solid var(--ink); }
.bv-foot .grow { flex: 1; }
.bv-loading { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 420px; padding: 18px 20px; background: var(--ink); color: #fff; border-radius: 3px; border-top: 4px solid var(--hi); }
.bv-loading .label { font: 700 26px/1 var(--f-sign); padding-top: 4px; margin-bottom: 10px; }
.bv-loading .bv-bar { background: var(--ink-3); }
.bv-loading .bv-bar > i { background: var(--hi); }

/* ---------------------------------------------------------------- scorecard */
.bv-score { width: min(1120px, calc(100% - 48px)); max-height: calc(100% - 32px); }
.bv-score .bv-sheet-body { gap: 14px; padding: 14px 16px; }
/* Confetti over the scorecard. A piece is invisible until its animation runs: with reduced motion nothing shows. */
.bv-confetti { position: absolute; inset: 0; overflow: hidden; pointer-events: none; z-index: 2; }
.bv-confetti i { position: absolute; top: -24px; opacity: 0; border-radius: 1px; animation: bv-confetti 3s cubic-bezier(0.2, 0.6, 0.4, 1) 1 both; }
@keyframes bv-confetti {
  0% { opacity: 1; transform: translate(0, 0) rotate(0deg); }
  80% { opacity: 1; }
  100% { opacity: 0; transform: translate(var(--drift, 0), 105vh) rotate(var(--spin, 720deg)); }
}
.bv-score-top { display: grid; grid-template-columns: 1fr auto; gap: 16px; align-items: center; }
.bv-score-top .verdict { font: 700 30px/1.05 var(--f-sign); padding-top: 4px; }
.bv-score-top .bv-stars { font-size: 44px; letter-spacing: 4px; line-height: 1; }
.bv-score-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr); gap: 20px; align-items: start; }
.bv-cols { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.bv-col { padding: 9px 10px 8px; border: 1.5px solid var(--ink); border-radius: 3px; background: #fff; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.bv-col.is-you { box-shadow: inset 0 5px 0 var(--hi); padding-top: 13px; }
.bv-col .who { font-weight: 700; line-height: 1.2; }
.bv-col .cost { font: 700 34px/1 var(--f-sign); padding-top: 6px; }
.bv-col .km { font: 700 19px/1 var(--f-sign); padding-top: 2px; }
.bv-col .date { margin-top: 5px; font-weight: 700; }
.bv-score-side { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
/* The receipt on the right is the longer column: the three figures stay in view while it scrolls. */
.bv-score-side:first-child { position: sticky; top: 0; }

/* ---------------------------------------------------------------- menu, help, credits */
.bv-menu-list { display: flex; flex-direction: column; gap: 6px; }
.bv .bv-menu-list .bv-btn { justify-content: flex-start; min-height: 38px; font-size: 15px; }
.bv-help { display: grid; grid-template-columns: auto 1fr; gap: 5px 12px; align-items: baseline; }
.bv-help dt { white-space: nowrap; }
.bv-credits p { font-size: 13px; line-height: 1.45; }
.bv-credits .who { font-weight: 700; }

.bv-fatal { position: absolute; top: 0; left: 0; right: 0; display: flex; gap: 12px; align-items: center; justify-content: space-between; padding: 10px 14px; background: var(--bad); color: #fff; }

/* ---------------------------------------------------------------- short and narrow windows */
/* The title sheet at 720 px with a saved game: the sign gives up height so the mission list is not cut off. */
@media (max-height: 800px) {
  .bv-sign { padding: 14px 26px 10px; }
  .bv-sign h1 { font-size: 42px; padding-top: 6px; }
  .bv-sign .pitch { font-size: 14px; margin-top: 6px; }
  .bv-section-mark { margin-bottom: 6px; }
  .bv-title-acts { padding: 8px 26px; }
  .bv .bv-mission { padding: 4px 12px 3px; }
  .bv-missions { padding: 2px 14px; gap: 0; }
  .bv .bv-mission .name { font-size: 20px; }
  .bv-title-foot { padding: 7px 26px 9px; }
}
/* Narrow windows keep the buttons: labels and the time line go first, the cost ratio and the panels stay. */
@media (max-width: 1200px) {
  .bv-headline .bv-target .k { display: none; }
}
@media (max-width: 1100px) {
  .bv-hold-slot, .bv-stops, .bv-lapse { display: none; }
  .bv-speed { width: 322px; }
  .bv-top-cell { padding: 0 9px; }
  .bv-headline { gap: 8px; padding: 0 8px; }
}
@media (max-width: 960px) {
  .bv-headline .pair, .bv-headline .none { display: none; }
}
@media (max-width: 900px) {
  .bv-cb { display: none; }
  .bv-backlash.is-beside-sheet, .bv-backlash.is-beside-tool { --l: 0px; --r: 0px; }
  .bv-headline { flex: 1 1 0; justify-content: center; }
  .bv-nav { gap: 3px; padding: 0 6px; }
  .bv .bv-nav .bv-btn { padding: 4px 6px 3px; font-size: 12px; }
  .bv-speed { gap: 2px; padding: 0 6px; width: 258px; }
  .bv .bv-speed .bv-btn { min-width: 30px; padding: 4px 4px 2px; font-size: 14px; }
  .bv-top-cell .k { display: none; }
  .bv-top-cell .v { font-size: 18px; padding-top: 0; }
  .bv-headline .gap { font-size: 20px; padding: 4px 6px 1px; }
  .bv-objective .what { display: none; }
}
@media (max-width: 700px) {
  .bv-top-cell:first-child { display: none; }
  .bv-toolbar { flex-wrap: wrap; justify-content: center; max-width: calc(100% - 12px); }
  .bv-toolbar .grp { padding: 4px 5px; }
  .bv-camhelp { display: none; }
  .bv-backlash, .bv-backlash.is-over-drive { bottom: 124px; }
  .bv-left, .bv-right, .bv-right.is-wide { width: calc(100% - 24px); }
}

@media (prefers-reduced-motion: reduce) {
  .bv *, .bv *::before, .bv *::after { animation: none !important; transition: none !important; }
}
`;
