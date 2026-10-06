# Control — When The Format Is Fine And The Video Is Wrong

A prompt that validates can still render the wrong thing. Everything here is about the second
failure: the model obeyed the text, and the text did not say what was meant.

The prompt field holds about 7,000 characters, so there is room to be specific. Spend it on
what has to be right and not on adjectives.

## Give Every Reference A Job

The most common cause of a wrong render is a reference with no stated purpose. The model is
shown a photograph and has to guess whether it means the person, the clothes, the room, the
lighting or the whole composition — and it guesses differently each run.

State the job for every single one:

```text
<Picture 1> supplies the location and the light. <Picture 2> supplies the woman's identity and
face. <Picture 3> supplies the jacket only; nothing else in that frame is used.
```

Job words worth naming explicitly: identity, face, wardrobe, the product, the location, the
lighting, the film texture, the composition, the motion, the camera work, the timing, the voice,
the ambience. When two references could answer the same question, say which one wins.

A reference video is two references. Say what its picture contributes and what its audio
contributes, separately, or the model takes both wholesale.

## Lock Identity By Feature

"Use the same woman" transfers almost nothing. A list of features transfers a person:

```text
Preserve her oval face, shoulder-length copper curls, dark brown eyes, the small mole below her
left eye, her athletic build, and the forest-green jacket with brass buttons.
```

Say it once, at the character's first appearance, and afterwards refer back by the label or a
two-word tag. Repeating the whole list in every shot spends words and starts to read as a change
of subject.

Keep a character pack small and compatible: one sharp front or three-quarter view with the face
clearly visible, one second angle or full body for hair, proportions and silhouette, and at most
one detail frame for an accessory. More angles from more sessions is how a face drifts between
shots — the references disagree and the model averages them.

## Connect The Voice To The Right Character

Two separate failures live here, and they need two separate sentences.

**The wrong character speaks.** Map the voice to one speaker explicitly and keep that ID for the
whole prompt: `<Audio 1> is the voice-timbre reference for <Subject 2> (S1).` Never leave two
candidates for one voice.

**The reference's own words come out.** State that the reference supplies vocal qualities, not
content, and then give the new line: `<Audio 1> provides the timbre and delivery for (S1); the
line she speaks is the one written below.` Without that separation the model treats the source
speech as material to reproduce.

## Storyboards

A storyboard image is guidance about arrangement, not a frame to reproduce. Say which shots it
governs and what it governs about them:

```text
<Picture 4> is a storyboard reference for [Shot 1], [Shot 2] and [Shot 3]. Use it only for shot
order, camera viewpoint, subject placement and approximate framing.
```

One panel per shot works better than one sheet for the whole clip. Keep each panel achievable
inside the seconds that shot actually has.

## Say What Must Not Appear

H3 has no negative prompt, so exclusions are ordinary sentences in the description. They earn
their place when a genre or an artefact keeps creeping in, and they are named as things a viewer
would see:

```text
No subtitles, watermarks or on-screen captions. No soft dissolves, morphing or compositing seams.
```

Two or three at most, and only against something actually observed in a previous render. A long
list of negations reads as a list of nouns, and nouns get rendered.

## Budget The Clip

Five to fifteen seconds at 24 frames a second. Inside that:

- One main action and one reaction per shot. Three actions in four seconds renders as none.
- One or two camera decisions for the whole clip, not per shot.
- About three seconds a shot, so a cut roughly every three seconds and no more.
- About 2.5 words of speech a second. Ten words is a four-second shot.
- Prepare a first and last frame at the same aspect ratio as the output; mismatched ratios get
  cropped somewhere nobody chose.

A clip that feels rushed is almost always over-specified rather than under-specified. Cut an
action before cutting a description.

And the same arithmetic backwards. Five seconds is 120 frames, and a shot that describes a
STATE rather than an action gives the model 120 frames and nothing to spend them on, so it
invents the difference: a weight shift, a head tilt, a drift. That renders as slow motion.
"She holds a deliberate pose" is a state. "She turns her shoulders to the lens, lifts her chin,
and the smile arrives" is three beats, and three beats in five seconds read at ordinary speed.

Speed in H3 comes from how much HAPPENS in the time, never from a word meaning fast. The words
that slow a clip down are the ones that describe continuing rather than changing -- holds,
keeps, maintains, remains, stays, deliberate, slowly, gradually, steadily -- and `at slow speed`
on the camera, which is a choice and not a default: normal speed is what you get by writing
neither modifier.

## Symptom, Cause, Fix

| The video shows | Because | Do this |
|-|-|-|
| the character changes between shots | conflicting references, or identity given as a name | smaller character pack; name the stable features once |
| the opening frame is not the supplied image | image treated as a loose reference | use I2VA and the fixed alignment line |
| the wrong part of a reference is used | no job stated for it | say what that reference controls, and what it does not |
| motion does not match the reference video | busy source, or no named action | cleaner clip; name the exact action or camera move to transfer |
| the wrong character speaks in the reference voice | voice not bound to an ID | map the audio to one speaker ID and keep it |
| the reference's own dialogue is spoken | timbre not separated from content | state that the reference gives timbre only, then give the line |
| music appears in a clip meant to be silent | vague or empty music field | `non_diegetic_music: N/A` |
| the ambience is missing | soundscape left at `N/A` | write the room tone; `N/A` means silence |
| a sound is heard but not seen to happen | sound only in `overall_soundscape` | put the synchronised sound beside the action in the description |
| cuts land in the wrong places | timestamps invented rather than read | take every cut time from `get_timing` |
| the clip feels rushed | too many actions, cuts or words | one action, one reaction, one camera idea |
| the movement looks like slow motion | a state described where an action belongs, so the model fills the frames itself | give the action a start and an end; drop `holds`/`remains`/`slowly`, and `at slow speed` from the camera |
| the style drifts partway through | style stated once and then contradicted | establish it in the opening clause and do not restate it differently |

## Build Up In Passes

When a shot has to be right rather than merely plausible, do not solve every variable at once.
Character and scene first, with one camera move and no dialogue. Then the motion or the
reference video. Then the voice and the sound. Then the cuts, the storyboard or the second
character. Then the final render at full resolution. Each pass changes one thing, so when
something breaks it is obvious what broke it.
