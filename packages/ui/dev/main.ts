/**
 * Dev page: mounts the UI on a fixture scene with the recording fake services.
 * /dev.html lists the scenes; /dev.html?scene=<id> shows one. The fake is on window.__ui for tests.
 */
import { mountUi, type UiHandle } from '../src/index.ts';
import { createFakeServices, type FakeServices, SCENE_IDS, SCENES, type SceneId, TOOL_STATUSES } from '../src/testing/index.ts';

declare global {
  interface Window {
    __ui?: { services: FakeServices; handle: UiHandle; scene: SceneId };
  }
}

const id = new URLSearchParams(location.search).get('scene');
const root = document.getElementById('ui');
if (root === null) throw new Error('dev page: #ui is missing');

if (id === null) {
  const index = document.createElement('div');
  index.id = 'index';
  index.innerHTML = `<h1>UI scenes</h1><ul>${SCENE_IDS.map((s) => `<li><a href="?scene=${s}">${s}</a>: ${SCENES[s].about}</li>`).join('')}</ul>`;
  document.body.appendChild(index);
} else {
  if (!SCENE_IDS.includes(id as SceneId)) throw new Error(`dev page: unknown scene "${id}" (known: ${SCENE_IDS.join(', ')})`);
  const sceneId = id as SceneId;
  const scene = SCENES[sceneId];
  const services = createFakeServices({ ...scene, toolStatuses: TOOL_STATUSES });
  const handle = mountUi(root, services);
  if (scene.panel !== null) handle.store.panel.value = scene.panel;
  if (scene.followUp !== undefined) services.setSnapshot(scene.followUp);
  window.__ui = { services, handle, scene: sceneId };
}
