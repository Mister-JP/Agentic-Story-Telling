# Events

Purpose:
This file is the canonical index of meaningful story events.

Definitions:
- Event:
  A bounded, world-relevant unit of change. An event is something that happens, is discovered, is decided, or is revealed in a way that meaningfully changes the story world, a character's knowledge, a relationship, a goal, a risk, or the consequences that follow. It is not merely a scene fragment or a sentence-level action. It should be stable enough to remain the same event even if later chapters refine its timing, participants, cause, or full meaning.

- UUID:
  A stable canonical identifier for the event. Its purpose is identity, not meaning. It allows the system to refer to the same event reliably across the index, the detailed event file, later updates, and agent workflows, even if the event's wording, timing, or interpretation evolves. UUIDs are generated programmatically and treated as the permanent handle for each event.

- When:
  The best currently known placement of the event in story time. Its purpose is to situate the event chronologically without forcing false precision. It may be exact, approximate, relative, inferred, or unknown, depending on what the manuscript currently supports. This field should remain open to later refinement as future chapters reveal stronger temporal grounding. It captures story-time placement, not document-edit time.

- Chapters:
  The manuscript locations where the event is evidenced, introduced, developed, or clarified. Its purpose is grounding and traceability. It tells the system and the reader where this event comes from in the text. It is an internal reference to the relevant chapter or chunk, not part of the event's meaning itself. Multiple chapters may be listed when an event is introduced in one place and clarified or extended later.

- Summary:
  A short canonical description of what the event is. Its purpose is to make the event legible at index level without retelling the full scene. It should describe the core happening in clear, neutral, world-level language, focusing on what changed or what became known. It should not drift into interpretation, prose style, emotional commentary, or speculation beyond what the manuscript supports.

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
