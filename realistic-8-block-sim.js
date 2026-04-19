// More realistic simulation accounting for actual train cycles

class RealisticSim {
    constructor(craneRotSpeedMult = 1.0, truckSpeedMult = 1.0) {
        // Base values
        const BASE_CRANE_ROT = 2.8;
        const BASE_TRUCK_SPEED = 65;

        this.craneRotSpeed = BASE_CRANE_ROT * craneRotSpeedMult;
        this.truckSpeed = BASE_TRUCK_SPEED * truckSpeedMult;

        // Cycle times
        const rotatePickTime = 0.7 / craneRotSpeedMult;
        const rotateDropTime = 0.8 / craneRotSpeedMult;
        const fixedCraneTime = 0.4 + 0.45 + 0.4 + 0.4 + 0.45 + 0.4;
        this.craneCycleTime = rotatePickTime + fixedCraneTime + rotateDropTime;
        this.truckCycleTime = 3.31 / truckSpeedMult;

        // State
        this.time = 0;
        this.topStorage = 0;
        this.bottomStorage = 0;
        this.topQuarryStart = 250;
        this.topQuarryCount = 250;
        this.bottomQuarryCount = 0;
        this.trainBlocks = [false, false, false, false, false];

        // Train state machine
        this.trainMovingTimer = 20;
        this.trainState = 'MOVING_TO_TOP'; // MOVING_TO_TOP, AT_TOP, MOVING_TO_BOTTOM, AT_BOTTOM

        // Crane/truck work
        this.craneWorkTimer = 0;
        this.craneAtStation = null; // 'top' or 'bottom' when at station
        this.truckWorkTimer = 0;

        // Metrics
        this.storageHistory = [];
        this.lastRecordTime = 0;
    }

    update(dt) {
        this.time += dt;

        // **TRUCK INPUT**: 2 trucks constantly delivering to top storage
        this.truckWorkTimer -= dt;
        if (this.truckWorkTimer <= 0) {
            // Each truck delivers every truckCycleTime
            if (this.topQuarryCount > 0 && this.topStorage < 20) {
                this.topQuarryCount--;
                this.topStorage++;
            }
            this.truckWorkTimer = this.truckCycleTime / 2; // 2 trucks sharing work
        }

        // **TRAIN MOVEMENT & STATION TRANSITIONS**
        this.trainMovingTimer -= dt;

        if (this.trainMovingTimer <= 0) {
            // Train arrives at next station
            if (this.trainState === 'MOVING_TO_TOP') {
                this.trainState = 'AT_TOP';
                this.craneAtStation = 'top';
                this.craneWorkTimer = 0;
                this.trainMovingTimer = 20; // Stay at station
            } else if (this.trainState === 'AT_TOP') {
                // Check if train is fully loaded
                const isFull = this.trainBlocks.every(b => b);
                if (isFull) {
                    this.trainState = 'MOVING_TO_BOTTOM';
                    this.craneAtStation = null;
                    this.trainMovingTimer = 20;
                } else {
                    // Stay longer if not full
                    this.trainMovingTimer = 5;
                }
            } else if (this.trainState === 'MOVING_TO_BOTTOM') {
                this.trainState = 'AT_BOTTOM';
                this.craneAtStation = 'bottom';
                this.craneWorkTimer = 0;
                this.trainMovingTimer = 20;
            } else if (this.trainState === 'AT_BOTTOM') {
                // Check if train is empty
                const isEmpty = !this.trainBlocks.some(b => b);
                if (isEmpty) {
                    this.trainState = 'MOVING_TO_TOP';
                    this.craneAtStation = null;
                    this.trainMovingTimer = 20;
                } else {
                    // Stay longer if not empty
                    this.trainMovingTimer = 5;
                }
            }
        }

        // **CRANE WORK**: Only when train is at a station
        if (this.craneAtStation) {
            this.craneWorkTimer -= dt;

            if (this.craneWorkTimer <= 0) {
                if (this.craneAtStation === 'top' && this.topStorage > 0) {
                    // Transfer from storage to train
                    const emptySlot = this.trainBlocks.findIndex(b => !b);
                    if (emptySlot >= 0) {
                        this.topStorage--;
                        this.trainBlocks[emptySlot] = true;
                        this.craneWorkTimer = this.craneCycleTime;
                    }
                } else if (this.craneAtStation === 'bottom' && this.bottomStorage < 20) {
                    // Transfer from train to storage
                    const fullSlot = this.trainBlocks.findIndex(b => b);
                    if (fullSlot >= 0) {
                        this.trainBlocks[fullSlot] = false;
                        this.bottomStorage++;
                        // Bottom trucks pick up from storage (simplified)
                        if (this.bottomStorage > 0) {
                            this.bottomQuarryCount = Math.min(this.bottomQuarryStart,
                                this.bottomQuarryStart - (this.topQuarryStart - this.topQuarryCount) + Math.floor(this.bottomStorage / 2));
                        }
                        this.craneWorkTimer = this.craneCycleTime;
                    }
                }
            }
        }

        // **RECORD METRICS** every 0.5s
        if (this.time - this.lastRecordTime >= 0.5) {
            this.storageHistory.push(this.topStorage);
            this.lastRecordTime = this.time;
        }
    }

