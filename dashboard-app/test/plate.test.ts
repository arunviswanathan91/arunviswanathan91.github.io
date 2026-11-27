import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rowLabel, rowIndex, wellId, parseWellId, rectIds, sortIds, visitOrder, visitSteps, channelStride, channelChoices, nextOpenStep, upcomingSteps, markStep, undoLastStep,
  stepBox, stepLabel, fillSeries, replicates, parseLabels, dilutionSeries, formatAmount, parseNumber, csvCell, toCsv, tableRows, fileBase, geometry, wellCentre,
  isLabelled, patchWells, resizePlate, lostOnResize, legend, parsePlateMap, componentsText, formatDuration, withComponent, newPlate, labelledOnlyOn, planPass, passCount,
  viewSize, zoomWindow, type Plate,
} from '../src/extended/modules/bench/plate/logic.ts';

test('rows are lettered A to Z, then AA, AB', () => {
  assert.equal(rowLabel(0), 'A'); assert.equal(rowLabel(7), 'H'); assert.equal(rowLabel(25), 'Z');
  assert.equal(rowLabel(26), 'AA'); assert.equal(rowLabel(27), 'AB'); assert.equal(rowLabel(31), 'AF'); assert.equal(rowLabel(51), 'AZ'); assert.equal(rowLabel(52), 'BA');
  for (const i of [0, 15, 25, 26, 31, 700]) assert.equal(rowIndex(rowLabel(i)), i);
});

test('well ids are built and read back', () => {
  assert.equal(wellId(0, 0), 'A1'); assert.equal(wellId(7, 11), 'H12'); assert.equal(wellId(15, 23), 'P24'); assert.equal(wellId(26, 0), 'AA1');
  assert.deepEqual(parseWellId('P24'), { row: 15, col: 23 });
  assert.deepEqual(parseWellId('a1'), { row: 0, col: 0 });
  assert.deepEqual(parseWellId('AF48'), { row: 31, col: 47 });
  for (const bad of ['', 'A', '12', 'A0', 'A01', '1A', 'A-1', 'A1.5']) assert.equal(parseWellId(bad), null, bad);
});

test('a rectangle between two wells, and reading order', () => {
  assert.deepEqual(rectIds('B3', 'A2'), ['A2', 'A3', 'B2', 'B3']);
  assert.deepEqual(sortIds(['B1', 'A10', 'A2'], 'row'), ['A2', 'A10', 'B1']);
  assert.deepEqual(sortIds(['B1', 'A10', 'A2'], 'column'), ['B1', 'A2', 'A10']);
});

test('visiting order by row and by column', () => {
  assert.deepEqual(visitOrder(2, 3, { order: 'row' }), ['A1', 'A2', 'A3', 'B1', 'B2', 'B3']);
  assert.deepEqual(visitOrder(2, 3, { order: 'column' }), ['A1', 'B1', 'A2', 'B2', 'A3', 'B3']);
  const p384 = visitOrder(16, 24, { order: 'row' });
  assert.equal(p384.length, 384); assert.equal(p384[23], 'A24'); assert.equal(p384[24], 'B1'); assert.equal(p384[383], 'P24');
});

test('snake order turns round on every other row or column', () => {
  assert.deepEqual(visitOrder(3, 3, { order: 'row', snake: true }), ['A1', 'A2', 'A3', 'B3', 'B2', 'B1', 'C1', 'C2', 'C3']);
  assert.deepEqual(visitOrder(3, 2, { order: 'column', snake: true }), ['A1', 'B1', 'C1', 'C2', 'B2', 'A2']);
  // 96 wells by row: A1…A12, B12…B1, C1…
  const row = visitOrder(8, 12, { order: 'row', snake: true });
  assert.equal(row.length, 96); assert.equal(new Set(row).size, 96);
  assert.deepEqual(row.slice(10, 14), ['A11', 'A12', 'B12', 'B11']);
  assert.deepEqual(row.slice(22, 26), ['B2', 'B1', 'C1', 'C2']);
  assert.equal(row[95], 'H1'); // row H is the 8th: it runs backwards
  // 96 wells by column: A1…H1, H2…A2, A3…
  const col = visitOrder(8, 12, { order: 'column', snake: true });
  assert.deepEqual(col.slice(6, 10), ['G1', 'H1', 'H2', 'G2']);
  assert.deepEqual(col.slice(14, 17), ['B2', 'A2', 'A3']);
  assert.equal(col[95], 'A12');
});

