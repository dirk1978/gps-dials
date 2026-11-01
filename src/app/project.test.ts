import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultTemplate } from '../overlay/template.ts';
import { addRecent, missingFiles, parseProject, projectName, type ProjectFile } from './project.ts';

const project: ProjectFile = {
  version: 1,
  name: 'Sunday ride',
  clips: [{ path: 'a.mp4', name: 'a.mp4', clockTime: 1, duration: 2 }],
  tracks: [{ path: 'b.fit', name: 'b.fit', device: 'Wahoo', start: 0, end: 9, points: 9, clips: 1 }],
  sessions: {},
  autoStarts: {},
  manualRotations: { 'a.mp4': 90 },
  template: defaultTemplate,
  format: 'png-alpha',
  activeTrack: 'b.fit',
  activeClip: 'a.mp4',
};

test('survives being saved and opened', () => {
  const back = parseProject(JSON.parse(JSON.stringify(project)));
  assert.equal(back.name, 'Sunday ride');
  assert.equal(back.manualRotations['a.mp4'], 90);
  assert.equal(back.template.widgets.length, defaultTemplate.widgets.length);
});

test('rejects files that are not projects', () => {
  assert.throws(() => parseProject({ widgets: [] }), /isn't a GPS Dials project/);
  assert.throws(() => parseProject(null), /isn't a GPS Dials project/);
});

test('fills in anything an older project lacks', () => {
  const { sessions, ...older } = JSON.parse(JSON.stringify(project));
  assert.deepEqual(parseProject(older).sessions, {});
  assert.ok(sessions);
});

test('finds files that have moved', () => {
  assert.deepEqual(missingFiles(project, path => path !== 'b.fit'), ['b.fit']);
});

test('names a project after its file', () => {
  assert.equal(projectName('C:\\Rides\\Sunday ride.gpsdials'), 'Sunday ride');
  assert.equal(projectName('/home/me/Alps.GPSDIALS'), 'Alps');
});

test('keeps recent projects newest first, without repeats', () => {
  assert.deepEqual(addRecent(['a', 'b', 'c'], 'B'), ['B', 'a', 'c']);
  assert.equal(addRecent(['a', 'b', 'c'], 'd', 3).length, 3);
});
