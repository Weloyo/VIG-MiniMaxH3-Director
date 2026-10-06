# Camera, Speech And Sound

The vocabularies below are closed sets. Wording outside them is either rejected outright
(amplitude, speed, retention markers) or silently rendered as something else.

## The Twenty Camera Moves

| Move | What moves |
|-|-|
| `Zoom In` / `Zoom Out` | focal length changes, the body stays put |
| `Push In` / `Pull Out` | the camera moves forward / backward |
| `Pan Left` / `Pan Right` | the body stays put, the lens pivots horizontally |
| `Tilt Up` / `Tilt Down` | the body stays put, the lens pivots vertically |
| `Truck Left` / `Truck Right` | the camera translates sideways |
| `Pedestal Up` / `Pedestal Down` | the whole camera rises / drops |
| `Arc Shot` | the camera travels an arc around the subject |
| `Tracking Shot` | the camera follows a moving subject |
| `Static Shot` | position and lens both still |
| `Shake Slightly` / `Shake Strongly` | camera shake |
| `POV` | the subject's own point of view |
| `Roll Clockwise` / `Roll Counterclockwise` | the camera rolls about the lens axis |

## Writing A Move

Three dimensions: motion type, amplitude, speed. The type is mandatory; amplitude and speed are
added only when they carry meaning, because medium amplitude and normal speed are the default
and saying so wastes words the model reads as emphasis.

Written as an action in the sentence, in the natural verb form:

```text
The camera pushes in with small amplitude at slow speed toward the folded letter in her hands.
The camera pans right with large amplitude at fast speed, revealing the open doorway.
The camera holds a static shot as the runner leaves the frame.
```

The verb forms: zooms in, zooms out, pushes in, pulls out, pans left, pans right, trucks left,
trucks right, tilts up, tilts down, pedestals up, pedestals down, arcs around, tracks, holds a
static shot, shakes slightly, shakes strongly, takes the subject's point of view, rolls
clockwise, rolls counterclockwise.

`Static Shot` and `POV` take no amplitude and no speed: they are not motions, and "a static shot
with large amplitude at fast speed" is a contradiction the model resolves by guessing.

## One Camera Per Shot

A shot describes exactly one camera behaviour. When you are given a camera to use — a director's
pin, or a rewrite of a prompt that already has camera prose in it — that move **replaces** what is
there. Delete the old motion, amplitude and speed wording wherever it appears in the shot and
write the action around the new move, so the shot reads as one description.

Never stack the new sentence on top of the old one:

```text
WRONG:  The camera shakes slightly, static shot of a man rapping, with large amplitude at fast speed.
RIGHT:  The camera shakes slightly as the man raps into the microphone, the handheld frame
        pulsing with the beat.
```

The wrong line was produced by a real rebuild (3 Sep 2026): the camera was changed from static to
`Shake Slightly` and the writer added the new clause without removing the old one, leaving a shot
that is static and shaking at once, carrying amplitude and speed words that the previous move had
and the new one does not take at all. A shot with two camera descriptions renders as neither.

Four rules that cause most camera rejections:

- The words are exactly `with small amplitude`, `with large amplitude`, `at slow speed`, `at
  fast speed`. `with medium amplitude`, `at moderate speed`, `at normal speed` and `slowly` in
  the modifier slot are all rejected.
- `Static Shot` and `POV` take neither modifier: a static shot with an amplitude contradicts
  itself, and a point of view is a vantage rather than a move.
- An amplitude or a speed has to modify one of the twenty motions, in the same sentence. `The
  camera moves in with small amplitude at slow speed` is rejected: `moves in` is not a motion
  H3 has, and the near-miss renders as something the shot list never asked for. `pushes in` is.
- Never leave the move as a label — `..., push in, slow` or a trailing `Push In with small
  amplitude` — and never stack two moves in one shot. One camera idea per shot; a push and an
  arc in the same three seconds is how a shot comes back as a smear.

