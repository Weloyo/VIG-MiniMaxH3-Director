---
name: h3-direction
description: Direct one MiniMax H3 generation end to end — pick the mode, give every reference a job, and write a prompt that passes the format check on the first attempt. Use whenever an H3 prompt is being written, repaired or revised, in any of T2VA, I2VA, FL2VA, L2VA and Ref2VA. Carries the complete rule set the checker enforces, the camera and sound vocabularies, and the fixes for a video that came out wrong.
compatibility: Local files only — no API calls, no MiniMax Hub tools, no proprietary runtime. Written for an agent holding read_skill, read_reference, get_timing, get_refs, validate and submit, and readable by hand without any of them.
---

# H3 Direction

H3 renders one prompt in one pass: what is not written is invented, what is written loosely is
rendered loosely. A **rejection** is `validate` refusing a broken format, and the rules below
are the complete set it enforces. **Drift** is a prompt accepted and the wrong video — that one
is cured in `control.md`.

## Procedure

1. Read this document and `references/density.md`. For Ref2VA read `references/ref2va.md`
   too, before writing anything.
2. Call `get_timing` and `get_refs`. The duration snaps to a frame grid and the reference
   numbers come from the tokenizer — neither is yours to work out, and a guess is a rejection.
3. Plan before prose: one line a shot — its framing and its one camera move, the subject, the
   chain of beats (action, what it causes, the reaction), the sound each beat makes, and how the
   last shot ends. Speech runs about 2.5 words a second; check each line fits its shot.
4. Write the prompt in full, field names verbatim, in the order given below.
5. Run the eight preflight checks over your own text.
6. Call `validate`. Fix exactly what it names; leave what it did not name alone.
7. Call `submit`.

## The Shape

```text
<alignment line, absent for T2VA>

integrated_multimodal_description: [Shot 1] <style>, <composition>, <subject, action, camera, speech, sound> [Shot 2] At MM:SS.mmm, <cut phrase> ...

overall_soundscape: ...

non_diegetic_music: ...
```

Ref2VA takes six fields and no alignment line: `subject_definitions`, `summary`,
`retention_analysis`, `detailed_description`, `overall_soundscape`, `non_diegetic_music`.

`<style>` is the whole look, said once: the style and what makes it this style — palette (as
colours against each other), light, texture or medium. Later shots inherit it and never
restate it. A subject defined in one shot is pointed back to in the next — "the man from Shot
1" — with only what has changed; a second description is a second person.

Field names go in lower case, in that order, one blank line apart. The body is English: only
words inside `<d>` and text in double quotes keep their original language, and one non-Latin
letter elsewhere is a rejection.

## The Alignment Line

First line, then a blank line. `S.SS` is the effective duration from `get_timing` to two
decimals; `N` is the last shot's index.

- **T2VA, Ref2VA** — none; the prompt opens with its first field.
- **I2VA** — `For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.`
- **FL2VA** — `How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot N) aligns with the S.SS-second mark of the target video.`
- **L2VA** — `How the reference pictures align with the target video — <Picture 1> (from [Shot N]) aligns with the S.SS-second mark of the target video.`

## Shots And Cut Times

`[Shot 1]` opens the description and carries no timestamp. Later shots open with their cut time
— `[Shot 2] At 00:03.500, the camera cuts to ...` — in `MM:SS.mmm`, strictly increasing, all
inside the duration; numbers run 1, 2, 3 with no gaps.

A cut must bring new information about subject, space, state, viewpoint or time; if only the
distance or angle changes, move the camera instead. About three seconds a shot for drama and
dialogue; a promo, a music video or an action piece may cut every 0.6–1.5 s, when every cut
brings a new beat. The cut phrase is followed at once by the new shot's framing and move —
`the camera cuts to a medium shot from a slightly elevated low angle`.

## Camera

Write the move as an action inside the sentence, never a label stacked on the end — `The
camera pushes in with small amplitude at slow speed toward the letter in her hands.`

Amplitude is `with small amplitude` or `with large amplitude`, speed `at slow speed` or `at
fast speed`; no other wording is accepted, and both are omitted for medium and normal. `Static
Shot` and `POV` take neither. One camera idea per shot, and say what it is for — `tracking his rotation`,
`keeping a constant distance just ahead of his boots`. The twenty moves and the five cut
phrases are in `camera-and-sound.md`.

## Speech

`<d>[English] Last three, then I close.</d>` — inside the tag the language tag and the spoken
words, nothing else; outside it who speaks, their ID, and how they deliver it. The language
tag names the language in English (`[English]`, `[Russian]`, `[Chinese]`) whatever language
the words themselves are in.

IDs are `(S1)`, `(S2)`, assigned in order of first vocal event and stable throughout; two
voices at once are `(S1,S2)`; a character who never vocalises gets none. Supplied lines carry
over character for character — no translation, repunctuation, merging or quotation marks.

Voiceover uses the exact phrase `says in an off-screen voiceover`, and immediately after the
closing `</d>` states that the character's lips remain completely closed.

Text visible on screen goes in double quotes, in its own language: `a sign reading "营业中"`.

## Sound

`overall_soundscape` is 1–4 sentences of ambience, physical action sounds and non-verbal human
sounds across the clip, in time order: the continuous bed first, then the foreground events as
the picture makes them, each with a timbre and a place, then how the sound ends. No `<d>`, dialogue, singing or diegetic music — those belong in the
description. `N/A` only when silence was asked for.

`non_diegetic_music` is 1–3 sentences on genre, instrumentation, tempo (a BPM where there is
one), rhythm and dynamics — and, where it matters, hits landing on the cuts and how it ends. Mood
words (`melancholic`, `tense`, `epic`) and any account of what the score does to the viewer
(`evokes`, `sets the mood`) are flagged -- a warning, since MiniMax's own templates slip one in,
but every one is a word that does not play. `N/A` when there is no score. Music a character can
hear is diegetic and goes in the description instead.

## Preflight

1. Field names exact, in order, one blank line apart.
2. Alignment line right for the mode, `S.SS` equal to `get_timing`, blank line after it.
3. `[Shot 1]` has no time; every later shot has one; times increase and all fall inside the clip.
4. Every amplitude and speed phrase is one of the four allowed, and attached to a move.
5. Every `<d>` closes, opens with a language tag, holds no ID and no quotation marks; every
   supplied line appears once, verbatim.
6. Every voiceover is followed by the closed-lips statement.
7. Soundscape 1–4 sentences (a fifth is a warning, not a rejection), music 1–3 or `N/A`, no
   mood word in the music.
8. No non-English letters outside `<d>` and quoted text; every cited label came from
   `get_refs`, with its number, and was given a job.

## Where The Detail Is

- `density.md` — what MiniMax's own template prompts carry: the look, materials, physics,
  light, on-screen text as a designed layer, the final beat, sound in picture order.
- `base-modes.md` — keyframe handling and a worked example per mode.
- `ref2va.md` — the six full-reference fields, task types, retention markers, budget.
- `camera-and-sound.md` — camera table, cut and continuity phrasing, sound detail.
- `control.md` — giving each reference a job, identity lock, voice mapping, symptom → fix.
- `preflight.md` — every rejection code, what trips it, the repair.

MiniMax's own wording is the `h3-prompt-writing` skill, reachable a section at a time:
`read_reference('h3-prompt-writing', 'base-en.txt', section='4.4')`.