test('labelled only keeps the direction of the full plate', () => {
  const only = (id: string) => ['A1', 'A3', 'B1', 'B2', 'C3'].includes(id);
  assert.deepEqual(visitOrder(3, 3, { order: 'row', only }), ['A1', 'A3', 'B1', 'B2', 'C3']);
  assert.deepEqual(visitOrder(3, 3, { order: 'row', snake: true, only }), ['A1', 'A3', 'B2', 'B1', 'C3']);
  assert.deepEqual(visitOrder(3, 3, { order: 'column', only }), ['A1', 'B1', 'B2', 'A3', 'C3']);
  assert.deepEqual(visitOrder(3, 3, { order: 'column', snake: true, only }), ['A1', 'B1', 'B2', 'A3', 'C3']);
  assert.deepEqual(visitOrder(3, 3, { order: 'row', only: () => false }), []);
});

test('multichannel steps', () => {
  assert.deepEqual(channelChoices(8, 12), [1, 8, 12]);
  assert.deepEqual(channelChoices(16, 24), [1, 8, 12]);
  assert.deepEqual(channelChoices(4, 6), [1]);
  assert.deepEqual(channelChoices(8, 8), [1, 8]);
  assert.equal(channelStride(16, 24, 8), 2); assert.equal(channelStride(6, 8, 8), 0);

  const eight = visitSteps(8, 12, { order: 'column', channels: 8 });
  assert.equal(eight.length, 12);
  assert.deepEqual(eight[0], ['A1', 'B1', 'C1', 'D1', 'E1', 'F1', 'G1', 'H1']);
  assert.deepEqual(eight[11][7], 'H12');
  const twelve = visitSteps(8, 12, { order: 'row', channels: 12 });
  assert.equal(twelve.length, 8);
  assert.deepEqual(twelve[1], ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9', 'B10', 'B11', 'B12']);
  // 384 wells: an 8-channel reaches every other row, so each column takes two steps.
  const wide = visitSteps(16, 24, { order: 'column', channels: 8 });
  assert.equal(wide.length, 48);
  assert.deepEqual(wide[0], ['A1', 'C1', 'E1', 'G1', 'I1', 'K1', 'M1', 'O1']);
  assert.deepEqual(wide[1], ['B1', 'D1', 'F1', 'H1', 'J1', 'L1', 'N1', 'P1']);
  assert.deepEqual(wide[47][7], 'P24');
  // Labelled only: empty wells leave a step, empty steps go.
  const some = visitSteps(8, 12, { order: 'column', channels: 8, only: (id) => id === 'B1' || id === 'C1' || id === 'A3' });
  assert.deepEqual(some, [['B1', 'C1'], ['A3']]);
  // One channel: one well per step, in visiting order; a pipette that does not fit falls back to that.
  assert.deepEqual(visitSteps(2, 2, { order: 'column' }), [['A1'], ['B1'], ['A2'], ['B2']]);
  assert.deepEqual(visitSteps(2, 2, { order: 'row', channels: 8 }), [['A1'], ['A2'], ['B1'], ['B2']]);
});

test('moving through the steps', () => {
  const steps = visitSteps(2, 2, { order: 'row' }); // A1 A2 B1 B2
  let done: string[] = [];
  done = markStep(done, steps[0]); done = markStep(done, steps[2]);
  assert.deepEqual(done, ['A1', 'B1']);
  assert.deepEqual(markStep(done, ['A1']), ['A1', 'B1']);
  const set = new Set(done);
  assert.equal(nextOpenStep(steps, set, 0), 1);
  assert.equal(nextOpenStep(steps, set, 1), 3);
  assert.equal(nextOpenStep(steps, set, 3), 1); // wraps round
  assert.deepEqual(upcomingSteps(steps, set, 1, 3), [3]);
  assert.equal(nextOpenStep(steps, new Set(['A1', 'A2', 'B1', 'B2']), 0), -1);
  assert.deepEqual(undoLastStep(steps, done), { done: ['A1'], index: 2 });
  assert.deepEqual(undoLastStep(steps, []), { done: [], index: -1 });
  const cols = visitSteps(8, 12, { order: 'column', channels: 8 });
  assert.deepEqual(undoLastStep(cols, markStep(['A1'], cols[1])), { done: ['A1'], index: 1 });
  assert.deepEqual(stepBox(cols[2]), { row: 0, col: 2, rows: 8, cols: 1 });
  assert.equal(stepLabel(cols[2]), 'A3–H3'); assert.equal(stepLabel(['C4']), 'C4');
});

test('a skipped step comes back after the ones that follow', () => {
  const steps = visitSteps(2, 3, { order: 'row' }); // A1 A2 A3 B1 B2 B3
  let done: string[] = [];
  let at = 0;
  const visited: string[] = [];
  const pipette = () => { visited.push(steps[at][0]); done = markStep(done, steps[at]); at = nextOpenStep(steps, new Set(done), at); };
  const skip = () => { at = nextOpenStep(steps, new Set(done), at); };
  pipette();          // A1
  skip();             // A2 left open
  assert.equal(steps[at][0], 'A3'); assert.deepEqual(done, ['A1']); // skipping ticks nothing
  pipette(); pipette();
  skip();             // B2 left open
  pipette();          // B3, the last in the order
  assert.equal(steps[at][0], 'A2'); // round to the first one skipped
  pipette();
  assert.equal(steps[at][0], 'B2');
  skip();
  assert.equal(steps[at][0], 'B2'); // the only one left: skipping stays on it
  pipette();
  assert.equal(at, -1);
  assert.deepEqual(visited, ['A1', 'A3', 'B1', 'B3', 'A2', 'B2']);
  assert.deepEqual(passCount(steps, new Set(done)), { done: 6, total: 6 });
});

test('labelled wells only follows the plate until it is chosen by hand', () => {
  assert.equal(labelledOnlyOn(undefined, 0), false);
  assert.equal(labelledOnlyOn(undefined, 1), true);
  assert.equal(labelledOnlyOn(undefined, 13), true);
  assert.equal(labelledOnlyOn(false, 13), false);
  assert.equal(labelledOnlyOn(true, 0), true);

  // 13 labelled wells on a 24-well plate: the pass is those 13.
  const plate = newPlate('P', 4, 6);
  const ids = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'C1'];
  for (const id of ids) plate.wells[id] = { title: id };
  plate.wells.D6 = { color: 'red' }; // a colour alone is not a label
  const pass = planPass(plate);
  assert.equal(pass.labelledOnly, true);
  assert.deepEqual(pass.steps.map((s) => s[0]), ids);
  assert.deepEqual(passCount(pass.steps, new Set()), { done: 0, total: 13 });
  assert.deepEqual(passCount(pass.steps, new Set(['A1', 'C1', 'D6'])), { done: 2, total: 13 }); // wells outside the pass are not counted
  // Turned off by hand: the whole plate. A blank plate: the whole plate too.
  assert.equal(planPass({ ...plate, progress: { order: 'row', done: [], labelledOnly: false } }).steps.length, 24);
  assert.equal(planPass(newPlate('Blank', 4, 6)).labelledOnly, false);
  assert.equal(planPass(newPlate('Blank', 4, 6)).steps.length, 24);
  assert.equal(planPass({ ...newPlate('Blank', 4, 6), progress: { order: 'row', done: [], labelledOnly: true } }).steps.length, 0);
  // The choice is stored either way, and read back.
  assert.equal(parsePlateMap({ plates: [{ rows: 4, cols: 6, progress: { order: 'row', done: [], labelledOnly: false } }] }).plates[0].progress?.labelledOnly, false);
  assert.equal(parsePlateMap({ plates: [{ rows: 4, cols: 6, progress: { order: 'row', done: [], labelledOnly: true } }] }).plates[0].progress?.labelledOnly, true);
  assert.equal(parsePlateMap({ plates: [{ rows: 4, cols: 6, progress: { order: 'row', done: [], labelledOnly: 'yes' } }] }).plates[0].progress?.labelledOnly, undefined);
});

