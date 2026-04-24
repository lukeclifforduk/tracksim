#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

// ─── Seeded PRNG (LCG) ─────────────────────────────────────────────────────
let _seed = 42;
function seededRandom() {
  _seed = (_seed * 1664525 + 1013904223) >>> 0;
  return _seed / 4294967296;
}
function resetSeed(s = 42) { _seed = s >>> 0; }

// ─── Extract createSim from index.html ────────────────────────────────────
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) { console.error('No <script> tag found'); process.exit(1); }
const fullScript = scriptMatch[1];

const start = fullScript.indexOf('function createSim()');
const end   = fullScript.indexOf('\nconst COLORS');
if (start === -1 || end === -1) { console.error('Cannot isolate createSim'); process.exit(1); }
const createSimSrc = fullScript.slice(start, end);

let createSim;
try {
  createSim = new Function(createSimSrc + '\nreturn createSim;')();
} catch (e) { console.error('Failed to eval createSim:', e.message); process.exit(1); }

// ─── Helpers ──────────────────────────────────────────────────────────────
function runSim(durationSec, dtSec = 1 / 60, seedValue = 42) {
  resetSeed(seedValue);
  const origRandom = Math.random;
  Math.random = seededRandom;

  const sim = createSim();
  sim.initSim();

  const events = {
    trainStops: [],           // { time, station, blocksBefore, blocksAfter (filled on depart) }
    storageViolations: [],    // should stay in [0,25]
    blockConservation: [],    // samples of total block accounting
  };

  let time = 0;
  let lastStation = null;
  let pendingStop = null;

  const CAPACITY = 25;
  const TOTAL_TRACK = sim.geometry.TOTAL_TRACK_LENGTH;

  // Count initial active top blocks for conservation check
  const initTopActive = sim.topBlocks.filter(b => b.active).length;
  const initBotActive = sim.bottomBlocks.filter(b => b.active).length;

  while (time < durationSec) {
    sim.step(dtSec);
    time += dtSec;
    const t = Math.round(time * 1000) / 1000;

    // Train station events
    if (sim.trainAtStation && sim.trainAtStation !== lastStation) {
      lastStation = sim.trainAtStation;
      pendingStop = {
        time: t,
        station: sim.trainAtStation,
        blocksBefore: sim.trainBlocks.filter(Boolean).length,
        blocksAfter: null,
      };
    }
    if (!sim.trainAtStation && lastStation && pendingStop && pendingStop.blocksAfter === null) {
      pendingStop.blocksAfter = sim.trainBlocks.filter(Boolean).length;
      events.trainStops.push(pendingStop);
      pendingStop = null;
      lastStation = null;
    }

    // Storage bounds
    if (sim.topStorageCount < 0 || sim.topStorageCount > CAPACITY)
      events.storageViolations.push({ time: t, which: 'top', count: sim.topStorageCount });
    if (sim.bottomStorageCount < 0 || sim.bottomStorageCount > CAPACITY)
      events.storageViolations.push({ time: t, which: 'bottom', count: sim.bottomStorageCount });
  }

  Math.random = origRandom;

  const topActive  = sim.topBlocks.filter(b => b.active).length;
  const botActive  = sim.bottomBlocks.filter(b => b.active).length;
  const trainLoaded = sim.trainBlocks.filter(Boolean).length;

  return {
    events,
    final: {
      time: durationSec,
      topActive,
      botActive,
      trainLoaded,
      topStorage: sim.topStorageCount,
      botStorage: sim.bottomStorageCount,
      trainState: sim.trainState,
      trainAtStation: sim.trainAtStation,
      flourPallets: sim.flourPallets
        ? sim.flourPallets.reduce((sum, row) => sum + row.reduce((s, v) => s + v, 0), 0)
        : 0,
      farmCellsDone: sim.farmCells
        ? sim.farmCells.filter(c => c.state >= 5).length
        : 0,
    }
  };
}

// ─── Assertions ──────────────────────────────────────────────────────────
let passed = 0, failed = 0;
function assert(condition, name, detail = '') {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.log(`  ✗ ${name}${detail ? ': ' + detail : ''}`);
    failed++;
  }
}

// ─── Run Benchmarks ──────────────────────────────────────────────────────
console.log('\n════════════════════════════════════════');
console.log('  TrackSim Headless Benchmark Suite');
console.log('════════════════════════════════════════\n');

// ── BENCH_001: 5-minute run invariants ───────────────────────────────────
console.log('BENCH_001: 5-minute simulation invariants');
const r5 = runSim(300, 1 / 60);

assert(r5.events.storageViolations.length === 0,
  'Storage counts stay within [0, 25]',
  `${r5.events.storageViolations.length} violation(s)`);

const topStops = r5.events.trainStops.filter(s => s.station === 'top');
const botStops = r5.events.trainStops.filter(s => s.station === 'bottom');
assert(topStops.length >= 2, 'Train stops at top station ≥2 times',
  `actual: ${topStops.length}`);
assert(botStops.length >= 2, 'Train stops at bottom station ≥2 times',
  `actual: ${botStops.length}`);

