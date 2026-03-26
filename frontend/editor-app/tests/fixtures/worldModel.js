// Test fixtures derived from the real story/ directory.
// These mirror the actual markdown formats used by the agentic harness.

export const ELEMENT_FIELD_NAMES = [
  'kind',
  'display_name',
  'uuid',
  'aliases',
  'identification_keys',
];

export const EVENT_FIELD_NAMES = [
  'uuid',
  'when',
  'chapters',
  'summary',
];

export const ELEMENTS_INDEX_MD = `# Elements

Purpose:
This file is the canonical index of stable, story-relevant elements in the world model.

Definitions:
- Element:
  A stable, story-relevant unit of the world model.

- Kind:
  The broad category of what the element is.

- Display Name:
  The canonical surface name used to represent the element in the index.

- UUID:
  A stable canonical identifier for the element.

- Aliases:
  Alternative names, labels, titles, spellings, or surface references.

- Identification Keys:
  Short recognition cues that help distinguish this element from others.

Format:
- kind | display_name | uuid | aliases | identification_keys

Notes:
- one line per canonical element
- uuid is generated programmatically
- aliases are comma-separated
- identification_keys are semicolon-separated short recognition cues
- detailed element files live in ./story/elements/<uuid>.md

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
`;

export const EVENTS_INDEX_MD = `# Events

Purpose:
This file is the canonical index of meaningful story events.

Definitions:
- Event:
  A bounded, world-relevant unit of change.

- UUID:
  A stable canonical identifier for the event.

- When:
  The best currently known placement of the event in story time.

- Chapters:
  The manuscript locations where the event is evidenced.

- Summary:
  A short canonical description of what the event is.

Format:
- uuid | when | chapters | summary

Notes:
- one line per meaningful story event
- uuid is generated programmatically
- when may remain open if the manuscript does not yet support a stronger placement
- chapters may be a single chapter, multiple chapters, or a range
- summary should stay compact and canonical
- detailed event files live in ./story/events/<uuid>.md

## Entries
- evt_f72bc8fe0f29 | Late June, 1998, before sunrise | Chapter 7 | Mira receives a letter from her mother sealed with chapel wax that mentions 'the one who went missing by the river'
- evt_f2e1969e1f2f | Late June, 1998, before sunrise | Chapter 7 | Mira and Arun discuss conflicting accounts of Elias's disappearance: Mira's mother said he ran, Arun's mother said he drowned, and Nani said neither
- evt_18262658f796 | June 28, 1998, 7:15 a.m. | Chapter 8 | Mira and Arun find the chapel door open.
- evt_c43da1c48907 | June 28, 1998, 7:15 a.m. | Chapter 8 | A cloth bundle with river stones, a cracked watch stopped at 2:12 a.m., and a toll house ledger page naming Elias as Mira's mother's brother is found at the altar
- evt_312eafedfd49 | June 28, 1998, 7:15 a.m. | Chapter 8 | Sister Celine appears and reveals the silver key closes something rather than opens it
- evt_50b5adf351ae | Late June, 1998, before sunrise | Chapter 7 | Mira is carrying the silver key she found under the chapel floorboards when she was thirteen, having started carrying it again three nights ago
- evt_d23bb1179343 | June 28, 1998, 7:15 a.m. | Chapter 8 | A packet of letters bound in black thread dated July 3, 1988 is found in the vestry drawer
`;

export const POPULATED_ELEMENT_DETAIL_MD = `# Mira

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
- The silver key's transition from 'found at 13' to 'resumed carrying three nights ago' suggests a deliberate re-engagement with suppressed family knowledge

## Knowledge / Beliefs / Uncertainties
- Knows the silver key closes rather than opens something
- Knows the toll house ledger page reveals Elias was her mother's brother

## Element-Centered Chronology
### Before current narrative
- Elias disappeared in 1988 by the river

### Chapter 7 — Late June 1998
- Received mother's letter at 11:40 p.m. sealed with chapel wax

### Chapter 8 — June 28, 1998
- Discovered cloth bundle at altar containing river stones

## Open Threads
- Uncertain how the key's closing function relates to the chapel's hidden compartments
- Uncertain why the cloth bundle disappeared after being discovered
`;

export const TBD_ELEMENT_DETAIL_MD = `# Saint Alder Chapel

## Identification
- UUID: elt_03e8d4548117
- Type: place
- Canonical name: Saint Alder Chapel
- Aliases: chapel, Saint Alder Chapel
- Identification keys: contains hidden compartments; location of key discoveries; linked to Nani's burial; site of Elias's disappearance

## Core Understanding
- TBD

## Stable Profile
- TBD

## Interpretation
- TBD

## Knowledge / Beliefs / Uncertainties
- TBD

## Element-Centered Chronology
- TBD

## Open Threads
- TBD
`;

export const POPULATED_EVENT_DETAIL_MD = `# Mira receives a letter from her mother

## Identification
- UUID: evt_f72bc8fe0f29
- When: Late June, 1998, before sunrise
- Chapters: Chapter 7
- Summary: Mira receives a letter from her mother sealed with chapel wax

## Core Understanding
Mira receives a letter from her mother at 11:40 p.m., folded twice and sealed with chapel wax, that cryptically references 'the one who went missing by the river.'

## Causal Context
- Mira's memory of Elias standing on the chapel path with bloodied knuckles 10 years prior

## Consequences & Ripple Effects
- Triggers immediate action: Mira and Arun head to the chapel at 6:05 a.m.

## Participants & Roles
- Mira (recipient, carrier of silver key)
- Arun (discussant, present during letter analysis)

## Evidence & Grounding
- 'The letter from her mother had arrived at 11:40 p.m., folded twice, sealed with the chapel wax'

## Open Threads
- True nature of Elias's disappearance: running vs. drowning vs. Nani's unknown third possibility
`;