test('a pass follows the pipette: channels set the direction and are counted in wells', () => {
  const eight = planPass({ ...newPlate('P', 8, 12), progress: { order: 'row', done: ['A1', 'B1', 'C1', 'D1', 'E1', 'F1', 'G1', 'H1'], channels: 8 } });
  assert.equal(eight.order, 'column'); assert.equal(eight.channels, 8); assert.equal(eight.steps.length, 12);
  assert.deepEqual(passCount(eight.steps, new Set(['A1', 'B1', 'C1', 'D1', 'E1', 'F1', 'G1', 'H1'])), { done: 8, total: 96 });
  assert.equal(planPass({ ...newPlate('P', 8, 12), progress: { order: 'column', done: [], channels: 12 } }).order, 'row');
  // A pipette that does not fit the plate is ignored.
  const small = planPass({ ...newPlate('P', 4, 6), progress: { order: 'column', done: [], channels: 8, snake: true } });
  assert.equal(small.channels, 1); assert.equal(small.order, 'column'); assert.equal(small.snake, true);
  assert.deepEqual(small.steps.slice(0, 6).map((s) => s[0]), ['A1', 'B1', 'C1', 'D1', 'D2', 'C2']);
  assert.deepEqual(passCount([], new Set(['A1'])), { done: 0, total: 0 });
});

