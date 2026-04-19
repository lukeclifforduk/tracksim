// Headless simulation engine for bottleneck analysis

class SimulationMetrics {
    constructor() {
        this.samples = [];
        this.startTime = Date.now();
    }

    record(time, topStorage, bottomStorage, topQuarryCount, bottomQuarryCount, trainLoaded, craneState) {
        this.samples.push({
            time,
            topStorage,
            bottomStorage,
            topQuarryCount,
            bottomQuarryCount,
            trainLoaded,
            craneState
        });
    }

    getReport() {
        if (this.samples.length === 0) return null;

        const topStorageMax = Math.max(...this.samples.map(s => s.topStorage));
        const topStorageAvg = this.samples.reduce((a, s) => a + s.topStorage, 0) / this.samples.length;
        const bottomStorageMax = Math.max(...this.samples.map(s => s.bottomStorage));
        const bottomStorageAvg = this.samples.reduce((a, s) => a + s.bottomStorage, 0) / this.samples.length;

        // Find buildup period (when topStorage is consistently high)
        const highThreshold = topStorageMax * 0.7;
        const buildupSamples = this.samples.filter(s => s.topStorage >= highThreshold);
        const buildupDuration = buildupSamples.length > 0
            ? (buildupSamples[buildupSamples.length - 1].time - buildupSamples[0].time)
            : 0;

        return {
            duration: this.samples[this.samples.length - 1].time,
            topStorage: { max: topStorageMax, avg: topStorageAvg.toFixed(2) },
            bottomStorage: { max: bottomStorageMax, avg: bottomStorageAvg.toFixed(2) },
            buildupDuration: buildupDuration.toFixed(1),
            blocksThroughput: (this.samples[this.samples.length - 1].bottomQuarryCount / this.samples[this.samples.length - 1].time).toFixed(2)
        };
    }
}

class Simulation {
    constructor(params = {}) {
        // Apply parameter multipliers
        this.craneSpeedMult = params.craneSpeed || 1.0;
        this.truckSpeedMult = params.truckSpeed || 1.0;
        this.forkSpeedMult = params.forkSpeed || 1.0;
        this.trainSpeedMult = params.trainSpeed || 1.0;
        this.additionalCarriages = params.additionalCarriages || 0;

        // Constants
        this.STORAGE_CAPACITY = 20;
        this.BLOCK_SIZE = 18;

        // State
        this.time = 0;
        this.topStorageCount = 0;
        this.bottomStorageCount = 0;
        this.trainBlocks = new Array(5 + this.additionalCarriages).fill(false);
        this.metrics = new SimulationMetrics();

        // Truck fleet
        this.topTrucks = [
            { state: 'PARKED', timer: Math.random() * 2 + 0.5, hasBlock: false, cycleTime: 8 / this.truckSpeedMult },
            { state: 'PARKED', timer: Math.random() * 2 + 0.5, hasBlock: false, cycleTime: 8 / this.truckSpeedMult }
        ];
        this.bottomTrucks = [
            { state: 'PARKED', timer: Math.random() * 2 + 1, hasBlock: false, cycleTime: 8 / this.truckSpeedMult },
            { state: 'PARKED', timer: Math.random() * 2 + 1, hasBlock: false, cycleTime: 8 / this.truckSpeedMult }
        ];

        // Forklifts
        this.topForklift = {
            state: 'IDLE',
            timer: 0,
            carrying: false,
            cycleTime: 6 / this.forkSpeedMult
        };
        this.bottomForklift = {
            state: 'IDLE',
            timer: 0,
            carrying: false,
            cycleTime: 6 / this.forkSpeedMult
        };

        // Cranes
        this.topCrane = {
            state: 'IDLE',
            timer: 0,
            carrying: false,
            cycleTime: 4.2 / this.craneSpeedMult  // pick + rotate + drop + retract
        };
        this.bottomCrane = {
            state: 'IDLE',
            timer: 0,
            carrying: false,
            cycleTime: 4.2 / this.craneSpeedMult
        };

        // Quarry blocks (simplified counting)
        this.topQuarryCount = 200;
        this.bottomQuarryCount = 0;

        // Train
        this.trainState = 'MOVING';
        this.trainAtStation = null;
        this.trainCycleTime = 15 / this.trainSpeedMult; // Full cycle time
    }

