# Preflight — Every Rejection, And Its Repair

The checker emits the codes below and nothing else. A test in this repository keeps this list
and the checker in step, so if a code is missing here it is missing from the checker too.

`validate` returns each violation with MiniMax's own wording for the rule it breaks. Repair what
it names and leave the rest of the prompt untouched; rewriting an untouched field is how a
second violation appears in the pass meant to remove the first.

Errors block a submission. Warnings do not, but each one names something that will show up in
the render.

## Fields And Language

| Code | Trips when | Repair |
|-|-|-|
| `FIELD_MISSING` | a required field name is absent | write it verbatim with its colon, even if the value is `N/A` |
| `FIELD_ORDER` | fields appear out of order | base: description, soundscape, music. Ref2VA: definitions, summary, retention, description, soundscape, music |
| `BODY_NOT_ENGLISH` | a non-Latin letter sits outside `<d>` and quoted screen text | translate the prose; only spoken words and visible signage keep their script |

A name transliterated in one shot and left in its own alphabet in another trips this, and it is
worth reading as what it is: the same person written two ways in one prompt.

## The Alignment Line

| Code | Trips when | Repair |
|-|-|-|
| `INSTRUCTION_MISSING` | I2VA, FL2VA or L2VA has no first line | copy the fixed line for the mode from `SKILL.md` |
| `INSTRUCTION_UNEXPECTED` | T2VA or Ref2VA carries one | delete it; those modes open with their first field |
| `INSTRUCTION_MISMATCH` | the line differs from the template by any character | rebuild it from the template rather than editing the text in place |
| `INSTRUCTION_DURATION` | `S.SS` is not the effective duration to exactly two decimals | take the value from `get_timing`; `6.0` and `6.005` are both wrong for `6.00` |
| `INSTRUCTION_SPACING` *(warning)* | no blank line between the instruction and the first field | insert exactly one |

`N` in the FL2VA and L2VA lines is the index of the *actual* last shot in the description. Add a
shot and the alignment line changes with it.

## Shots And Times

| Code | Trips when | Repair |
|-|-|-|
| `SHOT_MISSING` | the description has no `[Shot N]` marker | open the description with `[Shot 1]` |
| `SHOT_FIRST_NOT_ONE` | the first marker is not `[Shot 1]` | renumber from 1 |
| `SHOT_SEQUENCE` | numbers skip or repeat | renumber 1, 2, 3 in playback order |
| `SHOT1_HAS_TIMESTAMP` | `[Shot 1]` carries a cut time | delete it; the first shot starts at zero by definition |
| `SHOT_TIMESTAMP_MISSING` | a later shot has no cut time | open it `At MM:SS.mmm,` |
| `TIMESTAMP_FORMAT` | the time is not `MM:SS.mmm` | `00:03.500`, not `3.5s`, `0:03` or `00:03:500` |
| `TIMESTAMP_NOT_INCREASING` | a cut time is not later than the one before | reorder the shots or restate the times from `get_timing` |
| `TIMESTAMP_OUT_OF_RANGE` | a cut lands at or past the end of the clip | the clip's real length comes from `get_timing`, not from the requested seconds |
| `TIMESTAMP_WITHOUT_SHOT` | a cut time appears with no `[Shot N]` in front of it | every cut opens a shot: `[Shot 2] At 00:04.000, the camera cuts to ...` |

## Camera

| Code | Trips when | Repair |
|-|-|-|
| `CAMERA_AMPLITUDE_VOCAB` | anything but `with small amplitude` / `with large amplitude` | use one of the two, or omit for medium |
| `CAMERA_SPEED_VOCAB` | anything but `at slow speed` / `at fast speed` | use one of the two, or omit for normal |
| `CAMERA_LABEL_STACKED` *(warning)* | a move appears in its label form, e.g. `Push In` | rewrite as an action: `The camera pushes in ...` |
| `CAMERA_MODIFIER_ORPHAN` | a sentence carries an amplitude or speed but names no motion type | `moves in`, `moves`, `glides` are not motions; use one of the twenty verbs, or drop the modifier |

