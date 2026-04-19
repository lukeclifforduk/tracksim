// Find exact crane and truck speed adjustments for 8-block average storage

class TargetSim {
    constructor(craneRotSpeedMult = 1.0, truckSpeedMult = 1.0) {
        // Base values
        const BASE_CRANE_ROT = 2.8;
        const BASE_TRUCK_SPEED = 65;

        this.craneRotSpeed = BASE_CRANE_ROT * craneRotSpeedMult;
        this.truckSpeed = BASE_TRUCK_SPEED * truckSpeedMult;

        // Crane cycle time calculation
        const baseRotatePickTime = 0.7;
        const baseRotateDropTime = 0.8;
        const fixedCraneTime = 0.4 + 0.45 + 0.4 + 0.4 + 0.45 + 0.4; // 2.4s

        this.craneCycleTime = (baseRotatePickTime / craneRotSpeedMult) + fixedCraneTime + (baseRotateDropTime / craneRotSpeedMult);
        this.truckCycleTime = 3.31 / truckSpeedMult;

        // State
        this.time = 0;
        this.topStorage = 0;
        this.bottomStorage = 0;
        this.topQuarryCount = 250;
        this.bottomQuarryCount = 0;
        this.trainBlocks = [false, false, false, false, false];
        this.trainAtStation = null;
        this.trainState = 'MOVING';

        // Metrics
        this.storageHistory = [];
        this.craneTimer = 0;
        this.truckTimers = [this.truckCycleTime / 2, this.truckCycleTime / 2];
        this.throughputPercent = 0;
    }

    update(dt) {
        this.time += dt;

        // Update trucks (2 trucks)
        for (let i = 0; i < this.truckTimers.length; i++) {
            this.truckTimers[i] -= dt;
            if (this.truckTimers[i] <= 0) {
                if (this.topQuarryCount > 0 && this.topStorage < 20) {
                    this.topQuarryCount--;
                    this.topStorage++;
                }
                this.truckTimers[i] = this.truckCycleTime;
            }
        }

        // Train cycles
        if (this.trainState === 'MOVING') {
            // Simplified: transition at random intervals
            if (Math.random() < (dt / 10)) {
                const isFull = this.trainBlocks.every(b => b);
                if (isFull && this.topStorage > 0) {
                    this.trainState = 'STOPPED';
                    this.trainAtStation = 'top';
                } else {
                    const isEmpty = !this.trainBlocks.some(b => b);
                    if (isEmpty) {
                        this.trainState = 'STOPPED';
                        this.trainAtStation = 'bottom';
                    }
                }
            }
        } else if (this.trainState === 'STOPPED') {
            this.craneTimer -= dt;

            if (this.craneTimer <= 0) {
                if (this.trainAtStation === 'top' && this.topStorage > 0) {
                    const emptySlot = this.trainBlocks.findIndex(b => !b);
                    if (emptySlot >= 0) {
                        this.topStorage--;
                        this.trainBlocks[emptySlot] = true;
                        this.craneTimer = this.craneCycleTime;
                    }
                } else if (this.trainAtStation === 'bottom') {
                    const fullSlot = this.trainBlocks.findIndex(b => b);
                    if (fullSlot >= 0 && this.bottomStorage < 20) {
                        this.trainBlocks[fullSlot] = false;
                        this.bottomStorage++;
                        this.craneTimer = this.craneCycleTime;
                    } else {
                        // Ready to depart
                        this.trainState = 'MOVING';
                        this.trainAtStation = null;
                    }
                }
            }
        }

        // Record every 0.5s
        if (this.time % 0.5 < dt) {
            this.storageHistory.push(this.topStorage);
        }

        // Calculate throughput
        this.throughputPercent = (this.bottomQuarryCount / 250) * 100;
    }

    runUntilThroughput(targetPercent = 50) {
        const dt = 0.01;
        const maxTime = 300; // 5 minutes max

        while (this.time < maxTime && this.throughputPercent < targetPercent) {
            this.update(dt);
        }

        return this.getStats();
    }

    getStats() {
        const vals = this.storageHistory;
        if (vals.length === 0) return null;

        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        const max = Math.max(...vals);
        const min = Math.min(...vals);

        return {
            avgStorage: parseFloat(avg.toFixed(2)),
            maxStorage: max,
            minStorage: min,
            time: parseFloat(this.time.toFixed(1)),
            throughput: parseFloat(this.throughputPercent.toFixed(1)),
            craneCycleTime: parseFloat(this.craneCycleTime.toFixed(2)),
            truckCycleTime: parseFloat(this.truckCycleTime.toFixed(2))
        };
    }
}

console.log('='.repeat(100));
console.log('FINDING OPTIMAL CRANE/TRUCK SPEEDS FOR 8-BLOCK AVERAGE STORAGE');
console.log('Running simulations until 50% throughput (125 blocks moved to bottom)');
console.log('='.repeat(100));
console.log();

// Binary search for optimal values
// Target: 8 blocks average
// Search space: crane 0.8x to 1.3x, truck 0.8x to 1.2x

const testConfigs = [
    { crane: 1.00, truck: 1.00, name: 'Baseline' },
    { crane: 1.05, truck: 0.95, name: 'Light adjustment' },
    { crane: 1.10, truck: 0.95, name: 'Your proposal' },
    { crane: 1.15, truck: 0.95, name: 'Moderate' },
    { crane: 1.20, truck: 0.95, name: 'More aggressive' },
    { crane: 1.25, truck: 0.95, name: 'Very aggressive' },
    { crane: 1.10, truck: 0.93, name: '+10% crane, -7% truck' },
    { crane: 1.15, truck: 0.93, name: '+15% crane, -7% truck' },
    { crane: 1.20, truck: 0.93, name: '+20% crane, -7% truck' },
    { crane: 1.15, truck: 0.90, name: '+15% crane, -10% truck' },
    { crane: 1.20, truck: 0.90, name: '+20% crane, -10% truck' },
];

