# Elements

Purpose:
This file is the canonical index of stable, story-relevant elements in the world model.

Definitions:
- Element:
  A stable, story-relevant unit of the world model. An element is any distinct thing the story can meaningfully refer to, track, or reason about across time: a person, place, item, relationship, group, concept, rule, institution, creature, or other persistent entity. An element is not just any word that appears in the prose. It should be something with enough identity and continuity that the system benefits from treating it as a canonical object in the world.

- Kind:
  The broad category of what the element is. Its purpose is to place the element into the right conceptual bucket so the system can reason about it appropriately. Kind should be chosen at the level that is useful and stable, such as person, place, item, animal, relationship, concept, group, or other. It is a typing aid, not a full explanation of the element.

- Display Name:
  The canonical surface name used to represent the element in the index. Its purpose is readability and consistency. It is the main human-facing name by which the element is referred to in the world model. It should be the clearest stable name for the element, even if the manuscript sometimes refers to it in other ways.

- UUID:
  A stable canonical identifier for the element. Its purpose is identity, not meaning. It allows the system to refer to the same element reliably across the index, the detailed element file, future updates, and agent workflows, even if the display name, aliases, or understanding of the element evolves. UUIDs are generated programmatically and treated as the permanent handle for that element.

- Aliases:
  Alternative names, labels, titles, spellings, or surface references that may refer to the same element. Their purpose is recognition and matching. They help the system understand that multiple phrasings in the manuscript may point to one canonical element. Aliases should capture meaningful alternate references, not every descriptive phrase the prose happens to use.

- Identification Keys:
  Short recognition cues that help distinguish this element from others. Their purpose is practical identification, especially when names are ambiguous, absent, evolving, or reused. These should be compact, concrete signals grounded in the manuscript, such as roles, relationships, defining objects, repeated traits, or highly specific associations. They are not meant to be full descriptions or interpretations. They are quick anchors that help the system recognize who or what this element is.

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
