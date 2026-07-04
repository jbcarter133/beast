import { readdirSync, readFileSync, existsSync } from 'fs';

// Beast's build engine (src/agent/npc/build_goal.js) consumes a construction in
// this shape:
//   { name, offset, blocks: blocks[y][z][x] = <block name string> }
// where a cell is a concrete/generic block name to place, 'air' to force-clear,
// or '' to leave alone. This module loads real-world schematics (downloaded from
// sites like minecraft-schematics.com) and normalizes them into that same shape,
// so the existing BuildGoal/ItemGoal machinery can build them without changes.

export const SCHEMATIC_DIR = './schematics';

// Beyond this many placeable blocks a build is impractical for a survival
// companion to auto-gather; callers should preview + break it up instead.
export const MAX_BUILD_BLOCKS = 4000;

const AIR_NAMES = new Set(['air', 'cave_air', 'void_air']);

/**
 * Strip a Minecraft block state string down to a bare block name.
 * "minecraft:oak_planks[axis=y]" -> "oak_planks". Pure/testable.
 */
export function normalizeBlockName(name) {
    if (name == null) return '';
    let out = String(name);
    const colon = out.indexOf(':');
    if (colon !== -1) out = out.slice(colon + 1); // drop "minecraft:" namespace
    const bracket = out.indexOf('[');
    if (bracket !== -1) out = out.slice(0, bracket); // drop [state properties]
    return out.trim();
}

/**
 * Count every placeable (non-empty, non-air) block in a construction.
 * Returns { blockName: count } plus a total. Read-only; used for material
 * previews so the player can see the cost before Beast commits to a build.
 */
export function tallyMaterials(construction) {
    const counts = {};
    let total = 0;
    for (const layer of construction.blocks) {
        for (const row of layer) {
            for (const cell of row) {
                if (!cell || cell === 'air') continue;
                counts[cell] = (counts[cell] || 0) + 1;
                total++;
            }
        }
    }
    return { counts, total };
}

/**
 * Convert a parsed prismarine-schematic object into the BuildGoal construction
 * shape. Air voxels become '' (skip) rather than 'air' (force-clear) so Beast
 * only adds the structure's solid blocks instead of excavating the whole volume
 * out of the terrain - less destructive, and in keeping with the constraint layer.
 *
 * NOTE: this walks the schematic via size + getBlock(). The exact accessor names
 * can vary across prismarine-schematic versions/MC data versions; this is the one
 * part of the pipeline that needs verifying against a live install (see loadSchematicFile).
 */
export function schematicToConstruction(name, schem, Vec3) {
    const size = schem.size; // Vec3(width, height, length)
    const start = typeof schem.start === 'function' ? schem.start() : new Vec3(0, 0, 0);
    const sizex = size.x, sizey = size.y, sizez = size.z;

    const blocks = [];
    for (let y = 0; y < sizey; y++) {
        const layer = [];
        for (let z = 0; z < sizez; z++) {
            const row = [];
            for (let x = 0; x < sizex; x++) {
                const block = schem.getBlock(start.offset(x, y, z));
                const raw = block ? block.name : 'air';
                const clean = normalizeBlockName(raw);
                row.push(AIR_NAMES.has(clean) ? '' : clean);
            }
            layer.push(row);
        }
        blocks.push(layer);
    }
    // offset 0: place the structure sitting on the ground at the chosen spot,
    // rather than the villager JSONs' -1 (foundation buried one below).
    return { name, offset: 0, blocks };
}

export function listSchematics() {
    if (!existsSync(SCHEMATIC_DIR)) return [];
    return readdirSync(SCHEMATIC_DIR)
        .filter(f => /\.(json|schem|schematic)$/i.test(f))
        .map(f => f.replace(/\.(json|schem|schematic)$/i, ''));
}

function findSchematicFile(name) {
    for (const ext of ['json', 'schem', 'schematic']) {
        const fp = `${SCHEMATIC_DIR}/${name}.${ext}`;
        if (existsSync(fp)) return { fp, ext };
    }
    return null;
}

/**
 * Load a schematic by name from SCHEMATIC_DIR into a BuildGoal construction.
 *  - .json  : already in construction shape (fully supported, no extra deps)
 *  - .schem / .schematic : parsed via prismarine-schematic (needs the dependency
 *    installed and is imported lazily so a missing dep only fails this path)
 * Returns { construction } or { error }.
 */
export async function loadSchematicFile(name, bot) {
    const found = findSchematicFile(name);
    if (!found) {
        return { error: `No schematic named "${name}" found in ${SCHEMATIC_DIR}. Available: ${listSchematics().join(', ') || 'none'}.` };
    }

    if (found.ext === 'json') {
        try {
            const construction = JSON.parse(readFileSync(found.fp, 'utf8'));
            if (!construction.blocks) return { error: `"${name}.json" is missing a "blocks" array.` };
            if (construction.offset === undefined) construction.offset = 0;
            construction.name = name;
            return { construction };
        } catch (e) {
            return { error: `Failed to parse "${name}.json": ${e.message}` };
        }
    }

    // .schem / .schematic -> needs prismarine-schematic + prismarine Vec3.
    let Schematic, Vec3;
    try {
        ({ Schematic } = await import('prismarine-schematic'));
        Vec3 = (await import('vec3')).default;
    } catch (e) {
        return { error: `Reading .${found.ext} files needs the "prismarine-schematic" package installed (npm install prismarine-schematic). ${e.message}` };
    }
    try {
        const buffer = readFileSync(found.fp);
        const version = bot?.version || '1.20';
        const schem = await Schematic.read(buffer, version);
        const construction = schematicToConstruction(name, schem, Vec3);
        return { construction };
    } catch (e) {
        return { error: `Failed to read "${name}.${found.ext}": ${e.message}` };
    }
}

/**
 * Bounding-box footprint of a construction placed at `position`. Used to mark
 * these cells as a known column for the dig-safety constraint (same superset
 * approach as NPCController.getBuiltPositions).
 */
export function footprintPositions(construction, position) {
    const positions = [];
    const sizey = construction.blocks.length;
    const sizez = construction.blocks[0].length;
    const sizex = construction.blocks[0][0].length;
    for (let y = construction.offset; y < sizey + construction.offset; y++) {
        for (let z = 0; z < sizez; z++) {
            for (let x = 0; x < sizex; x++) {
                positions.push({ x: position.x + x, y: position.y + y, z: position.z + z });
            }
        }
    }
    return positions;
}