test('the window on a large plate', () => {
  // Up to 96 wells the plate is shown whole.
  assert.deepEqual(viewSize(8, 12), { rows: 8, cols: 12 });
  assert.deepEqual(viewSize(4, 6), { rows: 4, cols: 6 });
  assert.deepEqual(viewSize(16, 24), { rows: 8, cols: 12 });
  assert.deepEqual(viewSize(16, 24, 8), { rows: 16, cols: 12 }); // an 8-channel step runs the length of a column
  assert.deepEqual(viewSize(16, 24, 12), { rows: 8, cols: 24 });
  assert.deepEqual(viewSize(10, 10), { rows: 8, cols: 10 });
  // 384 wells in four windows of 8 by 12.
  assert.deepEqual(zoomWindow(16, 24, 0, 0, 8, 12), { row: 0, col: 0 });
  assert.deepEqual(zoomWindow(16, 24, 7, 11, 8, 12), { row: 0, col: 0 });
  assert.deepEqual(zoomWindow(16, 24, 7, 12, 8, 12), { row: 0, col: 12 });
  assert.deepEqual(zoomWindow(16, 24, 8, 0, 8, 12), { row: 8, col: 0 });
  assert.deepEqual(zoomWindow(16, 24, 15, 23, 8, 12), { row: 8, col: 12 });
  // The window always holds the well and never leaves the plate.
  for (const [rows, cols] of [[16, 24], [10, 10], [20, 30], [32, 48], [5, 30]]) {
    const v = viewSize(rows, cols);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const w = zoomWindow(rows, cols, r, c, v.rows, v.cols);
      assert.ok(w.row >= 0 && w.col >= 0 && w.row + v.rows <= rows && w.col + v.cols <= cols, `${rows}x${cols} ${r},${c}`);
      assert.ok(r >= w.row && r < w.row + v.rows && c >= w.col && c < w.col + v.cols, `${rows}x${cols} ${r},${c}`);
    }
  }
  // A plate that is not a whole number of windows: the last window is pulled back.
  assert.deepEqual(zoomWindow(20, 30, 19, 29, 8, 12), { row: 12, col: 18 });
  assert.deepEqual(zoomWindow(20, 30, 16, 24, 8, 12), { row: 12, col: 18 });
  // Out-of-range input is clamped, and a window larger than the plate starts at A1.
  assert.deepEqual(zoomWindow(16, 24, -3, 99, 8, 12), { row: 0, col: 12 });
  assert.deepEqual(zoomWindow(4, 6, 3, 5, 8, 12), { row: 0, col: 0 });
});

