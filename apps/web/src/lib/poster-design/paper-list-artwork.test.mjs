import { expect, test } from 'bun:test';
import { PosterElementSchema } from '@edgeever/shared';
import { paperListPaper } from './paper-list-artwork';
import { posterPrimitiveFromObject } from './templates';

const primitives = (width, height) => paperListPaper(width, height, '#171714').map(posterPrimitiveFromObject);

test('paper texture stays deterministic and serializable at the largest supported size', () => {
  const first = primitives(4096, 4096);
  expect(first).toEqual(primitives(4096, 4096));
  expect(first).toHaveLength(6);
  for (const element of first) {
    expect(PosterElementSchema.parse(JSON.parse(JSON.stringify(element)))).toEqual(element);
    expect(element.x).toBe(0);
    expect(element.y).toBe(0);
    expect(element.width).toBe(4096);
    expect(element.height).toBe(4096);
  }
  const fibres = first.filter(element => element.name.endsWith('-fibres'));
  expect(fibres).toHaveLength(2);
  for (const element of fibres) {
    expect(element.type).toBe('path');
    expect(element.path.length).toBeLessThan(100_000);
    expect(element.opacity).toBeLessThan(0.2);
  }
});

test('soft paper lighting retains transparency through conversion', () => {
  const light = primitives(1080, 1440)[0];
  expect(light.gradient.kind).toBe('radial');
  expect(light.gradient.stops.at(-1).color).toBe('rgba(255,255,255,0)');
});


test('a soft crease and radial wear avoid repeated decorative fold bands', () => {
  const creases = primitives(1080, 1440).filter(element => element.name === 'paper-list:paper:crease');
  expect(creases).toHaveLength(2);
  expect(creases.map(element => element.gradient.kind)).toEqual(["linear", "radial"]);
  for (const crease of creases) {
    expect(crease.type).toBe('rect');
    expect(['linear', 'radial']).toContain(crease.gradient.kind);
    expect(crease.gradient.stops.at(-1).color).toMatch(/,0\)$/);
    if (crease.gradient.kind === "linear") {
      expect(crease.gradient.stops[0].color).toMatch(/,0\)$/);
      expect(crease.gradient.stops.length).toBeGreaterThan(4);
    }
  }
});
