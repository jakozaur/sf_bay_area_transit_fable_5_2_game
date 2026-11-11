/** Menu, controls help and credits. */
import { Fragment, type JSX } from 'preact';
import { useState } from 'preact/hooks';
import { BUILD, BUILD_FACTS, GITHUB_URL } from './about.ts';
import { Btn, Sheet, type StoreProps } from './bits.tsx';
import { dateLong } from './format.ts';
import { act } from './model.ts';

export function MenuPanel({ store }: StoreProps): JSX.Element {
  const [confirmRestart, setConfirmRestart] = useState(false);
  const session = store.services.session;
  const muted = store.muted.value;
  const save = store.session.value.saves[0];
  return (
    <Sheet store={store} id="menu" title="Menu" sub={store.snapshot.value.mission.title}>
      <div class="bv-menu-list">
        <Btn
          testId="menu-save"
          onClick={() =>
            act(store, async () => {
              const info = await session.save();
              store.notify(`Saved: ${info.title}, ${dateLong(info.date)}`, 'good');
            })
          }
        >
          Save
        </Btn>
        {save !== undefined && <p class="bv-note">Last save: {dateLong(save.date)}.</p>}
        {confirmRestart ? (
          <>
            <p class="bv-bad bv-small">
              <b>Restart from day one? Everything built and dug in this mission is lost.</b>
            </p>
            <Btn
              kind="primary"
              testId="menu-restart-confirm"
              onClick={() => {
                setConfirmRestart(false);
                store.openPanel(null);
                act(store, () => session.restart());
              }}
            >
              Yes, restart the mission
            </Btn>
            <Btn testId="menu-restart-cancel" onClick={() => setConfirmRestart(false)}>
              Keep going
            </Btn>
          </>
        ) : (
          <Btn testId="menu-restart" onClick={() => setConfirmRestart(true)}>
            Restart mission
          </Btn>
        )}
        <Btn
          testId="menu-missions"
          onClick={() => {
            store.openPanel(null);
            act(store, () => session.toTitle());
          }}
        >
          Mission select
        </Btn>
        <Btn testId="menu-help" onClick={() => store.openPanel('help')}>
          Controls
        </Btn>
        <Btn testId="menu-mute" pressed={muted} onClick={() => act(store, () => store.services.audio.setMuted(!muted))}>
          {muted ? 'Sound is off' : 'Sound is on'}
        </Btn>
        <Btn testId="menu-credits" onClick={() => store.openPanel('credits')}>
          Credits
        </Btn>
      </div>
      <p class="bv-note">Mission select saves the game first.</p>
    </Sheet>
  );
}

const HELP: { title: string; rows: [string, string][] }[] = [
  {
    title: 'Camera',
    rows: [
      ['Drag, W A S D', 'pan'],
      ['Right-drag, Q E', 'rotate'],
      ['Wheel, + -', 'zoom'],
      ['R F', 'tilt'],
    ],
  },
  {
    title: 'Tools',
    rows: [
      ['1 2 3 4', 'plan, station, dig, drive'],
      ['Click', 'add a waypoint, place, dig'],
      ['Drag a waypoint', 'move it'],
      ['Right-click', 'delete what is under the cursor'],
      ['Enter', 'finish the alignment'],
      [', .', 'depth of the line or the waypoint, size of the dig brush'],
      ['Ctrl+Z, Ctrl+Shift+Z', 'undo and redo a plan edit'],
      ['Esc', 'close a panel, drop the selection, put the tool away, stop following'],
    ],
  },
  {
    title: 'Driving a machine',
    rows: [
      ['W S', 'thrust up and down'],
      ['A D', 'steer left and right'],
      ['R F', 'pitch up and down, within the grade limit'],
      ['Space', 'autopilot: cruise along the plan'],
      ['Esc', 'leave the machine, it carries on by itself'],
    ],
  },
  {
    title: 'Time',
    rows: [
      ['Space', 'run to the next decision; pause and resume while a machine bores'],
      ['8 9 0', 'while a machine bores: Regular, Faster, Skip to end'],
    ],
  },
];

export function HelpPanel({ store }: StoreProps): JSX.Element {
  return (
    <Sheet store={store} id="help" title="Controls">
      {HELP.map((sec) => (
        <div class="bv-sec" key={sec.title}>
          <h3>{sec.title}</h3>
          <dl class="bv-help">
            {sec.rows.map(([keys, what]) => (
              <Fragment key={keys}>
                <dt>
                  <b>{keys}</b>
                </dt>
                <dd>{what}</dd>
              </Fragment>
            ))}
          </dl>
        </div>
      ))}
      <Btn testId="help-back" onClick={() => store.openPanel(store.session.value.screen === 'playing' ? 'menu' : null)}>
        Back
      </Btn>
    </Sheet>
  );
}

/** Credits, from ATTRIBUTION.md at the repo root. Keep the two in step. */
export function CreditsPanel({ store }: StoreProps): JSX.Element {
  return (
    <Sheet store={store} id="credits" title="Credits">
      <div class="bv-sec bv-credits" data-testid="credits">
        <h3>Map data</h3>
        <p>
          <span class="who">Rail, stations, roads, cities.</span> (c) OpenStreetMap contributors, via the Geofabrik NorCal extract. Open
          Database License 1.0. openstreetmap.org/copyright
        </p>
        <p>
          <span class="who">Buildings, water, land use.</span> (c) OpenStreetMap contributors, Overture Maps Foundation. Open Database
          License 1.0. Overture conflates OpenStreetMap, Microsoft ML Building Footprints, Esri Community Maps and Google Open Buildings.
          docs.overturemaps.org/attribution
        </p>
        <p>
          <span class="who">Terrain and bathymetry.</span> AWS Terrain Tiles (Mapzen terrarium). United States 3DEP (formerly NED) and
          global GMTED2010 and SRTM terrain data courtesy of the U.S. Geological Survey. Global ETOPO1 terrain data U.S. National Oceanic
          and Atmospheric Administration.
        </p>
        <p class="bv-note">The geology under the surface is procedural. No mapped geology dataset is shipped.</p>
      </div>
      <div class="bv-sec bv-credits">
        <h3>Numbers</h3>
        <p>
          Costs, dates and reform effects come from public sources: sponsor documents for the Bay Area projects, Polish road and rail
          tenders for the unit rates. Each card, reform and receipt line names its source. Figures marked unverified are tuning.
        </p>
      </div>
      <div class="bv-sec bv-credits" data-testid="credits-build">
        <h3>How it was built</h3>
        <dl class="bv-help">
          {BUILD_FACTS.map(([what, value]) => (
            <Fragment key={what}>
              <dt>
                <b>{what}</b>
              </dt>
              <dd>{value}</dd>
            </Fragment>
          ))}
        </dl>
        <p class="bv-note">Counted from the session transcripts on {BUILD.asOf}.</p>
        <p>
          Source:{' '}
          <a class="bv-link" href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
            {GITHUB_URL.replace('https://', '')}
          </a>
        </p>
      </div>
    </Sheet>
  );
}