// Each top departure should have all 5 carriages loaded
const topLoadOk = topStops.every(s => s.blocksAfter === 5);
assert(topLoadOk, 'Train departs top station fully loaded (5/5)',
  topStops.map(s => s.blocksAfter).join(','));

// Each bottom departure should have 0 carriages loaded
const botUnloadOk = botStops.every(s => s.blocksAfter === 0);
assert(botUnloadOk, 'Train departs bottom station fully unloaded (0/5)',
  botStops.map(s => s.blocksAfter).join(','));

assert(r5.final.topActive < 310, 'Top quarry has lost some blocks',
  `active: ${r5.final.topActive}`);
assert(r5.final.botActive > 0, 'Bottom quarry has gained some blocks',
  `active: ${r5.final.botActive}`);

// ── BENCH_002: Loading speed ──────────────────────────────────────────────
console.log('\nBENCH_002: Loading/unloading speed');
{
  const stops = r5.events.trainStops;
  if (stops.length >= 4) {
    const intervals = [];
    for (let i = 1; i < stops.length; i++)
      intervals.push(stops[i].time - stops[i - 1].time);
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    assert(avgInterval < 120, `Average station interval < 120s`, `avg: ${avgInterval.toFixed(1)}s`);
    assert(avgInterval > 5,   `Average station interval >  5s  (sanity)`, `avg: ${avgInterval.toFixed(1)}s`);
    console.log(`    avg station interval: ${avgInterval.toFixed(1)}s over ${stops.length} stops`);
  } else {
    console.log('  ~ Not enough stops to measure interval');
  }
}

// ── BENCH_003: Block routing integrity ───────────────────────────────────
console.log('\nBENCH_003: Block routing integrity');
assert(r5.final.topStorage <= 25, 'Top storage ≤ 25');
assert(r5.final.botStorage <= 25, 'Bottom storage ≤ 25');
assert(r5.final.topStorage >= 0,  'Top storage ≥ 0');
assert(r5.final.botStorage >= 0,  'Bottom storage ≥ 0');

// ── BENCH_004: Farm and flour system ─────────────────────────────────────
console.log('\nBENCH_004: Farm & flour system (10-min run)');
const r10 = runSim(600, 1 / 60);

assert(r10.final.farmCellsDone >= 1, 'At least 1 farm cell harvested in 10min',
  `cells done: ${r10.final.farmCellsDone}`);

// ── BENCH_005: State machine sanity – train blocks are boolean array ──────
console.log('\nBENCH_005: State machine sanity');
{
  const sim2 = createSim();
  Math.random = seededRandom; resetSeed(99);
  sim2.initSim();
  for (let i = 0; i < 180 * 60; i++) sim2.step(1 / 60);
  Math.random = Math.random; // restore (already restored inside runSim)

  assert(Array.isArray(sim2.trainBlocks) && sim2.trainBlocks.length === 5,
    'trainBlocks is always a 5-element array');
  assert(sim2.trainBlocks.every(b => typeof b === 'boolean'),
    'trainBlocks elements are all booleans');
  assert(['MOVING','DECELERATING','STOPPED','ACCELERATING'].includes(sim2.trainState),
    'trainState is a valid enum value');
}

// ── BENCH_006: Reproducibility ───────────────────────────────────────────
console.log('\nBENCH_006: Reproducibility (two identical seeds)');
const rA = runSim(60, 1 / 60, 77);
const rB = runSim(60, 1 / 60, 77);
assert(rA.final.topActive === rB.final.topActive, 'Same seed → same topActive',
  `${rA.final.topActive} vs ${rB.final.topActive}`);
assert(rA.final.botActive === rB.final.botActive, 'Same seed → same botActive',
  `${rA.final.botActive} vs ${rB.final.botActive}`);
assert(rA.events.trainStops.length === rB.events.trainStops.length,
  'Same seed → same train stop count');

// ── Summary ──────────────────────────────────────────────────────────────
console.log('\n────────────────────────────────────────');
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('────────────────────────────────────────\n');

// ── Save metrics snapshot ─────────────────────────────────────────────────
const snapshot = {
  capturedAt: new Date().toISOString(),
  bench001: {
    topStopsCount: topStops.length,
    botStopsCount: botStops.length,
    finalTopActive: r5.final.topActive,
    finalBotActive: r5.final.botActive,
    trainStopCount: r5.events.trainStops.length,
    storageViolations: r5.events.storageViolations.length,
  },
  bench002: {
    intervalSeconds: r5.events.trainStops.length >= 2
      ? (r5.events.trainStops[r5.events.trainStops.length - 1].time - r5.events.trainStops[0].time)
        / (r5.events.trainStops.length - 1)
      : null,
  },
  bench004: {
    farmCellsDone: r10.final.farmCellsDone,
    flourTotal: r10.final.flourPallets,
  },
};

const snapPath = path.join(__dirname, 'benchmark-snapshot.json');
fs.writeFileSync(snapPath, JSON.stringify(snapshot, null, 2));
console.log(`  Snapshot saved → test/benchmark-snapshot.json\n`);

if (failed > 0) process.exit(1);
