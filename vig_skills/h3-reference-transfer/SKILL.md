---
name: h3-reference-transfer
description: Compose ONE reference picture out of several — an identity from one photograph and named details (a hairstyle, a beard, a jacket) from another — and re-shoot that identity from a named angle. Use whenever the appearance editor writes a Ref2VA prompt for a still portrait rather than for a clip. Carries the measured practices that stop the donor being cast instead of the subject.
compatibility: Local files only. Written for the console's own writing model, which is shown the pictures and answers in JSON; the prompt's SHAPE is assembled by `vig/cutter/refwrite.py` and is not the model's to improvise.
---

# Transferring a detail between references

H3's subject references preserve WHOLE subjects. Hand it a photograph of a man with
dreadlocks because you want the dreadlocks, and it will render that man — measured on the
director's own material, 13 Sep 2026: with the donor's face in the set the model first put
two people on screen, and then, once told there was exactly one, cast the DONOR and dropped
the identity. The sharpest face in the set wins; a textual "does not appear" does not beat
conditioning.

So a transfer is two things, and both are needed:

1. **The picture is cut down to the detail.** Whatever the director ticked is kept; the rest
   of the frame — the donor's face above all — goes to a flat neutral field. A rectangle
   cannot do it: the hair's own bounding box contains the face it grows on.
2. **The prompt SAYS the transfer**, in the format's own attribute vocabulary, so that the
   remaining conditioning is read as an attribute rather than as a person.

## What the writer is asked

Two jobs, and they are separate calls. Neither of them writes the prompt: the shapes below
are assembled by the program, from what you answer.

### Naming the parts

A segmentation model has already cut the donor into parts. You are shown several of them,
each on a flat grey field, and you say what each one IS — the thing itself, not the person
it belongs to and not the grey. Two to four words: `dreadlock ponytail`, `short beard`,
`flamingo-patterned shirt`, `stone wall`. Never a sentence. One answer per picture, in the
order given.

A name is what the prompt will call the attribute, in every one of its five sentences, so
it has to read as a thing a person can have: "dreadlock ponytail" is usable, "man's profile
silhouette" is not.

### Looking before writing

You are shown the MAIN picture — the person this reference is of — and, when there is one,
the donor picture holding only the ticked parts. You answer:

* `subject`: one English noun phrase for the person in the FIRST picture — approximate age,
  build, hair, clothing and its colour. `a man in his thirties with short brown hair, in a
  white t-shirt`. Not a sentence, no full stop, no proper name: the picture does not say one.
* `parts`: for each named part, a short phrase for what it LOOKS like in the second picture.
  `long brown dreadlocks tied back`. Two to eight words.

What a photograph settles is not something to invent from a file name. The same rule the
clip writer follows for an opening frame (11 Sep 2026) holds here: describe what is there,
and assign nothing the camera did not show.

## The shape that gets assembled

Ref2VA takes six fields and no alignment line. The program writes them; this is what your
answers become, so that you can see why the phrasing above matters.

```text
subject_definitions:
<Subject 1> is <subject>, the man in <Picture 1> and no other person, whose face and identity
come from <Picture 1> and whose <part> comes from <Picture 2>. His face is the face in
<Picture 1> and no other; the face in <Picture 2> is never used.
<Picture 2> provides only the <part> -- <phrase>; the person in it does not appear.

summary:
[reference generation] A single still portrait of <Subject 1>, generated from the reference
pictures. The person in frame is the man from <Picture 1>. Exactly one person is in frame.

retention_analysis:
<Subject 1> (appears in [Shot 1]): partially_preserved - ...
<Picture 1> (identity source): partially_preserved - ...
<Picture 2> (<part> source): attribute_transfer - only the <part> is transferred onto
<Subject 1>; nothing else of the picture appears.

detailed_description:
<style>, <framing><, angle>. [Shot 1] A single portrait: exactly one person on screen,
<Subject 1> -- the man from <Picture 1> -- <pose>, standing still against a plain neutral
background. His <part> comes from <Picture 2> exactly. The camera holds a static shot.

overall_soundscape:
Quiet room tone.

non_diegetic_music:
none
```

## Why each of those sentences is there

* **The combined-source subject** — "whose face and identity come from `<Picture 1>` and
  whose hairstyle comes from `<Picture 2>`" — is the guide's own construction for exactly
  this case (`ref-en.txt`, 2.1). It is what makes one subject out of two pictures.
* **`attribute_transfer`** is the retention type for "this trait, not this person". Every
  donor picture gets one. Without it the donor reads as a second subject to preserve.
* **The donor's person is excluded three times** — in the definition, in the retention line
  and in the prose. The first live run excluded it once and lost.
* **The count is positive.** "Exactly one person is in frame", never "no second person":
  reference conditioning obeys a count far better than a negation.
* **The face is bound twice** — by citation (`the man in <Picture 1> and no other person`)
  and by an exclusive sentence (`His face is the face in <Picture 1> and no other`).
* **The look is deliberately flat** — soft even light, a plain ground, a static camera. A
  reference picture is a document, not a shot: what changes between two takes should be the
  person, never the lighting.

## Angles

The same machinery re-shoots an identity from a named viewpoint, with no donor at all —
профиль, анфас, в полный рост, по пояс, вид сверху, вид снизу. The angle is COMPOSITION and
belongs in the style clause; what the subject does about it is the pose, and belongs in the
shot. The four that are viewpoints use the same wording the clip writer pins a shot with
(`seen from the side, in profile`, `seen from above`, `seen from below, from a low angle`,
`seen from the front, head-on`) — one spelling per angle in this codebase, or the rule drifts.

A view is not a camera move. H3's camera vocabulary is a closed set of motion, amplitude and
speed; a portrait's camera holds a static shot and the angle is said in the composition.