test('fill series counts up from the number in the pattern', () => {
  assert.deepEqual(fillSeries(['A1', 'A2', 'A3'], 'Sample 1'), { A1: 'Sample 1', A2: 'Sample 2', A3: 'Sample 3' });
  assert.deepEqual(fillSeries(['A1', 'A2'], 'S09'), { A1: 'S09', A2: 'S10' });
  assert.deepEqual(fillSeries(['A1', 'A2'], 'Day 2 mouse 7'), { A1: 'Day 2 mouse 7', A2: 'Day 2 mouse 8' });
  assert.deepEqual(fillSeries(['A1', 'A2'], 'T{n}h'), { A1: 'T1h', A2: 'T2h' });
  assert.deepEqual(fillSeries(['A1', 'A2'], 'Ctrl'), { A1: 'Ctrl 1', A2: 'Ctrl 2' });
  assert.deepEqual(fillSeries(['A1', 'A2', 'A3'], '10 nM', 5), { A1: '10 nM', A2: '15 nM', A3: '20 nM' });
  // By column: the caller sorts first.
  assert.deepEqual(fillSeries(sortIds(['A1', 'A2', 'B1', 'B2'], 'column'), 'S1'), { A1: 'S1', B1: 'S2', A2: 'S3', B2: 'S4' });
});

test('replicates repeat each label', () => {
  assert.deepEqual(replicates(['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7'], ['Ctrl', 'Drug'], 3), { A1: 'Ctrl', A2: 'Ctrl', A3: 'Ctrl', A4: 'Drug', A5: 'Drug', A6: 'Drug' });
  assert.deepEqual(replicates(['A1', 'A2'], ['x', 'y', 'z'], 1), { A1: 'x', A2: 'y' });
  assert.deepEqual(parseLabels('Ctrl, Drug A ;Drug B'), ['Ctrl', 'Drug A', 'Drug B']);
  assert.deepEqual(parseLabels('IL-6, 10 ng\n\nTNF'), ['IL-6, 10 ng', 'TNF']);
});

test('dilution series', () => {
  assert.deepEqual(dilutionSeries(['A1', 'A2', 'A3', 'A4'], { start: 100, factor: 2, order: 'row' }), { A1: '100', A2: '50', A3: '25', A4: '12.5' });
  assert.deepEqual(dilutionSeries(['A1', 'A2', 'A3', 'A4'], { start: 10, factor: 3, order: 'row' }), { A1: '10', A2: '3.333', A3: '1.111', A4: '0.3704' });
  // Unsorted ids, by column, restarting on every column.
  assert.deepEqual(dilutionSeries(['B2', 'A1', 'B1', 'A2'], { start: 1, factor: 10, order: 'column', restart: true }), { A1: '1', B1: '0.1', A2: '1', B2: '0.1' });
  assert.deepEqual(dilutionSeries(['A1', 'A2', 'B1', 'B2'], { start: 1, factor: 10, order: 'row' }), { A1: '1', A2: '0.1', B1: '0.01', B2: '0.001' });
  assert.deepEqual(dilutionSeries(['A1'], { start: 1, factor: 0, order: 'row' }), {});
  assert.equal(formatAmount(0.000125), '0.000125'); assert.equal(formatAmount(1234.5678), '1235'); assert.equal(formatAmount(0), '0'); assert.equal(formatAmount(1e-9), '1e-9');
  assert.equal(parseNumber('2,5'), 2.5); assert.equal(parseNumber(' 1e3 '), 1000); assert.equal(parseNumber('ten'), null); assert.equal(parseNumber(''), null);
  assert.deepEqual(withComponent({ components: [{ name: 'Drug', amount: '1', unit: 'µM' }, { name: 'DMSO' }] }, { name: 'drug', amount: '5', unit: 'µM' }), [{ name: 'drug', amount: '5', unit: 'µM' }, { name: 'DMSO' }]);
});

