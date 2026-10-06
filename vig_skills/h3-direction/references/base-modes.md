# Base Modes

Four modes share the three core fields and differ only in what anchors the timeline. Pick the
one that matches the inputs actually connected — a first frame wired in while the prompt is
written as T2VA is a rejection, and a T2VA prompt carrying an alignment line is one too.

| Mode | Anchored by | The body's job |
|-|-|-|
| T2VA | nothing | build the whole audiovisual timeline from the idea |
| I2VA | first frame | start in the picture and develop forward |
| FL2VA | first and last frame | describe the observable path between them |
| L2VA | last frame | invent a plausible opening and converge on the picture |

Every example below was validated against this repository's own checker when it was written,
so the shapes can be copied as they stand.

## T2VA

No alignment line. The prompt opens with `integrated_multimodal_description:`.

Nothing is anchored, so `[Shot 1]` has to establish style and composition before anything
moves: `[Shot 1] Live-action, cinematic, a medium-wide shot frames ...`. Detail that the idea
did not specify is yours to choose, as long as it stays consistent with the idea and stays
observable — a viewer must be able to see or hear every clause.

Validated example, 8.00 s:

```text
integrated_multimodal_description: [Shot 1] Live-action, cinematic, a medium shot frames a night-shift nurse refilling a paper cup at a corridor water cooler under flat ceiling light. The camera pushes in with small amplitude at slow speed as she turns her head toward the ward door, and the nurse with a low, tired voice (S1) says: <d>[English] Room four is asking for you.</d> [Shot 2] At 00:04.500, the camera cuts to a close-up of the cup tilting as she sets it on the counter, the water still moving inside it.

overall_soundscape: A ceiling vent hums steadily above the empty corridor while the cooler gurgles once. Rubber soles squeak on vinyl flooring and a distant monitor beeps at an even interval.

non_diegetic_music: Two sustained synthesiser notes at a slow tempo, joined by a single low piano note that fades before the last second.
```

## I2VA

Alignment line, fixed and verbatim:

```text
For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.
```

`<Picture 1>` is the actual frame at 0.00 s and belongs to `[Shot 1]`. Establish the picture's
style, subject, composition and scene anchors first, then move. Identity, clothing, colours,
key objects and spatial relationships carry through unchanged for the rest of the clip — say so
once, in the picture's own terms, rather than re-describing the subject in every shot.

Shape: first-frame anchor → action onset → continuous development → result or reaction.

Validated example, 6.00 s:

```text
For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.

integrated_multimodal_description: [Shot 1] Live-action, cinematic, the market trader shown in <Picture 1> stays behind his crate of lemons, keeping his canvas apron, the striped stall awning and the arrangement of the crate unchanged. The camera trucks left with small amplitude at slow speed as he lifts one lemon, turns it once in his fingers and holds it out toward a passing customer. His free hand steadies the crate while the trader with a hoarse, carrying voice (S1) says: <d>[English] Last three, then I close.</d> He sets the lemon back on top of the pile.

overall_soundscape: Loose canvas snaps overhead in a light wind while crates knock together further down the row. Coins clatter into a metal tin and unhurried footsteps pass on wet stone.

non_diegetic_music: N/A
```

## FL2VA

Alignment line, with `N` the index of the real final shot and `S.SS` the effective duration to
two decimals:

```text
How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot N) aligns with the S.SS-second mark of the target video.
```

Prefer one shot. Interpolation between two fixed frames is what this mode does well, and a cut
in the middle asks it to do that twice; use more than one shot only when the request names
them. Do not describe two still pictures — describe the path: how the subject moves, how poses
change, how objects are handled, how the composition and light evolve.

Shape: first-frame state → observable intermediate changes → differences narrowing →
last-frame state, reached at the end of the final shot.

Validated example, 8.00 s:

```text
How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot 1) aligns with the 8.00-second mark of the target video.

integrated_multimodal_description: [Shot 1] Live-action, cinematic, a station cleaner begins in the position and framing established by Picture 1, both hands on the handle of an upright floor polisher. The camera pulls out with small amplitude at slow speed as he leans into the handle, walks the machine forward across the wet tiles and swings it through a half-turn. The polished band widens behind him, his shoulders drop, and he settles into the stance, spacing and composition established by Picture 2 at the end of the shot.

overall_soundscape: The polisher drones at a constant pitch while water hisses under the pad. Loose keys tap against his belt and an announcement echoes twice across the empty hall.

non_diegetic_music: A single low string note at a slow tempo, thinning out over the last two seconds.
```

## L2VA

Alignment line, with `N` the index of the real final shot:

```text
How the reference pictures align with the target video — <Picture 1> (from [Shot N]) aligns with the S.SS-second mark of the target video.
```

`<Picture 1>` is the last frame and belongs to the last shot, not to the first. Infer an earlier
state that could plausibly lead there, then let the characters, objects, camera and scene
converge on the picture. The final clause of the final shot is where the landing is stated.

Shape: plausible preceding state → explicit action and transition path → convergence in the
last shot → landing on the frame.

Validated example, 6.00 s:

```text
How the reference pictures align with the target video — <Picture 1> (from [Shot 1]) aligns with the 6.00-second mark of the target video.

integrated_multimodal_description: [Shot 1] Live-action, cinematic, a close shot begins on a full mug of tea and an open notebook on the windowsill visible in <Picture 1>, with the curtain drawn back to the same width. The camera pushes in with small amplitude at slow speed as a hand enters from the left, lifts the mug and drinks twice. The steam thins and the level drops as the hand lowers the mug onto the ring it left on the sill earlier. Toward the end, the mug, the notebook, the light across the sill and the framing settle into the exact arrangement established by <Picture 1>.

overall_soundscape: Rain runs steadily down the glass above a low room tone. Ceramic scrapes once on painted wood and a page lifts and drops in the draught.

non_diegetic_music: N/A
```

## Reading MiniMax's Own Cases

The four official worked examples are in the upstream skill and are worth reading when a shape
is unclear:

```text
read_reference('h3-prompt-writing', 'base-en.txt', section='Case 1')
```

`Case 1` is T2VA, `Case 2` I2VA, `Case 3` FL2VA, `Case 4` L2VA. Section `4.4` carries the source
wording on speakers and dialogue, `4.6` and `4.7` the two sound fields.
