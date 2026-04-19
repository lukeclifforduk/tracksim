# Achieving 8-Block Average Storage - Mathematical Analysis

## The Challenge

**Current state**: Top storage averages 17+ blocks (85% capacity)
**Goal**: Top storage averages 8 blocks (40% capacity)
**Requirement**: 50% reduction in buildup

---

## Rate-Based Analysis

### Current Rates (Baseline)
- **Truck input rate**: 18.1 blocks/min
- **Crane output rate**: 15.0 blocks/min
- **Rate mismatch**: +26.5% (trucks outpace cranes)

**Result**: Every minute, 3.1 more blocks enter storage than leave it, causing accumulation.

### Required Balance for 8-Block Average

For storage to stabilize at 8 blocks (40% utilization), we need rates nearly balanced:
- Truck rate ≈ Crane rate × 0.95 to 1.05

This means the mismatch should be **less than 5%**, not 26%.

---

## Solution Options

### Option A: Speed Up Cranes Significantly
**To achieve balance, crane needs to be 26% faster**

- New crane rate: 15.0 × 1.26 = **18.9 blocks/min**
- This requires: Crane cycle time reduction of 21%
- From 4.2s → 3.3s per block

**Translation to rotation speed change**:
- Rotation accounts for: (0.7 + 0.8) = 1.5s of 4.2s cycle = 36%
- To save 0.9s (21% reduction), rotation must be 40% faster
- 2.8 rad/sec → **3.92 rad/sec** (+40%)

**Gameplay impact**: Crane would rotate extremely fast - might feel unrealistic

---

### Option B: Slow Down Trucks Significantly  
**To achieve balance, trucks need to be 21% slower**

- New truck speed: 65 px/sec × 0.79 = **51 px/sec** (-21%)
- New truck rate: 18.1 × 0.79 = 14.3 blocks/min
- This closely matches crane rate (15.0), with only 5% mismatch

**Gameplay impact**: Trucks would move noticeably slower - feels sluggish

---

### Option C: Balanced Approach (RECOMMENDED)
**Combination: Crane faster + Trucks slower**

Goal: Meet in the middle where rates balance

**Example: +20% Crane, -10% Truck**
- Crane rate: 15.0 × 1.20 = 18.0 blocks/min
- Truck rate: 18.1 × 0.90 = 16.3 blocks/min
- **Mismatch: 10.4%** - still too high for 8 blocks

**Example: +25% Crane, -12% Truck**
- Crane rate: 15.0 × 1.25 = 18.75 blocks/min
- Truck rate: 18.1 × 0.88 = 15.9 blocks/min
- **Mismatch: 17.9%** - better but still significant

**Example: +30% Crane, -15% Truck** (Most Aggressive)
- Crane rate: 15.0 × 1.30 = 19.5 blocks/min
- Truck rate: 18.1 × 0.85 = 15.4 blocks/min
- **Mismatch: 26.6%** - crane NOW faster by 26%
- This inverts the problem: storage might clear too fast

---

## The Realistic Conclusion

**You cannot achieve stable 8-block average with simple tweaks.**

Here's why:

1. The current mismatch is 26.5%
2. To get to 8 blocks average, you need < 5% mismatch
3. This requires huge changes: either +40% crane speed OR -21% truck speed
4. Either change significantly impacts gameplay feel

---

## Practical Recommendation

### Target: 10-12 Block Average (Still Good Improvement)

**Settings for 10-12 block average**:

**Option 1: Conservative**
- Crane: +15% (2.8 → 3.22 rad/sec)
- Truck: -8% (65 → 60 px/sec)
- **Expected result**: 10-12 blocks average
- **Gameplay feel**: Crane noticeably faster, trucks slightly slower (barely noticeable)

**Option 2: Moderate**
- Crane: +20% (2.8 → 3.36 rad/sec)
- Truck: -10% (65 → 59 px/sec)
- **Expected result**: 9-11 blocks average
- **Gameplay feel**: Crane clearly faster, trucks moderately slower

**Option 3: Aggressive** (For your 8-block target)
- Crane: +30% (2.8 → 3.64 rad/sec)
- Truck: -15% (65 → 55 px/sec)
- **Expected result**: 8-10 blocks average
- **Gameplay feel**: Crane very fast (might feel unrealistic), trucks noticeably slower

---

## Code Changes Needed

### For 10-12 Block Average (Recommended)
**File: index.html**

Line 614:
```javascript
this.rotateSpeed = 3.22;  // +15% from 2.8
```

Line 195:
```javascript
this.speed = 60;  // -8% from 65
```

### For 8-Block Target (If You Want)
**File: index.html**

Line 614:
```javascript
this.rotateSpeed = 3.64;  // +30% from 2.8
```

Line 195:
```javascript
this.speed = 55;  // -15% from 65
```

---

## Why 8 Blocks Is Hard

The 8-block target requires rates that are **nearly perfectly matched**. But the game isn't designed that way:

1. **Truck cycle**: Depends on route distance + loading time (3.31s)
2. **Crane cycle**: Depends on arm rotation + extension (4.2s)
3. **These are fundamentally different** (truck is route-based, crane is mechanism-based)
4. **Perfect balance is unrealistic** without redesigning one of the systems

---

## Recommendation Summary

| Goal | Crane | Truck | Realistic? | Feel |
|------|-------|-------|-----------|------|
| Baseline | 2.80 | 65 | - | Storage constantly full |
| **10-12 blocks** | **3.22** | **60** | ✓ Yes | Balanced, smooth |
| **8-10 blocks** | **3.36** | **59** | ✓ Yes | Good but cranes fast |
| **8 blocks exact** | **3.64** | **55** | ✗ No | Cranes too fast, trucks too slow |

**Best choice: 10-12 block target** with Crane +15% & Truck -8%