const demo = (): Plate => ({
  name: 'Assay', rows: 2, cols: 3, wells: {
    A1: { title: 'Ctrl', group: 'Controls', color: 'slate' },
    A2: { title: 'Drug, 10 µM', group: 'Treated', color: 'blue', components: [{ name: 'Drug', amount: '10', unit: 'µM' }, { name: 'DMSO', amount: '0.1', unit: '%' }] },
    B1: { title: 'He said "go"', note: 'line one\nline two', group: 'Treated' },
    B3: { color: 'red' },
  },
});

test('the well table and its CSV', () => {
  assert.equal(csvCell('plain'), 'plain'); assert.equal(csvCell('a,b'), '"a,b"'); assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('two\nlines'), '"two\nlines"'); assert.equal(csvCell(' padded'), '" padded"'); assert.equal(csvCell(''), '');
  assert.equal(componentsText([{ name: 'Drug', amount: '10', unit: 'µM' }, { name: 'Medium' }, { name: '' }]), 'Drug 10 µM; Medium');
  const rows = tableRows(demo());
  assert.deepEqual(rows.map((r) => r.well), ['A1', 'A2', 'B1']); // B3 has a colour only
  assert.equal(toCsv([demo()]), [
    'Well,Title,Group,Components,Note',
    'A1,Ctrl,Controls,,',
    'A2,"Drug, 10 µM",Treated,Drug 10 µM; DMSO 0.1 %,',
    'B1,"He said ""go""",Treated,,"line one\nline two"',
    '',
  ].join('\r\n'));
  const two = toCsv([demo(), { ...newPlate('Plate, B', 2, 2), wells: { B2: { title: 'x' } } }]).split('\r\n');
  assert.equal(two[0], 'Plate,Well,Title,Group,Components,Note'); assert.equal(two[1], 'Assay,A1,Ctrl,Controls,,'); assert.equal(two[4], '"Plate, B",B2,x,,,');
  assert.equal(fileBase('ELISA: IL-6 / plate 2'), 'ELISA-IL-6-plate-2'); assert.equal(fileBase('  '), 'plate-map'); assert.equal(fileBase('Würzburg run'), 'Wurzburg-run');
});

test('real-size geometry follows the SBS footprint', () => {
  const g96 = geometry(8, 12);
  assert.equal(g96.width, 127.76); assert.equal(g96.height, 85.48); assert.equal(g96.pitch, 9); assert.ok(g96.real);
  assert.deepEqual(wellCentre(8, 12, 'A1'), { x: 14.38, y: 11.24 });
  assert.deepEqual(wellCentre(8, 12, 'H12'), { x: 113.38, y: 74.24 });
  assert.deepEqual(wellCentre(8, 12, 'B3'), { x: 32.38, y: 20.24 });
  assert.deepEqual(wellCentre(16, 24, 'A1'), { x: 12.13, y: 8.99 });
  assert.deepEqual(wellCentre(16, 24, 'P24'), { x: 115.63, y: 76.49 });
  // The other formats: the pitch from the brief, the grid centred on the footprint.
  assert.deepEqual(wellCentre(2, 3, 'A1'), { x: 24.78, y: 23.19 }); assert.deepEqual(wellCentre(2, 3, 'B3'), { x: 102.98, y: 62.29 });
  assert.deepEqual(wellCentre(3, 4, 'A1'), { x: 24.88, y: 16.74 }); assert.deepEqual(wellCentre(3, 4, 'C4'), { x: 102.88, y: 68.74 });
  assert.deepEqual(wellCentre(4, 6, 'A1'), { x: 15.63, y: 13.79 }); assert.deepEqual(wellCentre(4, 6, 'D6'), { x: 112.13, y: 71.69 });
  assert.deepEqual(wellCentre(6, 8, 'A1'), { x: 18.38, y: 10.24 }); assert.deepEqual(wellCentre(6, 8, 'F8'), { x: 109.38, y: 75.24 });
  for (const [r, c] of [[2, 3], [3, 4], [4, 6], [6, 8], [8, 12], [16, 24]]) { const g = geometry(r, c); assert.ok(g.diameter < g.pitch && g.x0 > g.diameter / 2 && g.y0 > g.diameter / 2); }
  assert.equal(wellCentre(8, 12, 'I1'), null); assert.equal(wellCentre(8, 12, 'A13'), null);
  const custom = geometry(5, 7);
  assert.equal(custom.real, false); assert.equal(custom.width, 76); assert.equal(custom.height, 58);
});

