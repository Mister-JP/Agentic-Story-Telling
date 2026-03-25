/**
 * Story fixture data derived from the real story/ directory.
 * Inlined so tests work in jsdom without file-system access.
 */

// ── Elements index (pipe-delimited entries from story/elements.md) ─────────
export const ELEMENTS_INDEX_RAW = `# Elements

## Entries
- person | Mira | elt_45d617e4531b | Mira | carries the silver key; receives mother's letter; recalls Elias's disappearance; investigates with Arun
- person | Arun | elt_b973f2e09131 | Arun | assists with greenhouse work; knows about Elias's disappearance; collaborates with Mira; has conflicting family history
- person | Elias | elt_9f0d7e04852f | Elias Vale | missing since 1988; disappeared by the river; toll house ledger reveals true relationship; central to Mira's family mystery
- place | Saint Alder Chapel | elt_03e8d4548117 | chapel, Saint Alder Chapel | contains hidden compartments; location of key discoveries; linked to Nani's burial; site of Elias's disappearance
- item | Silver Key | elt_bd49df28a5e7 | key, silver key | found under chapel floorboards; carried by Mira since 13; connected to closing secrets; linked to chapel's hidden compartments
- item | Toll House Ledger Page | elt_4f2c3df00e4e | ledger page, toll house ledger, family relationship, Mira and Elias | reveals true family relationship; contradicts family accounts; found in chapel drawer; dated 1988; uncle-niece relationship; revealed in toll house ledger; central to key's purpose
- person | Sister Celine | elt_858965cdeeb9 | Sister Celine | buried Nani; vanished from records in 1988; reappears in 1998; knows about the key's purpose
- item | Cloth Bundle | elt_8f8a9d9a7e50 | bundle, cloth bundle | left at chapel altar; contains physical evidence; disappears after discovery; tied with red thread
- item | Cracked Watch | elt_e2bc7b804e58 | watch, cracked watch, stones, river stones | cracked face stopped at 2:12 a.m.; found in cloth bundle; linked to disappearance timeline; remains after other items disappear; evidence of river disappearance; three in number; linked to Elias's fate
`.trim()

// ── Events index (pipe-delimited entries from story/events.md) ─────────────
export const EVENTS_INDEX_RAW = `# Events

## Entries
- evt_f72bc8fe0f29 | Late June, 1998, before sunrise | Chapter 7 | Mira receives a letter from her mother sealed with chapel wax that mentions 'the one who went missing by the river'
- evt_f2e1969e1f2f | Late June, 1998, before sunrise | Chapter 7 | Mira and Arun discuss conflicting accounts of Elias's disappearance: Mira's mother said he ran, Arun's mother said he drowned, and Nani said neither
- evt_18262658f796 | June 28, 1998, 7:15 a.m. | Chapter 8 | Mira and Arun find the chapel door open.
- evt_c43da1c48907 | June 28, 1998, 7:15 a.m. | Chapter 8 | A cloth bundle with river stones, a cracked watch stopped at 2:12 a.m., and a toll house ledger page naming Elias as Mira's mother's brother is found at the altar
- evt_312eafedfd49 | June 28, 1998, 7:15 a.m. | Chapter 8 | Sister Celine appears and reveals the silver key closes something rather than opens it
- evt_50b5adf351ae | Late June, 1998, before sunrise | Chapter 7 | Mira is carrying the silver key she found under the chapel floorboards when she was thirteen, having started carrying it again three nights ago
- evt_d23bb1179343 | June 28, 1998, 7:15 a.m. | Chapter 8 | A packet of letters bound in black thread dated July 3, 1988 is found in the vestry drawer
`.trim()

// ── Mira element detail (from story/elements/elt_45d617e4531b.md) ──────────
export const MIRA_DETAIL_RAW = `# Mira

## Identification
- UUID: elt_45d617e4531b
- Type: person
- Canonical name: Mira
- Aliases: Mira
- Identification keys: carries the silver key; receives mother's letter; recalls Elias's disappearance; investigates with Arun

## Core Understanding
Mira is the primary investigator of Elias's disappearance, carrying both literal and metaphorical keys to the family's buried secrets.

## Stable Profile
- Primary investigator of Elias's disappearance
- Carries silver key with closing function

## Interpretation
- The silver key's transition from 'found at 13' to 'resumed carrying three nights ago' suggests deliberate re-engagement.

## Knowledge / Beliefs / Uncertainties
- Knows the silver key closes rather than opens something
- Knows the toll house ledger page reveals Elias was her mother's brother

## Element-Centered Chronology
### Before current narrative
- Elias disappeared in 1988 by the river; family accounts conflict

### Chapter 7 — Late June 1998
- Received mother's letter sealed with chapel wax

### Chapter 8 — June 28, 1998
- Discovered cloth bundle at altar

## Open Threads
- Uncertain how the key's closing function relates to the chapel's hidden compartments
`.trim()

// ── Letter event detail (from story/events/evt_f72bc8fe0f29.md) ───────────
export const LETTER_EVENT_DETAIL_RAW = `# Mira receives a letter from her mother sealed with chapel wax that mentions 'the one who went missing by the river'

## Identification
- UUID: evt_f72bc8fe0f29
- When: Late June, 1998, before sunrise
- Chapters: Chapter 7
- Summary: Mira receives a letter from her mother sealed with chapel wax

## Core Understanding
Mira receives a letter at 11:40 p.m., folded twice and sealed with chapel wax.

## Causal Context
- The silver key's history: found at 13, carried again three nights before this event

## Consequences & Ripple Effects
- Triggers immediate action: Mira and Arun head to the chapel at 6:05 a.m.

## Participants & Roles
- Mira (recipient, carrier of silver key)
- Arun (discussant, present during letter analysis)

## Evidence & Grounding
- 'The letter from her mother had arrived at 11:40 p.m., folded twice, sealed with the chapel wax'

## Open Threads
- True nature of Elias's disappearance: running vs. drowning vs. Nani's unknown third possibility
`.trim()

// ── Parsed helpers ────────────────────────────────────────────────────────
/** Parse the entries section of elements.md into structured objects. */
export function parseElementEntries(rawText) {
  return rawText
    .split('\n')
    .filter((line) => line.startsWith('- '))
    .map((line) => {
      const parts = line.slice(2).split(' | ')
      return {
        kind: parts[0],
        displayName: parts[1],
        uuid: parts[2],
        aliases: parts[3]?.split(',').map((s) => s.trim()) ?? [],
        identificationKeys: parts[4]?.split(';').map((s) => s.trim()) ?? [],
      }
    })
}

/** Parse the entries section of events.md into structured objects. */
export function parseEventEntries(rawText) {
  return rawText
    .split('\n')
    .filter((line) => line.startsWith('- '))
    .map((line) => {
      const parts = line.slice(2).split(' | ')
      return {
        uuid: parts[0],
        when: parts[1],
        chapters: parts[2],
        summary: parts[3],
      }
    })
}