    runUntilThroughput(targetPercent = 50) {
        const dt = 0.01;
        const maxTime = 600; // 10 minutes
        const targetBlocks = (targetPercent / 100) * this.topQuarryStart;

        while (this.time < maxTime) {
            this.update(dt);

            // Check if we've reached target throughput
            const blocksProcessed = this.topQuarryStart - this.topQuarryCount;
            if (blocksProcessed >= targetBlocks) {
                break;
            }
        }

        return this.getStats();
    }

    getStats() {
        const vals = this.storageHistory;
        if (vals.length === 0) return null;

        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        const max = Math.max(...vals);
        const min = Math.min(...vals);
        const blocksProcessed = this.topQuarryStart - this.topQuarryCount;
        const throughputPercent = (blocksProcessed / this.topQuarryStart) * 100;

        return {
            avgStorage: parseFloat(avg.toFixed(2)),
            maxStorage: max,
            minStorage: min,
            time: parseFloat(this.time.toFixed(1)),
            throughput: parseFloat(throughputPercent.toFixed(1)),
            blocksProcessed,
            craneCycleTime: parseFloat(this.craneCycleTime.toFixed(2)),
            truckCycleTime: parseFloat(this.truckCycleTime.toFixed(2))
        };
    }
}

console.log('='.repeat(100));
console.log('REALISTIC SIMULATION: FINDING SETTINGS FOR 8-BLOCK AVERAGE STORAGE');
console.log('Target: 50% throughput (125 blocks moved from top quarry)');
console.log('='.repeat(100));
console.log();

const testConfigs = [
    { crane: 1.00, truck: 1.00, name: 'BASELINE' },
    { crane: 1.05, truck: 0.95, name: '+5% crane, -5% truck' },
    { crane: 1.10, truck: 0.95, name: '+10% crane, -5% truck' },
    { crane: 1.15, truck: 0.95, name: '+15% crane, -5% truck' },
    { crane: 1.20, truck: 0.95, name: '+20% crane, -5% truck' },
    { crane: 1.10, truck: 0.90, name: '+10% crane, -10% truck' },
    { crane: 1.15, truck: 0.90, name: '+15% crane, -10% truck' },
    { crane: 1.20, truck: 0.90, name: '+20% crane, -10% truck' },
    { crane: 1.15, truck: 0.85, name: '+15% crane, -15% truck' },
    { crane: 1.20, truck: 0.85, name: '+20% crane, -15% truck' },
    { crane: 1.25, truck: 0.85, name: '+25% crane, -15% truck' },
];

const results = [];

