# Ref2VA — Full-Reference Mode

Six fields instead of three, no alignment line, and one governing idea: every reference gets a
label, a definition, and a stated degree of retention before it is used in a shot. A label used
in a shot but never defined, or introduced for the first time in `summary`, is a rejection.

Order, verbatim, one blank line apart:

```text
subject_definitions:
...

summary:
[task type] ...

retention_analysis:
...

detailed_description:
...

overall_soundscape:
...

non_diegetic_music:
...
```

Connected inputs cap at nine images, three videos, three video soundtracks and three standalone
audio tracks. `get_refs` reports what is actually wired and with which numbers; those numbers
come from the tokenizer's presentation order, not from the order the node inputs were connected,
so they are read and never guessed.

## subject_definitions

Four label kinds. `<Picture N>`, `<Video N>` and `<Audio N>` name the uploaded files themselves;
`<Subject N>` names a reusable thing taken from them — a person, an object, a location, a look —
and is what the shots should mostly cite.

```text
<Subject 1> is the coffee-shop interior in <Picture 1>, with an exposed brick wall, an orange tufted sofa and a wooden table.
<Subject 2> is the young blonde woman in <Video 1>, with long blonde hair and a light-pink button-down shirt.
<Audio 1> is the voice-timbre reference for <Subject 2>, containing a spoken English vocal layer.
```

Define a subject once, in the detail that has to survive: face shape, hair, build, the specific
garment, the specific object. When a reference video supplies both picture and sound, define the
visual track and the audio track separately — they are two references doing two jobs. If the
speaker maps to a defined subject, write the ID beside it in the definition as `<Subject 2>
(S1)`; otherwise give a stable voice description followed by the ID.

### A subject drawn from a picture is named, not painted

The director's rule (23 Oct 2026): in ref2va the picture describes the subject, so its
definition says WHAT it is and nothing more --

```text
<Subject 1> is the rally car, taken from <Picture 1>.
```

-- never its colours, livery, markings, materials, clothing or hair, and neither does
`detailed_description`. Words about the looks compete with the picture and win: a white
Martini-liveried Lancia defined "painted in bright red and white" was rendered red and
white, and rendered right the moment the colour was taken out. The console cuts such a
definition back after the pass in any case. Describe what the subject DOES.

**Unless the script names the colour itself.** Then it is the director's own word, not a
guess: write exactly those colours, in the definition and in `detailed_description`, and
no others. "Автомобиль раскрашен в желто-голубые цвета" gives

```text
<Subject 1> is the rally car in yellow and light blue, taken from <Picture 1>.
```

and the console keeps the colours the script names when it cuts the definition back.

## summary

Opens with a square-bracketed task type, then two or three sentences on what the target video is
and which reference does what. Only the six task types are accepted, joined by ` + ` and never
repeated:

`keyframe completion`, `reference generation`, `video editing`, `video continuation`,
`audio reuse`, `audio reference`.

```text
[reference generation + audio reference] The target video shows <Subject 2> in <Subject 1>, using <Audio 1> as the voice-timbre reference.
```

A video edit opens its description with the fixed sentence `The target video is an edited
version of <Video 1>.`

No label may make its first appearance here.

## retention_analysis

One line per reference that has its own line in `subject_definitions`, saying where it appears and how
much of it survives. A picture cited only as the source of a subject ("<Subject 1> is the plane in
<Picture 1>") has no line of its own in either field -- the subject carries its retention. Visual entries use
`fully_preserved`, `partially_preserved`, `attribute_transfer` or `weak_reference`; audio
entries use `fully_copy`, `partially_copy`, `reference` or `weak_reference`. A line without one
of its kind's markers is a rejection, and so is a speaker ID anywhere in this field.

```text
<Subject 1> (appears in [Shot 1], [Shot 2]): fully_preserved - the brick wall, orange sofa and wooden table are retained.
<Audio 1>: reference - its timbre guides the delivery without copying the original signal.
```

Choose the marker deliberately. `fully_preserved` on a busy photograph drags its background into
the shot; `attribute_transfer` is the marker for "take the material, not the object".

## detailed_description

The body, and the one field with a length target: **350–500 words** for a generation task.
Shorter and the model fills the gaps itself; longer and the later shots start being dropped.

The guide qualifies that number twice, and both halves matter more than the count:
*"Dialogue-dense content prioritizes fitting the complete spoken timeline rather than
mechanically reaching a word count"*, and video-editing descriptions do not follow the
generation range at all. So when the clip has speech, the words and their timing come first
and the length falls where it falls. Reaching the number by restating the same pose, the same
lighting and the same gesture in new words is padding: it costs the shots that come after it
their detail, and the model renders the repetition as a held, motionless clip. Every sentence
carries something the reader did not already know.

It opens with one or two English sentences of style before `[Shot 1]` — that opening is
mandatory here, unlike the base modes where style rides inside Shot 1:

```text
The target video uses a realistic multi-camera sitcom style with warm indoor lighting.
[Shot 1] A medium shot establishes <Subject 1> ...
```

Then shots in playback order, same rules as the base modes: `[Shot 1]` without a timestamp,
later shots opening `At MM:SS.mmm,`. Cite labels by their exact tag at the moment the referenced
content appears, and pair each first citation with the few features that must carry: `<Subject
2> (S1), the young woman with long blonde hair and a light-pink button-down shirt, sits ...`.
Re-citing the label in later shots is enough; the full description is not repeated.

### When a video reference carries the camera

The description still names the camera move -- every shot states its camera -- but when a
`<Video N>` sets the camera path (a blocking from the console's 3D editor, a reference shot),
the move is written by its TYPE and handed to the reference for everything else (the director's
rule, 22 Oct 2026):

```text
The camera arcs around the climbing plane, its path, height and pacing following the camera
movement of <Video 1>: it swings from the front of the wings to the far side, tilting up as
the plane rises above it.
```

- No `with small/large amplitude` and no `at slow/fast speed` of your own: the reference
  holds them, and a number in the text that disagrees with the video is two instructions.
- Describe what the move REVEALS (the wings turning edge-on, the cloud dropping out of frame),
  never a different move.
- One continuous move in the reference is one shot in the text: a cut in the description
  would cut the reference's camera path in two.
- A blocking from the 3D editor is NEVER a `<Subject N>`: its grey shapes are stand-ins, and
  a subject "carried over from <Video 1>" orders H3 to put them in the film. It gets one line
  of its own in `subject_definitions` -- "<Video 1> is a grey 3D blocking of the shot: the
  target video follows its camera movement, its framing and the path and timing of its
  stand-in shapes, and never shows its grey shapes, floor or flat light." -- and a
  `partially_preserved` line in `retention_analysis` (its camera path and motion are kept
  closely, its look not at all). The console writes both itself after the pass.

## The Two Sound Fields

Identical to the base modes — 1–4 sentences of ambience for `overall_soundscape`, 1–3 sentences
of instrumentation for `non_diegetic_music`, `N/A` where either genuinely does not apply. See
`camera-and-sound.md`.

## The Official Worked Example

MiniMax's complete Ref2VA example — five references, three shots, two speakers, an audio timbre
reference — is one read away and validates clean against this repository's checker:

```text
read_reference('h3-prompt-writing', 'ref-en.txt', section='7. Complete Example')
```

Section `2` of that file covers label definitions, `3` the summary prefix, `4` the retention
markers, and `5.4` speakers and audio sources.