## Cuts And Transitions

Five phrases, and nothing else unless the request explicitly asks for a `cross-dissolve`, a
`fade` or a `wipe`:

`the camera cuts to`, `the shot cuts to`, `the shot transitions to`, `the shot changes to`,
`the shot switches to`.

A cut earns its place by bringing new information about subject, space, state, viewpoint or
time. A slightly different distance or angle is camera motion, not a cut, and writing it as one
buys a jump the model has to invent continuity across.

## Speakers In Detail

An ID is given to anyone who speaks, sings or produces an off-screen human voice, in order of
first vocal event, and it stays with them for the whole prompt. Two voices at once take a
compound ID, `(S1,S2)`. Characters who never vocalise get none at all.

At a speaker's first appearance, establish the voice as well as the person: type, age, whether
they are on screen, pitch, timbre, rate, accent. That description is what the model matches on
later, so `the young woman with a quiet, breathy voice (S1)` is worth its length and `the woman
(S1)` is not.

```text
The young woman with a quiet, breathy voice (S1) says: <d>[English] I get off at the next station.</d>
The two children (S1,S2) shout together, <d>[English] Wait for us!</d>
The man (S1) says in an off-screen voiceover: <d>[English] I still remember that road.</d> while his lips remain completely closed.
```

Inside `<d>` go the language tag and the words. The ID, the delivery, the action and the
closed-lips statement all go outside. The language name is free text — `English`, `Chinese`,
`Spanish`, `French`, `German`, `Japanese`, `Korean`, `Arabic`, `Portuguese`, `Italian` and
`Russian` are recognised spellings, and anything else raises a warning rather than a rejection.

Roughly 2.5 words a second of speech. A four-second shot holds about ten words; a line that
does not fit is either cut short in the render or rushed.

## Continuity Across A Cut

When one line of dialogue or lyric spans a cut, put `<scenetrans>` at the joining point in both
halves and say the audio continues. The four continuity phrasings are `continues seamlessly
across the cut`, `continues uninterrupted into the next shot`, `carries over from the previous
shot`, `remains audible across the transition`. Use `<cutoff>` when the clip ends mid-word.

## overall_soundscape

One paragraph, 1–4 English sentences, covering the whole clip: ambience and room tone, the
sounds physical actions make, and non-verbal human sounds — wind, rain, traffic, footsteps,
fabric, impacts, breathing, laughter, panting.

What must not be here: dialogue, singing, and any music a character can hear. Those are events
on the timeline and belong in the description. A `<d>` tag in this field is a rejection.

`N/A` means the video is silent apart from speech and score. Use it only when silence was
actually requested — an empty soundscape on an ordinary scene throws away the ambience the
model would otherwise have laid under everything.

Synchronised sound is different again: the click of a cup on a saucer belongs in the
description, in the same sentence as the hand that puts it down, because that is what ties the
sound to the frame it happens on.

## non_diegetic_music

One to three English sentences on score the characters cannot hear. Instrumentation, tempo,
rhythm, and how the dynamics change — `Sparse piano notes at a slow tempo, joined by sustained
low strings that gradually increase in volume before fading out.`

Rejected on sight: `melancholic`, `melancholy`, `nostalgic`, `nostalgia`, `uplifting`,
`haunting`, `emotional`, `poignant`, `bittersweet`, `hopeful`, `ominous`, `triumphant`,
`wistful`, `somber`, `eerie`, `dreamy`, `epic`, `romantic`, `tense`, `suspenseful`, `joyful`,
`sorrowful`, `evokes`, `evoking`, `conveys`, `underscores the emotion`, `reinforces the mood`,
`creates a sense of`, `sets the mood`. Name what plays instead; the feeling follows from it.

`N/A` when there is no score — and say `N/A` rather than leaving the field vague, because a
vague music field is the usual reason music turns up in a clip that was meant to have none.