    update(dt) {
        this.time += dt;

        // Update top trucks (pickup from quarry, deliver to storage)
        for (let truck of this.topTrucks) {
            if (truck.state === 'PARKED') {
                truck.timer -= dt;
                if (truck.timer <= 0 && this.topQuarryCount > 0 && this.topStorageCount < this.STORAGE_CAPACITY) {
                    truck.state = 'DRIVING';
                    truck.timer = truck.cycleTime;
                }
            } else if (truck.state === 'DRIVING') {
                truck.timer -= dt;
                if (truck.timer <= 0) {
                    if (!truck.hasBlock && this.topQuarryCount > 0) {
                        truck.hasBlock = true;
                        this.topQuarryCount--;
                    } else if (truck.hasBlock) {
                        this.topStorageCount++;
                        truck.hasBlock = false;
                    }
                    truck.state = 'PARKED';
                    truck.timer = Math.random() * 2 + 0.5;
                }
            }
        }

        // Update bottom trucks (pickup from storage, deliver to quarry)
        for (let truck of this.bottomTrucks) {
            if (truck.state === 'PARKED') {
                truck.timer -= dt;
                if (truck.timer <= 0 && this.bottomStorageCount > 0) {
                    truck.state = 'DRIVING';
                    truck.timer = truck.cycleTime;
                }
            } else if (truck.state === 'DRIVING') {
                truck.timer -= dt;
                if (truck.timer <= 0) {
                    if (!truck.hasBlock && this.bottomStorageCount > 0) {
                        truck.hasBlock = true;
                        this.bottomStorageCount--;
                    } else if (truck.hasBlock) {
                        this.bottomQuarryCount++;
                        truck.hasBlock = false;
                    }
                    truck.state = 'PARKED';
                    truck.timer = Math.random() * 2 + 1;
                }
            }
        }

        // Update top crane (storage -> train)
        if (this.trainAtStation === 'top') {
            if (this.topCrane.state === 'IDLE' && this.topStorageCount > 0) {
                const emptySlot = this.trainBlocks.findIndex(b => !b);
                if (emptySlot >= 0) {
                    this.topCrane.state = 'WORKING';
                    this.topCrane.timer = this.topCrane.cycleTime;
                }
            } else if (this.topCrane.state === 'WORKING') {
                this.topCrane.timer -= dt;
                if (this.topCrane.timer <= 0) {
                    // Perform the transfer
                    if (this.topStorageCount > 0) {
                        const emptySlot = this.trainBlocks.findIndex(b => !b);
                        if (emptySlot >= 0) {
                            this.topStorageCount--;
                            this.trainBlocks[emptySlot] = true;
                            this.topCrane.state = 'IDLE';
                            this.topCrane.timer = 0;
                        }
                    }
                }
            }
        } else {
            this.topCrane.state = 'IDLE';
        }

        // Update bottom crane (train -> storage)
        if (this.trainAtStation === 'bottom') {
            if (this.bottomCrane.state === 'IDLE') {
                const fullSlot = this.trainBlocks.findIndex(b => b);
                if (fullSlot >= 0 && this.bottomStorageCount < this.STORAGE_CAPACITY) {
                    this.bottomCrane.state = 'WORKING';
                    this.bottomCrane.timer = this.bottomCrane.cycleTime;
                }
            } else if (this.bottomCrane.state === 'WORKING') {
                this.bottomCrane.timer -= dt;
                if (this.bottomCrane.timer <= 0) {
                    // Perform the transfer
                    const fullSlot = this.trainBlocks.findIndex(b => b);
                    if (fullSlot >= 0 && this.bottomStorageCount < this.STORAGE_CAPACITY) {
                        this.trainBlocks[fullSlot] = false;
                        this.bottomStorageCount++;
                        this.bottomCrane.state = 'IDLE';
                        this.bottomCrane.timer = 0;
                    }
                }
            }
        } else {
            this.bottomCrane.state = 'IDLE';
        }

        // Simulate train movement (simplified)
        // Train alternates between stations
        if (this.trainState === 'MOVING') {
            // Check if we should stop
            if (Math.random() < (dt / 8)) { // Random stop based on simulated position
                const isFull = this.trainBlocks.every(b => b);
                if (isFull) {
                    this.trainState = 'STOPPED';
                    this.trainAtStation = 'bottom';
                } else {
                    const isEmpty = !this.trainBlocks.some(b => b);
                    if (isEmpty) {
                        this.trainState = 'STOPPED';
                        this.trainAtStation = 'top';
                    }
                }
            }
        } else if (this.trainState === 'STOPPED') {
            // Check if ready to depart
            const isEmpty = !this.trainBlocks.some(b => b);
            const isFull = this.trainBlocks.every(b => b);
            if ((this.trainAtStation === 'top' && isFull) ||
                (this.trainAtStation === 'bottom' && isEmpty)) {
                this.trainState = 'MOVING';
                this.trainAtStation = null;
            }
        }

        // Record metrics
        if (this.time % 0.5 < dt) { // Every 0.5 seconds
            this.metrics.record(
                parseFloat(this.time.toFixed(2)),
                this.topStorageCount,
                this.bottomStorageCount,
                this.topQuarryCount,
                this.bottomQuarryCount,
                this.trainBlocks.filter(b => b).length,
                this.topCrane.state
            );
        }
    }

