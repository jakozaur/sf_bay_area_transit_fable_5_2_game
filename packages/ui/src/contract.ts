/**
 * UI contract (round 2, docs/CONTRACTS.md): what the UI package consumes and what the app calls to mount it.
 * The UI talks to the game only through BayServices; tests mount it against a fake BayServices.
 * It never imports three, the renderer, the world store or packages/tools.
 */
import type { CameraStatus, GameSpeed, GameViewState, SessionState, ToolAvailability, ToolStatus } from '@bayvox/core';
import type { BayServices, GameSnapshot } from '@bayvox/sim';
import type { ReadonlySignal, Signal } from '@preact/signals';
import { mount } from './app.tsx';
import type { CostBenefitRow } from './model.ts';
import { createStore } from './store.ts';

/** Side panels opened from the HUD buttons. Title, briefing, event card and scorecard are screens driven by state, not panels. */
export const PANELS = ['project', 'design', 'reforms', 'receipt', 'menu', 'help', 'credits'] as const;
export type PanelId = (typeof PANELS)[number];

/**
 * The store every component reads. The first block mirrors the Readables of BayServices as signals
 * (one subscription each, made by createUiStore); the second block is UI-local state.
 */
export interface UiStore {
  readonly services: BayServices;
  /** Always a valid snapshot; it describes the mission in play only while session.screen is 'playing' or 'scorecard'. */
  readonly snapshot: ReadonlySignal<GameSnapshot>;
  readonly session: ReadonlySignal<SessionState>;
  readonly speed: ReadonlySignal<GameSpeed>;
  readonly view: ReadonlySignal<GameViewState>;
  readonly tool: ReadonlySignal<ToolStatus>;
  readonly toolAvailability: ReadonlySignal<ToolAvailability>;
  readonly camera: ReadonlySignal<CameraStatus>;
  readonly muted: ReadonlySignal<boolean>;

  /** Open side panel, or null. */
  readonly panel: Signal<PanelId | null>;
  /** Highest snapshot feed `seq` already shown as a banner. */
  readonly feedSeen: Signal<number>;
}

/** Props of the root component and of every screen: the store, nothing else. */
export interface UiProps {
  store: UiStore;
}

/** What the app hands the UI besides the services: static data the UI must not import a package for. */
export interface UiExtras {
  /** The cost-benefit comparison of the missions (costBenefit() of packages/scenarios), shown on the mission picker. */
  costBenefit?: readonly CostBenefitRow[];
}

export interface UiHandle {
  readonly store: UiStore;
  /** Unmounts the UI and drops every subscription made on the services. */
  dispose(): void;
}

/** Builds the store over a BayServices: subscribes to its Readables and exposes them as signals. */
export function createUiStore(services: BayServices): UiStore & { dispose(): void } {
  return createStore(services);
}

/**
 * Mounts the whole UI (title screen, briefing, HUD, panels, event cards, scorecard) into `root`, an element
 * laid over the canvas. Pointer and key events that the UI handles must not reach the canvas.
 */
export function mountUi(root: HTMLElement, services: BayServices, extras: UiExtras = {}): UiHandle {
  return mount(root, services, extras);
}