## Speech

| Code | Trips when | Repair |
|-|-|-|
| `DIALOGUE_TAGS_UNBALANCED` | `<d>` and `</d>` counts differ | close every block |
| `DIALOGUE_LANGUAGE_TAG` | a `<d>` block does not open with `[Language]` | `<d>[English] ...</d>` |
| `DIALOGUE_ID_INSIDE` | a speaker ID sits inside `<d>` | move `(S1)` outside, before the verb |
| `DIALOGUE_WRAPPED_IN_QUOTES` | the spoken words are in double quotes | remove them; quotes mark text visible on screen |
| `DIALOGUE_TEXT_ALTERED` | a supplied line is translated, re-punctuated, merged or split | restore it character for character as the whole content of one block |
| `VOICEOVER_LIPS_MISSING` | a voiceover block is not followed by the closed-lips statement | add `while his lips remain completely closed` right after `</d>` |
| `DIALOGUE_LANGUAGE_UNKNOWN` *(warning)* | the language name is not one of the recognised spellings | check the spelling, or ignore it if the language is right |
| `SPEAKER_ID_SEQUENCE` *(warning)* | IDs do not run S1..Sn by first vocal event | renumber by who speaks first |

## Sound

| Code | Trips when | Repair |
|-|-|-|
| `SOUNDSCAPE_LENGTH` | `overall_soundscape` is not 1–4 sentences | trim or extend; `N/A` counts as zero and is allowed |
| `SOUNDSCAPE_HAS_DIALOGUE` | a `<d>` block appears in the soundscape | move it to the description |
| `SOUNDSCAPE_REPEATS_MUSIC` | a sentence of the score is copied into the soundscape | the score lives in `non_diegetic_music` only; the soundscape carries ambience and action sounds |
| `MUSIC_LENGTH` | `non_diegetic_music` is not 1–3 sentences | trim, or write `N/A` |
| `MUSIC_HAS_DIALOGUE` | lyrics appear in the music field | lyrics are sung dialogue and go in the description inside `<d>` |
| `MUSIC_ABSTRACT_MOOD` | a mood word or a claim about emotional effect | name instrumentation, tempo, rhythm and dynamics instead |

## References And Ref2VA

| Code | Trips when | Repair |
|-|-|-|
| `LABEL_OUT_OF_RANGE` | a label number exceeds what is connected | use the numbers `get_refs` returned |
| `SUMMARY_PREFIX_MISSING` | `summary` has no `[task type]` prefix | add it as the first thing in the field |
| `SUMMARY_TASK_TYPE` | the prefix names something outside the six task types | see `ref2va.md` |
| `SUMMARY_TASK_TYPE_REPEATED` | a task type appears twice in the prefix | combine distinct types with ` + ` |
| `SUMMARY_NEW_LABEL` | a label first appears in `summary` | define it in `subject_definitions` first |
| `RETENTION_NEW_LABEL` | a label first appears in `retention_analysis` | same |
| `RETENTION_HAS_SPEAKER_ID` | `(Sx)` appears in `retention_analysis` | speaker IDs live in the definitions and the description |
| `RETENTION_MARKER_INVALID` | an entry has no valid marker for its kind | visual entries take the four visual markers, audio entries the four audio ones |
| `REF_STYLE_OPENING_MISSING` | `detailed_description` starts straight at `[Shot 1]` | one or two English sentences of style first |
| `REF_LABEL_UNDEFINED` *(warning)* | a connected reference is never defined | define it, or accept that it is unused |
| `REF_DESCRIPTION_SHORT` *(warning)* | under 350 words | add observable detail to the existing shots, not more shots |
| `REF_DESCRIPTION_LONG` *(warning)* | over 500 words | cut the repeated feature lists first |

## When `submit` Hands It Back

`submit` re-checks the prompt and refuses a broken one three times before taking it as it
stands and reporting the run as breaking the format. Each refusal costs a turn, so change
something every time: resubmitting the same text spends an attempt for nothing.