export const TBD_EVENT_DETAIL_MD = `# Mira and Arun find the chapel door open.

## Identification
- UUID: evt_18262658f796
- When: June 28, 1998, 7:15 a.m.
- Chapters: Chapter 8
- Summary: Mira and Arun find the chapel door open.

## Core Understanding
- TBD

## Causal Context
- TBD

## Consequences & Ripple Effects
- TBD

## Participants & Roles
- TBD

## Evidence & Grounding
- TBD

## Open Threads
- TBD
`;

/**
 * Build a complete worldModel JSON object suitable for seeding localStorage.
 * Uses the fixture data above.
 */
export function buildWorldModelFixture() {
  return {
    elements: {
      indexPreamble: ELEMENTS_INDEX_MD.split('## Entries')[0].trimEnd(),
      entries: [
        { kind: 'person', display_name: 'Mira', uuid: 'elt_45d617e4531b', aliases: 'Mira', identification_keys: 'carries the silver key; receives mother\'s letter; recalls Elias\'s disappearance; investigates with Arun' },
        { kind: 'person', display_name: 'Arun', uuid: 'elt_b973f2e09131', aliases: 'Arun', identification_keys: 'assists with greenhouse work; knows about Elias\'s disappearance; collaborates with Mira; has conflicting family history' },
        { kind: 'person', display_name: 'Elias', uuid: 'elt_9f0d7e04852f', aliases: 'Elias Vale', identification_keys: 'missing since 1988; disappeared by the river; toll house ledger reveals true relationship; central to Mira\'s family mystery' },
        { kind: 'place', display_name: 'Saint Alder Chapel', uuid: 'elt_03e8d4548117', aliases: 'chapel, Saint Alder Chapel', identification_keys: 'contains hidden compartments; location of key discoveries; linked to Nani\'s burial; site of Elias\'s disappearance' },
        { kind: 'item', display_name: 'Silver Key', uuid: 'elt_bd49df28a5e7', aliases: 'key, silver key', identification_keys: 'found under chapel floorboards; carried by Mira since 13; connected to closing secrets; linked to chapel\'s hidden compartments' },
        { kind: 'item', display_name: 'Toll House Ledger Page', uuid: 'elt_4f2c3df00e4e', aliases: 'ledger page, toll house ledger, family relationship, Mira and Elias', identification_keys: 'reveals true family relationship; contradicts family accounts; found in chapel drawer; dated 1988; uncle-niece relationship; revealed in toll house ledger; central to key\'s purpose' },
        { kind: 'person', display_name: 'Sister Celine', uuid: 'elt_858965cdeeb9', aliases: 'Sister Celine', identification_keys: 'buried Nani; vanished from records in 1988; reappears in 1998; knows about the key\'s purpose' },
        { kind: 'item', display_name: 'Cloth Bundle', uuid: 'elt_8f8a9d9a7e50', aliases: 'bundle, cloth bundle', identification_keys: 'left at chapel altar; contains physical evidence; disappears after discovery; tied with red thread' },
        { kind: 'item', display_name: 'Cracked Watch', uuid: 'elt_e2bc7b804e58', aliases: 'watch, cracked watch, stones, river stones', identification_keys: 'cracked face stopped at 2:12 a.m.; found in cloth bundle; linked to disappearance timeline; remains after other items disappear; evidence of river disappearance; three in number; linked to Elias\'s fate' },
      ],
      details: {
        elt_45d617e4531b: POPULATED_ELEMENT_DETAIL_MD,
        elt_03e8d4548117: TBD_ELEMENT_DETAIL_MD,
      },
    },
    events: {
      indexPreamble: EVENTS_INDEX_MD.split('## Entries')[0].trimEnd(),
      entries: [
        { uuid: 'evt_f72bc8fe0f29', when: 'Late June, 1998, before sunrise', chapters: 'Chapter 7', summary: 'Mira receives a letter from her mother sealed with chapel wax that mentions \'the one who went missing by the river\'' },
        { uuid: 'evt_f2e1969e1f2f', when: 'Late June, 1998, before sunrise', chapters: 'Chapter 7', summary: 'Mira and Arun discuss conflicting accounts of Elias\'s disappearance: Mira\'s mother said he ran, Arun\'s mother said he drowned, and Nani said neither' },
        { uuid: 'evt_18262658f796', when: 'June 28, 1998, 7:15 a.m.', chapters: 'Chapter 8', summary: 'Mira and Arun find the chapel door open.' },
        { uuid: 'evt_c43da1c48907', when: 'June 28, 1998, 7:15 a.m.', chapters: 'Chapter 8', summary: 'A cloth bundle with river stones, a cracked watch stopped at 2:12 a.m., and a toll house ledger page naming Elias as Mira\'s mother\'s brother is found at the altar' },
        { uuid: 'evt_312eafedfd49', when: 'June 28, 1998, 7:15 a.m.', chapters: 'Chapter 8', summary: 'Sister Celine appears and reveals the silver key closes something rather than opens it' },
        { uuid: 'evt_50b5adf351ae', when: 'Late June, 1998, before sunrise', chapters: 'Chapter 7', summary: 'Mira is carrying the silver key she found under the chapel floorboards when she was thirteen, having started carrying it again three nights ago' },
        { uuid: 'evt_d23bb1179343', when: 'June 28, 1998, 7:15 a.m.', chapters: 'Chapter 8', summary: 'A packet of letters bound in black thread dated July 3, 1988 is found in the vestry drawer' },
      ],
      details: {
        evt_f72bc8fe0f29: POPULATED_EVENT_DETAIL_MD,
        evt_18262658f796: TBD_EVENT_DETAIL_MD,
      },
    },
  };
}
