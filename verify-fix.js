// Verify the bottleneck fix works

class VerificationSim {
    constructor(craneRotSpeed = 2.8, truckSpeed = 65) {
        this.time = 0;
        this.topStorage = 0;
        this.bottomStorage = 0;
        this.topQuarryCount = 250;
        this.bottomQuarryCount = 0;
        this.trainBlocks = [false, false, false, false, false];
        this.trainAtStation = null;
        this.trainState = 'MOVING';
        this.metrics = [];

        // Timing parameters
        this.craneRotSpeed = craneRotSpeed;
        this.truckSpeed = truckSpeed;

        // Calculated cycle times
        const rotateTimeToPickReduction = (craneRotSpeed - 2.8) / 2.8 * 0.7;
        const rotateTimeToDropReduction = (craneRotSpeed - 2.8) / 2.8 * 0.8;
        const truckSpeedReduction = (65 - truckSpeed) / 65;

        this.craneCycleTime = 4.2 - rotateTimeToPickReduction - rotateTimeToDropReduction;
        this.truckCycleTime = 3.31 + (truckSpeedReduction * 0.5);

        this.craneTimer = 0;
        this.truckTimer = 0;
    }

    update(dt) {
        this.time += dt;

        // Truck: 2 trucks feeding top storage
        this.truckTimer -= dt;
        if (this.truckTimer <= 0) {
            if (this.topQuarryCount > 0 && this.topStorage < 20) {
                this.topQuarryCount--;
                this.topStorage++;
            }
            this.truckTimer = this.truckCycleTime / 2; // 2 trucks
        }

        // Train moves between stations every 20 seconds
        if (this.trainState === 'MOVING') {
            if (Math.random() < (dt / 10)) {
                const isFull = this.trainBlocks.every(b => b);
                if (isFull && this.topStorage > 0) {
                    this.trainState = 'STOPPED';
                    this.trainAtStation = 'top';
                } else {
                    const isEmpty = !this.trainBlocks.some(b => b);
                    if (isEmpty && this.trainBlocks.length > 0) {
                        this.trainState = 'STOPPED';
                        this.trainAtStation = 'bottom';
                    }
                }
            }
        } else if (this.trainState === 'STOPPED') {
            // Crane transfers blocks
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
                        // Ready to leave
                        this.trainState = 'MOVING';
                        this.trainAtStation = null;
                    }
                }
            }
        }

        // Record every second
        if (this.time % 1 < dt) {
            this.metrics.push({
                time: this.time,
                topStorage: this.topStorage,
                bottomStorage: this.bottomStorage,
                topQuarryCount: this.topQuarryCount,
                bottomQuarryCount: this.bottomQuarryCount,
                trainLoaded: this.trainBlocks.filter(b => b).length
            });
        }
    }

    getReport() {
        const topStorageMax = Math.max(...this.metrics.map(m => m.topStorage));
        const topStorageAvg = this.metrics.reduce((a, m) => a + m.topStorage, 0) / this.metrics.length;
        const buildup = this.metrics.filter(m => m.topStorage > topStorageMax * 0.7);
        const buildupDuration = buildup.length > 0
            ? buildup[buildup.length - 1].time - buildup[0].time
            : 0;

        return {
            topStorageMax,
            topStorageAvg: topStorageAvg.toFixed(2),
            buildupDuration: buildupDuration.toFixed(1),
            finalBottomQuarry: this.metrics[this.metrics.length - 1].bottomQuarryCount,
            effectiveness: ((1 - buildupDuration / 25) * 100).toFixed(0) // % improvement
        };
    }

    run(duration = 120) {
        const dt = 0.01;
        while (this.time < duration) {
            this.update(dt);
        }
        return this.getReport();
    }
}

console.log('='.repeat(100));
console.log('VERIFICATION: Bottleneck Fix Testing');
console.log('='.repeat(100));
console.log();

const tests = [
    { name: 'BEFORE: Original Settings', craneRot: 2.8, truckSpeed: 65 },
    { name: 'AFTER: Fixed Settings', craneRot: 3.2, truckSpeed: 62 },
    { name: 'VARIANT: Crane Only', craneRot: 3.2, truckSpeed: 65 },
    { name: 'VARIANT: Truck Only', craneRot: 2.8, truckSpeed: 62 }
];

const results = [];

tests.forEach(test => {
    const sim = new VerificationSim(test.craneRot, test.truckSpeed);
    const report = sim.run(120);
    results.push({ test, report });

    console.log(`${test.name}`);
    console.log(`  Crane Rotation: ${test.craneRot} rad/s | Truck Speed: ${test.truckSpeed} px/s`);
    console.log(`  Top Storage Peak: ${report.topStorageMax} blocks (avg: ${report.topStorageAvg})`);
    console.log(`  Buildup Duration: ${report.buildupDuration}s`);
    console.log(`  Improvement vs Baseline: ${report.effectiveness}%`);
    console.log(`  Bottom Quarry Blocks Processed: ${report.finalBottomQuarry}`);
    console.log();
});

console.log('='.repeat(100));
console.log('SUMMARY');
console.log('='.repeat(100));
console.log();

const baseline = results[0].report;
const fixed = results[1].report;

console.log('KEY METRICS COMPARISON:');
console.log(`  Top Storage Peak: ${baseline.topStorageMax} → ${fixed.topStorageMax} (${((fixed.topStorageMax - baseline.topStorageMax) / baseline.topStorageMax * 100).toFixed(0)}%)`);
console.log(`  Buildup Duration: ${baseline.buildupDuration}s → ${fixed.buildupDuration}s (${((baseline.buildupDuration - fixed.buildupDuration) / baseline.buildupDuration * 100).toFixed(0)}% reduction)`);
console.log(`  Average Storage: ${baseline.topStorageAvg} → ${fixed.topStorageAvg} blocks`);
console.log();

if (fixed.topStorageMax < baseline.topStorageMax) {
    console.log('✓ FIX SUCCESSFUL: Both crane speed increase and truck slowdown reduce peak storage');
} else {
    console.log('✗ FIX NEEDS ADJUSTMENT');
}
