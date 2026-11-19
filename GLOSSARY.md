# Metronome

A practice metronome for jazz musicians: a click, a band that plays a tune's changes, practice modes, and a coach that listens to you play.

## Language

**Setup**:
Everything the player has chosen: meter, tempo, accents, the tune, the band's sounds and styles, practice modes and the mix. It is what a share link carries and what the page saves.
_Avoid_: state, settings, config

**Edit**:
One choice on the page, as a change from one setup to the next, together with the rules that tie settings to each other (a new meter resets the accents; a groove plays only in its own meter).
_Avoid_: action, update, mutation

**Band style**:
One choice that sets the meter, tempo, groove, bass and keys together, like a style in iReal Pro. The tune stays.
_Avoid_: preset (that word is taken by chord progressions)

**Drill**:
A short exercise the coach suggests after a take, given as a few settings laid over the current setup.
_Avoid_: exercise, patch
