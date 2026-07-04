# Beast Test Plan — trust, dig-safety, schematics, collaboration

Manual in-game verification for the four features on this branch. None of this
could be run in the build container (no `npm install` there), so this is the
first real runtime check.

## Key testing trick

You can **force any command by typing it in chat yourself** (e.g. type
`!checkMaterials("small_wood_house")`). Beast executes forced commands directly,
so you can test each piece deterministically without waiting for the LLM to
choose the right command. Use this for every step below unless it says otherwise.

Watch three places for results:
- Beast's chat/whisper replies
- the server console running Beast (skill logs, refusals)
- the file `bots/Beast/trust.json` (created after first load)

---

## 0. Setup (do this first)

- [ ] In `andy.json`, set `"owner"` to **your exact Minecraft username**
      (currently `"Jordan"`). This is who gets seeded as `owner`.
- [ ] In `settings.js`, set `only_chat_with` to include your username (currently
      `["icyenthusiast88"]`), or empty it to `[]` so Beast listens to everyone.
- [ ] `npm install` (and, if you want `.schem`/`.schematic` support,
      `npm install prismarine-schematic`).
- [ ] Start the server + Beast, get both you and Beast into the world.
- [ ] Confirm `bots/Beast/trust.json` appears and contains your username at
      `"owner"`'s rank (3).

---

## 1. Trust (cold-start + gating)

- [ ] `!trustLevel("<your_name>")` → **owner**. (Cold start: trusted from the
      very first interaction, no earning required.)
- [ ] `!trustLevel("SomeRandomName")` → **stranger**.
- [ ] Ask Beast in normal chat to give you an item (e.g. "hand me some dirt").
      As owner you should get it (gate passes).
- [ ] Edit `andy.json` `owner` to a *different* name, restart, and repeat the
      give request as your (now non-owner, stranger) self → Beast refuses with a
      "not enough trust established yet" message. **Restore `owner` to your name
      afterward.**

> Note: the "delivering a claimed material bumps trust" path is awkward to see
> by hand — the owner is immune to trust events, and a non-owner must already be
> `acquaintance` before they're allowed to claim. It's covered by the unit check
> that ships with the branch; see step 4 for the manual approximation.

---

## 2. Dig-safety veto

The veto lives in `breakBlockAt`, so it applies to **every** dig path — the
`!digDown` command *and* any code Beast writes via `!newAction`.

- [ ] **Solid ground (allow):** stand on flat solid terrain, `!digDown(5)` →
      Beast digs down normally (the column below is scanned and confirmed solid).
- [ ] **Cave/void below (refuse):** stand on a thin floor with a cave or open
      drop directly beneath (e.g. a 1-block platform over a ravine). `!digDown(5)`
      → Beast refuses with "Refusing to dig straight down … drop below" and does
      **not** break the floor.
- [ ] **Lava below (refuse):** place a solid block over a lava pool, stand on it,
      `!digDown(3)` → refuses with a lava reason. Nobody dies.
- [ ] **Generated-code path (the important one):** over the same cave/void spot,
      `!newAction("dig the block directly below your feet")`. Beast should still
      refuse — the veto is not bypassable by writing raw code. This is the core
      security property.
- [ ] **Tree trunk (allow):** stand on top of a tree's trunk column and
      `!digDown(3)` → allowed (target is a log, no blind-fall risk).
- [ ] **Own build (allow):** after building a schematic (step 3), stand inside
      its footprint over a spot and dig down → allowed even if terrain below is
      unverified, because it's a known column.

---

## 3. Schematics (build + preview)

Start in **creative mode** so materials aren't a factor for the first pass.

- [ ] `!listSchematics` → lists `small_wood_house` (the bundled sample).
- [ ] `!checkMaterials("small_wood_house")` → material breakdown: ~72 blocks,
      `planks: need 55`, `log: 8`, `chest: 1`, `bed: 2`, `door: 2`, `torch: 4`,
      each with a `have` count from your inventory.
- [ ] `!buildSchematic("small_wood_house")` in creative → Beast finds a clear
      spot and builds it, ending with **"Finished building small_wood_house."**
- [ ] `!buildSchematic("does_not_exist")` → clean "No schematic named…" error
      listing what's available.
- [ ] **(optional, needs `prismarine-schematic`)** drop a real `.schem` file
      (e.g. from minecraft-schematics.com) into `schematics/`, then
      `!checkMaterials("<file>")` and `!buildSchematic("<file>")`. Confirm it
      adds the structure's solid blocks without excavating surrounding terrain
      (air voxels are skipped, not force-cleared).
- [ ] Size guard: point it at anything over ~4000 blocks → refuses and tells you
      to preview + split it up (rather than grinding forever).

---

## 4. Collaboration (shared gathering)

Switch to **survival mode** with a mostly-empty inventory so the build comes up
short. Best with a second player if you have one.

- [ ] `!buildSchematic("small_wood_house")` with too few materials → Beast places
      what it can and reports **"Still short: …"** plus a prompt to split the
      gathering (the ask). Note the exact shortfall list.
- [ ] `!buildStatus` → shows the split: everything **"On Beast"**, nothing
      claimed yet.
- [ ] `!offerHelp("<your_name>", "oak_planks")` (use an item from the shortfall)
      → "you're on oak_planks, I'll handle the rest." (Owner passes the trust
      gate.)
- [ ] `!buildStatus` → `oak_planks` now moved to **"Claimed by others"**, off
      Beast's list.
- [ ] `!offerHelp("SomeStranger", "log")` → **refused** ("don't know … well
      enough"), because a stranger can't be relied on to deliver. This is the
      trust gate protecting the build from being stalled.
- [ ] `!unclaimMaterial("oak_planks")` → "I'll gather oak_planks myself";
      `!buildStatus` shows it back on Beast.
- [ ] **Opportunistic delivery:** give/drop the missing planks to Beast, then
      `!buildSchematic("small_wood_house")` again → the delivered planks drop off
      the shortfall automatically (each pass re-tallies inventory). Repeat until
      **"Finished building"**.
- [ ] **No re-nag:** on the second `!buildSchematic` while still short, the
      message switches from asking for help to "you've already asked — just
      gather your share." It shouldn't beg every pass.

### Manual approximation of the trust-bump-on-delivery

To see a non-owner's trust rise after they deliver (owner is immune):
- [ ] Have a second player named e.g. `Casey` give Beast any requested item once
      → `!trustLevel("Casey")` should read **acquaintance**.
- [ ] Start a short build, `!offerHelp("Casey", "<item>")` (now allowed), have
      Casey deliver that item, re-run `!buildSchematic` → `!trustLevel("Casey")`
      rises toward **teammate**, and `bots/Beast/trust.json` reflects it.

---

## What "pass" looks like overall

- Beast never dies to a blind straight-down dig, from any command or generated code.
- Builds complete in creative; in survival they surface a shared, shrinking list.
- Trust starts warm for the owner and cold-but-not-hostile for everyone else, and
  gates giving items + accepting build claims.
