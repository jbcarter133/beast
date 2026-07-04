import Vec3 from 'vec3';

// Pre-execution veto checks for actions that are cheap to get wrong and expensive
// to undo. These run inside the skill functions themselves (not just in the
// persona prompt) so they apply no matter which code path triggers the action -
// a named skill, the villager build system, or raw LLM-generated !newAction code.

const HAZARD_BLOCKS = ['lava', 'water'];
const MAX_BLIND_FALL = 2; // same tolerance digDown() already uses for an acceptable drop
const MAX_SCAN_DEPTH = 32; // beyond this, chunks aren't reliably loaded/known

function isHazardBlock(block) {
    return !!block && HAZARD_BLOCKS.includes(block.name);
}

function isOpenBlock(block) {
    return !!block && (block.name === 'air' || block.name === 'cave_air');
}

export function isTreeTrunk(block) {
    return !!block && block.name.includes('log');
}

export function isKnownColumn(bot, x, y, z) {
    const known = bot.known_structures || [];
    return known.some(p => p.x === x && p.y === y && p.z === z);
}

/**
 * Reads down from (x, y, z) without breaking anything, and reports whether it's
 * safe ground to open up: no lava/water, and no fall deeper than can be confirmed.
 * This scans the whole prospective drop up front instead of checking one block at
 * a time while mid-dig - by the time an in-progress dig discovers a hazard, the
 * bot is already standing at the edge of it.
 */
export function scanColumnClear(bot, x, y, z, maxDepth = MAX_SCAN_DEPTH) {
    let fall = 0;
    for (let i = 0; i <= maxDepth; i++) {
        const block = bot.blockAt(Vec3(x, y - i, z));
        if (!block) {
            return { safe: false, reason: 'chunk not loaded that far down, cannot verify' };
        }
        if (isHazardBlock(block)) {
            return { safe: false, reason: `${block.name} below` };
        }
        if (isOpenBlock(block)) {
            fall++;
            if (fall > MAX_BLIND_FALL) {
                return { safe: false, reason: 'drop below is deeper than can be verified safe' };
            }
            continue;
        }
        return { safe: true, reason: `solid ${block.name} confirmed ${i} block(s) below` };
    }
    return { safe: false, reason: 'could not confirm solid ground within scan range' };
}

/**
 * Veto check for breaking a block directly beneath the bot. Never dig blind into
 * unverified terrain - only into columns Beast already has ground-truth on (its
 * own tracked builds, or a tree trunk), or ground that's been scanned clear for
 * its full depth ahead of time.
 */
export function canDigStraightDown(bot, x, y, z) {
    if (isKnownColumn(bot, x, y, z)) {
        return { safe: true, reason: 'inside a structure Beast already built' };
    }
    const target = bot.blockAt(Vec3(x, y, z));
    if (isTreeTrunk(target)) {
        return { safe: true, reason: 'tree trunk, not open ground' };
    }
    return scanColumnClear(bot, x, y - 1, z);
}