    run(duration = 120) {
        const dt = 0.01; // 10ms timesteps
        while (this.time < duration) {
            this.update(dt);
        }
        return this.metrics.getReport();
    }
}

// Run tests
if (require.main === module) {
    const configs = [
        { name: 'Baseline', params: {} },
        { name: 'Faster Cranes (+50%)', params: { craneSpeed: 1.5 } },
        { name: 'Faster Cranes (+100%)', params: { craneSpeed: 2.0 } },
        { name: 'Slower Trucks (-30%)', params: { truckSpeed: 0.7 } },
        { name: 'Faster Forklifts (+50%)', params: { forkSpeed: 1.5 } },
        { name: 'More Carriages (+3)', params: { additionalCarriages: 3 } },
        { name: 'Combined: Faster Cranes + More Carriages', params: { craneSpeed: 1.5, additionalCarriages: 2 } }
    ];

    console.log('='.repeat(100));
    console.log('BOTTLENECK ANALYSIS: Top Storage Buildup');
    console.log('='.repeat(100));
    console.log();

    const results = [];
    for (const config of configs) {
        const sim = new Simulation(config.params);
        const report = sim.run(120);
        results.push({ config: config.name, report });

        console.log(`${config.name}:`);
        console.log(`  Duration: ${report.duration.toFixed(1)}s`);
        console.log(`  Top Storage: max=${report.topStorage.max}, avg=${report.topStorage.avg}`);
        console.log(`  Bottom Storage: max=${report.bottomStorage.max}, avg=${report.bottomStorage.avg}`);
        console.log(`  Buildup Duration: ${report.buildupDuration}s`);
        console.log(`  Throughput: ${report.blocksThroughput} blocks/sec`);
        console.log();
    }

    // Analysis
    console.log('='.repeat(100));
    console.log('ANALYSIS');
    console.log('='.repeat(100));

    const baseline = results[0].report;
    console.log('\nImpact compared to baseline:');
    for (let i = 1; i < results.length; i++) {
        const report = results[i].report;
        const topStorageDiff = ((report.topStorage.max - baseline.topStorage.max) / baseline.topStorage.max * 100).toFixed(0);
        const throughputDiff = ((report.blocksThroughput - baseline.blocksThroughput) / baseline.blocksThroughput * 100).toFixed(0);
        console.log(`\n${results[i].config}:`);
        console.log(`  Top Storage Change: ${topStorageDiff}%`);
        console.log(`  Throughput Change: ${throughputDiff}%`);
    }
}

module.exports = Simulation;
