// Tracks a single in-progress build as a shared job between Beast and the
// players helping. When a build comes up short on materials, the shortfall
// isn't dumped straight into silent auto-gathering; it's surfaced as a request,
// and players can claim parts of it ("I'll grab the glass"). Beast then only
// takes responsibility for what nobody else has claimed.
//
// Kept in memory for the life of the session - trust persists, but a build in
// progress does not survive a restart (yet).

export class BuildSession {
    constructor() {
        this.reset();
    }

    reset(name = null) {
        this.name = name;
        this.missing = {};   // item -> count still needed for the build
        this.claims = {};    // item -> player who said they'd supply it
        this.asked = false;  // whether Beast has already asked for help this build
    }

    hasActiveBuild() {
        return this.name !== null;
    }

    /**
     * Update the outstanding shortfall (recomputed fresh each build pass, so
     * items a player has since handed over simply drop off). Claims for items
     * that are no longer missing are cleared automatically.
     */
    setMissing(missing) {
        this.missing = { ...missing };
        for (const item of Object.keys(this.claims)) {
            if (!this.missing[item]) delete this.claims[item];
        }
    }

    claim(item, player) {
        if (!(item in this.missing)) return false;
        this.claims[item] = player;
        return true;
    }

    unclaim(item) {
        delete this.claims[item];
    }

    // Items Beast is responsible for gathering itself: still missing, nobody's on it.
    getUnclaimed() {
        const out = {};
        for (const [item, count] of Object.entries(this.missing)) {
            if (!this.claims[item]) out[item] = count;
        }
        return out;
    }

    getClaimed() {
        const out = {};
        for (const [item, player] of Object.entries(this.claims)) {
            if (this.missing[item]) out[item] = { count: this.missing[item], player };
        }
        return out;
    }

    isComplete() {
        return Object.keys(this.missing).length === 0;
    }

    // Human-readable split of the outstanding work, for status queries and to
    // give the model something concrete to phrase a request around.
    summary() {
        if (!this.hasActiveBuild()) return 'No build in progress.';
        if (this.isComplete()) return `"${this.name}" has all its materials.`;

        let res = `Build "${this.name}" still needs:`;
        const unclaimed = this.getUnclaimed();
        const claimed = this.getClaimed();

        const unclaimedList = Object.entries(unclaimed).map(([i, n]) => `${n} ${i}`);
        const claimedList = Object.entries(claimed).map(([i, c]) => `${c.count} ${i} (${c.player})`);

        res += unclaimedList.length > 0
            ? `\n- On Beast: ${unclaimedList.join(', ')}`
            : `\n- On Beast: nothing`;
        if (claimedList.length > 0)
            res += `\n- Claimed by others: ${claimedList.join(', ')}`;
        return res;
    }
}
