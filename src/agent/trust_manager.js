import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';

// Discrete tiers instead of a raw score: easy to gate actions on in code, and
// easy for the LLM to reason about consistently turn to turn. 'owner' is a
// distinguished role seeded from the profile, not something earned through events.
export const TRUST_TIERS = ['stranger', 'acquaintance', 'teammate', 'owner'];

// Trust only moves on named, auditable triggers - never on vibes. Keep this list
// short; add to it deliberately rather than letting drift happen implicitly.
const TRUST_EVENTS = {
    gave_requested_item: 1,
    helped_in_fight: 1,
    broke_protected_build: -2,
    false_identity_claim: -2,
};

const EARNABLE_MAX = TRUST_TIERS.indexOf('teammate'); // events can never promote someone to 'owner'

export class TrustManager {
    constructor(agent) {
        this.agent = agent;
        this.fp = `./bots/${agent.name}/trust.json`;
        this.relationships = {}; // username -> tier rank (0-3)
    }

    _ownerName() {
        return this.agent.prompter?.profile?.owner;
    }

    // Cold-start fix: the owner is a known teammate from the very first
    // interaction, not a stranger who has to earn trust from zero.
    _seedOwner() {
        const owner = this._ownerName();
        if (owner && this.relationships[owner] === undefined) {
            this.relationships[owner] = TRUST_TIERS.indexOf('owner');
        }
    }

    _rankOf(username) {
        return this.relationships[username] ?? 0;
    }

    getTier(username) {
        return TRUST_TIERS[this._rankOf(username)];
    }

    isAtLeast(username, tier) {
        return this._rankOf(username) >= TRUST_TIERS.indexOf(tier);
    }

    recordEvent(username, eventName) {
        if (username === this._ownerName()) return; // owner's tier is fixed, not earned
        const delta = TRUST_EVENTS[eventName];
        if (delta === undefined) {
            console.warn(`Unknown trust event: ${eventName}`);
            return;
        }
        const next = Math.max(0, Math.min(EARNABLE_MAX, this._rankOf(username) + delta));
        this.relationships[username] = next;
        this.save();
    }

    load() {
        if (existsSync(this.fp)) {
            try {
                this.relationships = JSON.parse(readFileSync(this.fp, 'utf8'));
            } catch (error) {
                console.error('Failed to load trust data:', error);
                this.relationships = {};
            }
        }
        this._seedOwner();
    }

    save() {
        try {
            mkdirSync(`./bots/${this.agent.name}`, { recursive: true });
            writeFileSync(this.fp, JSON.stringify(this.relationships, null, 2));
        } catch (error) {
            console.error('Failed to save trust data:', error);
        }
    }

    getJson() {
        return this.relationships;
    }
}
