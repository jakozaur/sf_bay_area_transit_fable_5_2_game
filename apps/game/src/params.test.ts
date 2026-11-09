import { expect, test } from 'vitest';
import { parseParams } from './params.ts';

test('defaults', () => {
  expect(parseParams('')).toEqual({
    freeze: false,
    seed: 1,
    size: 16,
    radius: 8,
    workers: undefined,
    hud: true,
    aa: true,
    world: 'site',
    detail: 4,
    far: 64,
    cam: 0,
  });
});

test('explicit values', () => {
  expect(parseParams('?freeze=1&seed=7&size=4&radius=2&workers=0&hud=0&aa=false&world=synthetic&detail=8&far=256&cam=3')).toEqual({
    freeze: true,
    seed: 7,
    size: 4,
    radius: 2,
    workers: 0,
    hud: false,
    aa: false,
    world: 'synthetic',
    detail: 8,
    far: 256,
    cam: 3,
  });
});

test('malformed values fail naming the parameter', () => {
  expect(() => parseParams('?size=big')).toThrow(/size=big/);
  expect(() => parseParams('?radius=0')).toThrow(/radius=0/);
  expect(() => parseParams('?radius=2.5')).toThrow(/radius=2.5/);
  expect(() => parseParams('?freeze=yes')).toThrow(/freeze=yes/);
  expect(() => parseParams('?workers=')).toThrow(/workers=/);
  expect(() => parseParams('?world=mars')).toThrow(/world=mars/);
  expect(() => parseParams('?detail=5')).toThrow(/detail=5/);
  expect(() => parseParams('?far=100')).toThrow(/far=100/);
});