test('editing wells', () => {
  let p = newPlate('P', 2, 2);
  p = patchWells(p, ['A1', 'A2'], { title: 'x', color: 'blue' });
  assert.deepEqual(p.wells, { A1: { title: 'x', color: 'blue' }, A2: { title: 'x', color: 'blue' } });
  p = patchWells(p, ['A1'], { title: '', color: '' });
  assert.deepEqual(Object.keys(p.wells), ['A2']); // a well with nothing left is not stored
  p = patchWells(p, ['A2', 'B2'], (id) => ({ note: id }));
  assert.equal(p.wells.B2.note, 'B2'); assert.equal(p.wells.A2.title, 'x');
  assert.ok(isLabelled({ group: 'g' })); assert.ok(isLabelled({ components: [{ name: 'Drug' }] }));
  assert.ok(!isLabelled({ color: 'red' })); assert.ok(!isLabelled({ title: '  ' })); assert.ok(!isLabelled(undefined));
  assert.equal(lostOnResize(p, 1, 2), 1);
  assert.deepEqual(Object.keys(resizePlate({ ...p, progress: { order: 'row', done: ['A2'] } }, 1, 2).wells), ['A2']);
  assert.equal(resizePlate({ ...p, progress: { order: 'row', done: ['A2'] } }, 1, 2).progress, undefined);
  assert.deepEqual(legend(demo()), [{ group: 'Controls', color: 'slate', count: 1 }, { group: 'Treated', color: 'blue', count: 2 }]);
  assert.equal(formatDuration(42_000), '42 s'); assert.equal(formatDuration(754_000), '12 min 34 s'); assert.equal(formatDuration(3_720_000), '1 h 2 min');
});

test('stored data is read back safely', () => {
  const data = parsePlateMap({ plates: [{ name: 'One', rows: 8, cols: 12, wells: { a1: { title: 'S1', components: [{ name: 'Drug', amount: 5, unit: 'µM' }, {}] }, Z9: { title: 'outside' }, B2: {} },
    progress: { order: 'column', done: ['A1', 'A1', 'Q1', 7], snake: true, channels: 8, startedAt: 5 } }] });
  assert.deepEqual(data.plates[0].wells, { A1: { title: 'S1', components: [{ name: 'Drug', amount: '5', unit: 'µM' }] } });
  assert.deepEqual(data.plates[0].progress, { order: 'column', done: ['A1'], snake: true, channels: 8, startedAt: 5 });
  // Nothing usable: one empty 96-well plate. The first stored shape (one plate at the top level) still opens.
  for (const raw of [null, {}, { plates: [] }, 'x']) assert.deepEqual(parsePlateMap(raw), { plates: [{ name: 'Plate 1', rows: 8, cols: 12, wells: {} }] });
  assert.deepEqual(parsePlateMap({ rows: 4, cols: 6, wells: {} }), { plates: [{ name: 'Plate 1', rows: 4, cols: 6, wells: {} }] });
  assert.equal(parsePlateMap({ plates: [{ rows: 999, cols: 0 }] }).plates[0].rows, 32);
  assert.equal(parsePlateMap({ plates: [{ rows: 999, cols: 0 }] }).plates[0].cols, 12);
  assert.equal(parsePlateMap({ plates: [{ rows: 4, cols: 6, progress: { order: 'row', done: [], channels: 8 } }] }).plates[0].progress?.channels, undefined);
});