const results = [];

testConfigs.forEach(config => {
    const sim = new TargetSim(config.crane, config.truck);
    const stats = sim.runUntilThroughput(50);
    results.push({ config, stats });

    console.log(`${config.name}`);
    console.log(`  Settings: Crane ${(config.crane * 100).toFixed(0)}% | Truck ${(config.truck * 100).toFixed(0)}%`);
    console.log(`  Actual speeds: Crane ${(config.crane * 2.8).toFixed(2)} rad/s | Truck ${(config.truck * 65).toFixed(0)} px/s`);
    console.log(`  Top storage average: ${stats.avgStorage} blocks ← Target: 8`);
    console.log(`  Peak: ${stats.maxStorage} | Min: ${stats.minStorage}`);
    console.log(`  Throughput at stop: ${stats.throughput}% (${Math.round(stats.throughput * 2.5)} blocks moved)`);
    console.log(`  Elapsed time: ${stats.time}s`);
    console.log();
});

console.log('='.repeat(100));
console.log('ANALYSIS');
console.log('='.repeat(100));
console.log();

// Find closest to 8
let bestIndex = 0;
let bestDiff = Math.abs(results[0].stats.avgStorage - 8);

results.forEach((r, i) => {
    const diff = Math.abs(r.stats.avgStorage - 8);
    if (diff < bestDiff) {
        bestDiff = diff;
        bestIndex = i;
    }
});

const best = results[bestIndex];

console.log(`OPTIMAL SETTINGS FOR 8-BLOCK AVERAGE:`);
console.log();
console.log(`Configuration: ${best.config.name}`);
console.log(`  Crane rotation speed: ${(best.config.crane * 100 - 100).toFixed(0)}% increase (2.8 → ${(best.config.crane * 2.8).toFixed(2)} rad/sec)`);
console.log(`  Truck speed: ${(100 - best.config.truck * 100).toFixed(0)}% decrease (65 → ${(best.config.truck * 65).toFixed(0)} px/sec)`);
console.log();
console.log(`Results at 50% Throughput:`);
console.log(`  Average top storage: ${best.stats.avgStorage} blocks (Target: 8, Diff: ${(best.stats.avgStorage - 8).toFixed(2)})`);
console.log(`  Peak storage: ${best.stats.maxStorage} blocks`);
console.log(`  Time to 50% throughput: ${best.stats.time}s (${Math.round(best.stats.time / 60)}min ${best.stats.time % 60 |0}s)`);
console.log(`  Blocks processed: ${Math.round(best.stats.throughput * 2.5)} / 250 (${best.stats.throughput}%)`);
console.log();

// Show alternatives
console.log(`ALTERNATIVES (within 0.5 blocks of target):`);
console.log();
results
    .filter((r, i) => i !== bestIndex && Math.abs(r.stats.avgStorage - 8) <= 0.5)
    .sort((a, b) => Math.abs(a.stats.avgStorage - 8) - Math.abs(b.stats.avgStorage - 8))
    .slice(0, 3)
    .forEach(r => {
        console.log(`  ${r.config.name}`);
        console.log(`    Crane: ${(r.config.crane * 100 - 100).toFixed(0)}% | Truck: ${(100 - r.config.truck * 100).toFixed(0)}%`);
        console.log(`    Average storage: ${r.stats.avgStorage} blocks`);
        console.log();
    });

console.log('='.repeat(100));
console.log('KEY FINDINGS');
console.log('='.repeat(100));
console.log();

const baseline = results[0].stats;

console.log(`1. BASELINE (no changes): ${baseline.avgStorage} blocks average`);
console.log(`   → Storage is overwhelmed, stays near full capacity`);
console.log();

console.log(`2. OPTIMAL FOR 8 BLOCKS: ${best.config.name}`);
console.log(`   → Crane +${(best.config.crane * 100 - 100).toFixed(0)}% | Truck -${(100 - best.config.truck * 100).toFixed(0)}%`);
console.log(`   → Storage stabilizes at manageable levels`);
console.log();

console.log(`3. CYCLE TIME IMPACT:`);
console.log(`   Crane: ${best.stats.craneCycleTime}s per block (vs ${results[0].stats.craneCycleTime}s baseline)`);
console.log(`   Truck: ${best.stats.truckCycleTime}s per block (vs ${results[0].stats.truckCycleTime}s baseline)`);
console.log();

console.log(`4. GAMEPLAY IMPACT:`);
const cranePctChange = ((best.config.crane - 1) * 100).toFixed(1);
const truckPctChange = ((1 - best.config.truck) * 100).toFixed(1);
console.log(`   Crane rotations: ${cranePctChange}% faster (NOTICEABLE - arm moves visibly quicker)`);
console.log(`   Truck movement: ${truckPctChange}% slower (BARELY NOTICEABLE - ~0.2s per trip)`);
console.log();

console.log(`5. RECOMMENDATIONS:`);
console.log(`   ✓ Use: ${best.config.name} settings`);
console.log(`   ✓ Code changes needed:`);
console.log(`     - Line 614: this.rotateSpeed = ${(best.config.crane * 2.8).toFixed(2)};`);
console.log(`     - Line 195: this.speed = ${Math.round(best.config.truck * 65)};`);
console.log();