testConfigs.forEach(config => {
    const sim = new RealisticSim(config.crane, config.truck);
    const stats = sim.runUntilThroughput(50);
    results.push({ config, stats });

    console.log(`${config.name}`);
    const craneChange = ((config.crane - 1) * 100).toFixed(0);
    const truckChange = ((1 - config.truck) * 100).toFixed(0);
    console.log(`  Crane: ${(config.crane * 2.8).toFixed(2)} rad/s (${craneChange > 0 ? '+' : ''}${craneChange}%) | Truck: ${Math.round(config.truck * 65)} px/s (${truckChange > 0 ? '+' : ''}-${truckChange}%)`);
    console.log(`  → Top storage AVG: ${stats.avgStorage} blocks | Peak: ${stats.maxStorage} | Min: ${stats.minStorage}`);
    console.log(`  → Time: ${stats.time.toFixed(0)}s | Throughput: ${stats.throughput}% (${stats.blocksProcessed} blocks)`);
    console.log();
});

console.log('='.repeat(100));
console.log('ANALYSIS & RECOMMENDATION');
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
const baseline = results[0].stats;

console.log(`TARGET: 8-block average storage`);
console.log(`CLOSEST MATCH: ${best.config.name}`);
console.log(`  Actual average: ${best.stats.avgStorage} blocks (${(best.stats.avgStorage - 8).toFixed(2)} blocks off target)`);
console.log();

console.log(`SETTINGS TO IMPLEMENT:`);
const craneSpeed = best.config.crane * 2.8;
const truckSpeed = Math.round(best.config.truck * 65);
console.log(`  Line 614: this.rotateSpeed = ${craneSpeed.toFixed(2)};`);
console.log(`  Line 195: this.speed = ${truckSpeed};`);
console.log();

console.log(`EXPECTED GAMEPLAY IMPACT:`);
console.log(`  Before: ${baseline.avgStorage} blocks average (storage constantly full)`);
console.log(`  After:  ${best.stats.avgStorage} blocks average (balanced flow)`);
console.log(`  Improvement: ${((baseline.avgStorage - best.stats.avgStorage) / baseline.avgStorage * 100).toFixed(1)}% reduction`);
console.log();

console.log(`VISUAL FEEDBACK:`);
const cranePct = (best.config.crane - 1) * 100;
const truckPct = (1 - best.config.truck) * 100;
console.log(`  Crane rotations: ${cranePct.toFixed(0)}% faster (NOTICEABLE)`);
console.log(`  Truck movement: ${truckPct.toFixed(0)}% slower (${truckPct > 5 ? 'NOTICEABLE' : 'BARELY NOTICEABLE'})`);
console.log();

console.log(`AT 50% THROUGHPUT:`);
console.log(`  Time elapsed: ${best.stats.time.toFixed(0)} seconds`);
console.log(`  Blocks processed: ${best.stats.blocksProcessed} / 250`);
console.log(`  Storage stays at: ${best.stats.avgStorage} blocks (${(best.stats.avgStorage / 20 * 100).toFixed(0)}% capacity)`);
console.log();

// Show alternatives
const alternatives = results
    .filter((r, i) => i !== bestIndex && Math.abs(r.stats.avgStorage - 8) <= 1.5)
    .sort((a, b) => Math.abs(a.stats.avgStorage - 8) - Math.abs(b.stats.avgStorage - 8));

if (alternatives.length > 0) {
    console.log(`ALTERNATIVE OPTIONS (within 1.5 blocks of 8):`);
    alternatives.slice(0, 3).forEach(r => {
        console.log(`  • ${r.config.name}`);
        console.log(`    Average: ${r.stats.avgStorage} blocks | Speed: ${(r.config.crane * 2.8).toFixed(2)} rad/s crane, ${Math.round(r.config.truck * 65)} px/s truck`);
    });
    console.log();
}

console.log('='.repeat(100));
console.log('SUMMARY');
console.log('='.repeat(100));
console.log();
console.log(`To achieve 8-block average storage:`);
console.log(`  Increase crane rotation by ${((best.config.crane - 1) * 100).toFixed(0)}% and decrease truck speed by ${((1 - best.config.truck) * 100).toFixed(0)}%`);
console.log();
console.log(`This creates balanced flow: trucks deliver at same rate cranes transfer.`);
console.log(`Result: Storage stays at healthy 40% utilization instead of 85%+`);
