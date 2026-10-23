# What A Rich Prompt Carries

Taken from MiniMax's own prompts in ComfyUI's official H3 templates (October 2026): FastH3 8-step
text-to-video, H3 Max Turbo, H3 Max image-to-video and reference-to-video. They are long -- 340
to 980 words of description for two to eight seconds -- and none of the length is padding.
Every sentence is something the viewer will check the frame against. What is not written is
invented, so the habits below are ways of leaving the model less to invent.

Their prompts break our format in places (`at a medium speed`, which is not one of the four
modifier phrases; a five-sentence soundscape, which is only a warning here). Take the density from them, never the wording: the rules in `SKILL.md` and
`camera-and-sound.md` still decide what is accepted.

## The Opening Carries The Look

`[Shot 1]` opens with the whole look, once: the style, then what makes it THIS style --
palette, light, texture or medium. "Cinematic" alone is a word; this is a picture:

```text
[Shot 1] Cinematic, low-angle wide shot, set in a rainy night mountain city characterized by
wet stone slopes and red-orange neon signage against cold cyan rain curtains.
```

The palette is named as colours AGAINST each other (red-orange against cold cyan), because a
contrast is what the model can hold across every later shot. Later shots never restate the
look; they inherit it.

## Name Materials, Not Categories

A garment, a prop or a surface is named by what it is made of and how it is built: "a massive
tan suede work boot with a thick, chunky brown rubber sole and tightly laced brown shoelaces",
"an unbuttoned dark navy blue heavy-cotton overshirt", "a translucent rain poncho", "a sleek
black helmet with a neon-reflecting visor". Material decides how a thing moves, catches light
and sounds, so one adjective of material buys three renders' worth of consistency.

## Re-Anchor, Do Not Re-Describe

From `[Shot 2]` on, a subject already defined is "the man from Shot 1", "the rider and e-bike
from Shot 1" -- one phrase that points back, and then only what has CHANGED ("now stands fully
planted on the ground", "his jacket flares out, revealing a neutral-toned t-shirt underneath").
A second full description is a second person to H3; a re-worded one is a different person.

## Each Cut Names Its Framing And Its Move

The cut phrase is followed at once by the framing and the camera move of the new shot, so the
shot announces how it is filmed before what is in it:

```text
[Shot 2] At 00:02.100, the camera cuts to a medium shot from a slightly elevated low-angle
vantage point. ...
[Shot 4] At 00:02.800, the camera cuts to a side-profile medium shot as the camera trucks right
at fast speed, ...
```

Then, at the end of the shot or inside its action, say what the move is FOR: "tracking his
rotation and capturing the shifting reflections of the city on the glass", "maintaining a
constant distance just ahead of his advancing boots". A move tied to the subject's motion is
rendered as cinematography; a move with no reason is rendered as drift. Our four modifier
phrases still apply -- `at fast speed`, not "a fast Truck Right".

## Write The Physics, Not The Verb

An action is written with what it causes, in the same sentence:

- the cause and its consequence -- "the boot descends rapidly, striking the pavement";
  "the front wheel bites heavily into the accumulated water, plowing a massive V-shaped wake";
- secondary motion -- "the initial burst inflates his poncho like a sail", "his wet poncho
  snaps whip-like off his back with every step", "his cargo pants wrinkle dynamically";
- light doing something -- "its illuminated light band strobing across the rider's wet
  poncho", "the handrail lights blur into one rising solid line", "shifting reflections of the
  city on the glass".

This is also what keeps a clip from slow motion (`control.md`, Budget The Clip): consequences
are beats, and beats are what fill the frames.

## Light Is Named, Not Implied

Where the light comes from, what colour it is, what it falls on and what it reflects in:
"overcast, pale grey sky", "red-orange signage streaks into glowing light trails", "his helmet
visor faces the lens dead-on, perfectly reflecting the sprawling, illuminated city". A shot with
no light named is lit by the model's average.

## On-Screen Text Is A Designed Layer

When the clip carries titles, each one is designed, not merely quoted:

- the exact text in double quotes -- `"STREETWEAR"`, `"VOL. 1"`;
- its look -- size, colour, weight or treatment ("large, bold, white typography", "glitchy
  white text", "fast-paced, neon-yellow text");
- its place in DEPTH as well as in the frame -- "positioned between the man's back and the
  skyscraper", "weaving behind his swinging right arm", "in the extreme foreground";
- its motion, tied to the action -- "flashes character by character in sync with the rail's
  light band", "shatters into rain-particle fragments upon the bike's impact".

One readable text layer at a time, and a shot meant to have none says so ("a pure visual burst
with no text present") -- otherwise the text of the shot before leaks into it. When the brief
asks for no text at all, say it once (`control.md`, Say What Must Not Appear).

## End On A Stated Beat

The last shot says how the clip ENDS, as an event: "before the entire scene freezes
razor-sharp on the final visual beat", "locking into a sharp stance". A clip whose last sentence
is a continuing action has no end, and the model ends it wherever the frames run out.

## Sound In The Same Order As The Picture

`overall_soundscape` is written in time order, and the official ones share one shape:

1. a continuous bed, named first ("a faint, continuous urban hum of distant city traffic
   provides a subtle ambient baseline", "a continuous heavy rainstorm provides a dense
   acoustic bed");
2. the foreground events in the order they happen, each tied to the action that makes it and
   given a timbre and a place ("a loud, resonant thud is heard prominently in the foreground as
   the heavy tan boot strikes the concrete", "a sharp metallic clack from the food box lid");
3. how it ends ("all action noises abruptly cut out near the very end, leaving only the soft,
   fading hiss of rain").

Four sentences hold all of that when the events are linked inside them -- "followed by",
"as", "when the shot changes". Theirs ran to five, and a fifth is a warning here rather than a
rejection; past that, every sentence should still be a sound the picture makes.

`non_diegetic_music` names the genre, the tempo as a number where there is one (`160 BPM`),
the instruments, how the hits relate to the CUTS ("booming 808 bass drops that hit in sync with
the sharp visual cuts") and how the score ends ("abruptly cutting to absolute silence on the
final visual accent"). Every one of those is something that plays; none of them is a feeling.
