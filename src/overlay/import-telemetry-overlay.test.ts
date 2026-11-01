import test from 'node:test';
import assert from 'node:assert/strict';
import { importTelemetryOverlay } from './import-telemetry-overlay.ts';

const file = {
  project: { colors: { gauge: [255, 190, 61], text: [255, 255, 255] } },
  gauges: [
    { type: 'Speedometer', visual: { name: 'Speed', position: [0.5, 0.5], size: 2, units: { unit: 'km/h' }, colors: { gauge: [1, 2, 3] }, max: { set: true, value: 60 } } },
    { type: 'Custom circular', custom: { streams: ['Cadence'] }, visual: { position: [0.2, 0.2], size: 1, hidden: true } },
    { type: 'Distance Home', visual: {} },
  ],
};

test('brings across position, colour, units and scale', () => {
  const [speed] = importTelemetryOverlay(file, 'Mine').template.widgets;
  assert.equal(speed.channel, 'speed');
  assert.equal(speed.display, 'dial');
  assert.ok(Math.abs(speed.x + speed.width / 2 - 0.5) < 1e-9);
  assert.equal(speed.style.color, '#010203');
  assert.equal(speed.style.unit, 'kmh');
  assert.equal(speed.style.max, 60);
});

test('maps custom gauges by their data and keeps hidden ones hidden', () => {
  const cadence = importTelemetryOverlay(file, 'Mine').template.widgets[1];
  assert.equal(cadence.channel, 'cadence');
  assert.equal(cadence.hidden, true);
});

test('reports gauges it cannot bring across', () => {
  assert.deepEqual(importTelemetryOverlay(file, 'Mine').skipped, ['Distance Home']);
});

test('rejects other files', () => {
  assert.throws(() => importTelemetryOverlay({ foo: 1 }, 'x'), /Telemetry Overlay/);
});
