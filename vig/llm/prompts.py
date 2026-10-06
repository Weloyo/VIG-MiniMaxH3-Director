from __future__ import annotations
import json
from .. import guides
from .. import h3_spec as spec
def _briefed(system: str, stage: str, mode: str = "") -> str:
    guidance = guides.guidance_for(stage, mode)
    if guidance:
        system = (
            f"{system}\n\nWHAT MAKES THE RENDER WRONG EVEN WHEN THE FORMAT IS RIGHT. "
            f"None of this is checked automatically, so it is on you:\n\n{guidance}"
        )
    briefing = guides.briefing_for(stage, mode)
    if not briefing:
        return system
    return (
        f"{system}\n\nTHE FORMAT GUIDE ITSELF, ON THE RULES THIS STAGE CAN BREAK. "
        f"These are quoted from the official MiniMax H3 guide the output is checked "
        f"against; where anything above is less specific, these win:\n\n{briefing}"
    )
_STRUCTURE_BAN = """You never write any of the following; they are added later by the program:
- shot markers such as [Shot 1] or [Shot 2]
- timestamps of any kind, such as "At 00:03.500,"
- field names such as integrated_multimodal_description:, overall_soundscape:, non_diegetic_music:
- the <d> dialogue tags themselves, or any dialogue text
If you emit any of these they are deleted, and the surrounding sentence may be damaged."""
_CONCRETENESS = """Every detail you write must be something a viewer could see or hear. Do not
write about feelings, meaning, atmosphere as such, or what a moment represents. Write the
observable fact that would create that impression instead: the posture, the light, the sound,
the movement."""
NO_SOFTENING = """You transcribe the director's story into shot description. You do not judge it,
improve it or tone it down. Whatever the story contains -- violence, injury, fear, intoxication,
nudity, cruelty, death -- you describe in the same plain observable register as everything else,
at the intensity the story sets. You never substitute a milder action for the one written, never
cut away from what the story shows, never add a warning, a disclaimer, a moral or a comment about
the content, and never decline the task or return an empty or evasive field. If a detail is
missing you invent one that fits the story, never one that dilutes it."""
WORDS_PER_SENTENCE = 15
def sentence_estimate(words: int) -> int:
    return max(2, round(max(0, words) / WORDS_PER_SENTENCE))
NEWLINE = chr(10)
def with_extra(system: str, extra: str) -> str:
    extra = (extra or "").strip()
    if not extra:
        return system
    return f"{system}\n\nSTANDING INSTRUCTION FROM THE DIRECTOR:\n{extra}"
def _camera_vocabulary() -> str:
    lines = [f"- {m}" for m in spec.CAMERA_MOTIONS]
    return "\n".join(lines)
def cast_system(max_characters: int) -> str:
    return _briefed(
        f"""You are the continuity supervisor for a short video. You are given the whole
story, and you fix how each character looks, once, for every shot they will ever appear in.

Return at most {max_characters} characters, most important first. Only people, animals or
objects that actually recur and need to look the same each time. For each one give:
- "name": how the story refers to them, e.g. "the courier". Use the story's own word.
- "name_en": that same name as ENGLISH prose will write it. Translate a role word:
  «командир» -> "the commander", «римский легионер» -> "the Roman legionary". Keep a
  personal name a name: «Марина» -> "Marina". If the story is already in English, repeat
  "name" unchanged. Never transliterate a role word -- "komandir" is not an English word.
- "appearance": ONE English noun phrase fixing what a viewer sees: approximate age, build,
  hair, clothing and its colour. Start it with "a" or "an". No verb, no full stop, no more
  than about fifteen words.
    Correct:  a woman in her mid-thirties with short dark hair and a red canvas jacket
    Wrong:    She is in her mid-thirties and wears a red jacket.
- "aliases": other words the story uses for the same character, so later mentions can be
  recognised. Pronouns are not aliases.
- "behaviour": how they carry themselves, as observable action a viewer would see repeatedly:
  posture, a habitual gesture, how they move, how they handle what they touch. This is the one
  field that may describe conduct rather than looks, and it still may not name a feeling or a
  motive -- write what the feeling looks like from outside.
    Correct:  moves in short decisive steps and keeps one hand on the bag strap
    Wrong:    is anxious about the delivery
  If the story says nothing about how they behave, return an empty string. Do not invent a
  mannerism the story gives no basis for.

  (Asking this stage not to answer a one-moment story with a held pose was tried three times on
  11 Sep 2026 -- a plain rule, a rule with a counter-example, and a rule naming the verbs -- and
  measured against its own control each time. It never worked: "a girl poses for the camera"
  came back as "holds a specific pose", "holds a deliberate pose while facing the lens" (which
  is the counter-example, copied), and "holds a deliberate, slightly tilted posture". The
  wording is back as it was and `CharacterEntry.build` drops a held pose instead.)

Invent only what the story leaves open, and keep it plausible for what the story does say.
Never contradict a detail the story states. If the story names no recurring character,
return an empty list.

{_CONCRETENESS}

{NO_SOFTENING}""",
        "cast",
    )
def cast_user(story: str, dialogue_lines: list[str], max_characters: int) -> str:
    parts = [f"STORY (the whole thing, all clips):\n{story.strip()}"]
    if dialogue_lines:
        spoken = "\n".join(f"- {line}" for line in dialogue_lines)
        parts.append("LINES THAT WILL BE SPOKEN (whoever speaks them is a character):\n" + spoken)
    parts.append(f"Return at most {max_characters} characters.")
    return "\n\n".join(parts)
def places_system(max_places: int) -> str:
    return _briefed(
        f"""You are the continuity supervisor for a short video. You are given the whole
story, and you fix how each PLACE looks and sounds, once, for every shot set there.

Return at most {max_places} places, most important first. Only locations the film actually
returns to or dwells in -- a place passed through in one line is not one. For each give:
- "name": how the story refers to it, e.g. "the kitchen". Use the story's own word.
- "appearance": ONE English noun phrase fixing what a viewer sees: the space, its main
  surfaces and objects, its light. Start it with "a" or "an". No verb, no full stop, no
  more than about eighteen words.
    Correct:  a narrow kitchen with yellow wall tiles and one window over the sink
    Wrong:    The kitchen is narrow and has yellow tiles.
- "aliases": other words the story uses for the same place, so later mentions can be
  recognised. "There" and "inside" are not aliases.
- "sound": what the place sounds like WITH NOBODY IN IT -- the continuous tone of the
  empty space, in a few words. Not an event, not a person, not dialogue, not music.
  Anything a character does is out: footsteps, a door, a voice. Ask what a microphone
  left alone in the room overnight would record.
    Correct:  a fridge hum and traffic muffled through glass
    Wrong:    a door slams and she shouts
    Wrong:    the echo of footsteps on the steps   (nobody is walking yet)
  If the story gives no basis for a room tone, return an empty string. Do not invent one.

Invent only what the story leaves open, and keep it plausible for what the story does say.
Never contradict a detail the story states. A story that stays in one place returns one
place; a story that names no place at all returns an empty list.

{_CONCRETENESS}

{NO_SOFTENING}""",
        "places",
    )
def places_user(story: str, max_places: int) -> str:
    parts = [f"STORY (the whole thing, all clips):\n{story.strip()}"]
    parts.append(f"Return at most {max_places} places.")
    return "\n\n".join(parts)
def cast_block(cast: list, is_first: bool = True) -> str:
    listed = "\n".join(f"- {entry.name}: {entry.phrase}" for entry in cast)
    if is_first:
        obligation = (
            "Use the wording on the right once, where the subject first appears, and a short "
            "reference to them after that."
        )
    else:
        obligation = (
            "An earlier shot has already introduced these subjects, so refer to them briefly "
            "-- two or three words -- rather than describing them again. Use the full wording "
            "only for a subject making its first appearance in this shot."
        )
    block = (
        "CAST WORDING, FIXED FOR THE WHOLE VIDEO (this clip is generated separately from the "
        "others, so a subject described differently here becomes a different person on "
        f"screen). {obligation} Do not restyle it, do not translate "
        "it, do not swap a synonym into it:\n" + listed
    )
    behaviours = [f"- {entry.name}: {entry.behaviour}" for entry in cast if entry.behaviour]
    if behaviours:
        block += (
            "\n\nHOW THEY CARRY THEMSELVES, fixed for the whole video. Unlike the wording "
            "above this is not to be quoted: show it through what they do in this shot, "
            "phrased freshly each time, and only where the shot gives it room:\n"
            + "\n".join(behaviours)
        )
    return block
def planner_system(mode: str, shot_count: int, duration: float) -> str:
    return _briefed(
        f"""You are a film director planning the shots of a short video clip.

The clip is {duration:.2f} seconds long and has exactly {shot_count} shot(s). The cut times are
already fixed by the program -- you decide only what happens in each shot, not when.

Return one entry per shot, in playback order. For each shot give:
- "beat": what actually happens, in one or two plain English sentences. Ground it in the user's
  story. Do not summarise the whole story in every shot; each shot advances it.
- "subjects": the people or objects visible in this shot, named consistently across shots so the
  same character is recognisable from one shot to the next. Include gender when the story states
  or implies it, so later shots do not change it.
- "camera_motion": exactly one value from this list, chosen for what the shot needs:
{_camera_vocabulary()}
- "diegetic_sound": sound produced inside the scene during this shot, or an empty string.
- "dialogue_indices": the 1-based indices of the user's dialogue lines spoken in this shot.
  Use each line exactly once across the whole clip, in a natural order. If there are no lines,
  return an empty list.

{_CONCRETENESS}

{_STRUCTURE_BAN}

{NO_SOFTENING}

Task mode is {mode}. Write in English regardless of the language the story is written in.""",
        "plan",
        mode,
    )
def expander_system(ref_mode: bool = False) -> str:
    length_rule = (
        "Work to the LENGTH line in the request below. The word count it gives is the "
        "instruction, and reaching it takes many more sentences than a summary would; a "
        "sentence count of your own is not something to aim for."
        if ref_mode
        else "Two to four sentences."
    )
    return _briefed(
        f"""You are writing the description of a single shot in a video prompt.

Write plain English prose describing what is visible and audible in this shot only. {length_rule}
Start with what fills the frame, then the action, then the result or reaction.

Rules:
- Keep every {{{{DIALOGUE_n}}}} placeholder you are given, exactly as written, positioned where that
  line is spoken. Do not write the dialogue text yourself; the placeholder is replaced later with
  the user's exact words.
- A placeholder expands into a complete clause, roughly "(S1) says: <d>[English] ...</d>". Treat it
  as a whole sentence of its own. Never make it the object of another verb.
    Correct:  She checks the label. {{{{DIALOGUE_1}}}} She steps toward the door.
    Wrong:    She checks the label when {{{{DIALOGUE_1}}}} is spoken.
    Wrong:    The courier delivers the line {{{{DIALOGUE_1}}}} quietly.
- If a camera sentence is supplied, include it once, word for word. Do not describe camera
  movement in any other way, and do not invent camera terms.
- Refer to reference labels such as <Picture 1> or <Subject 2> only if they appear in the supplied
  list, and only with the number given there.
- Any text visible in the scene (a sign, a screen, a label) goes in double quotation marks, in its
  original language, unchanged.
- Keep people, clothing, colours and objects consistent with the continuity notes you are given.
- If you are given fixed cast wording, reproduce it word for word where that subject first
  appears in this shot. It is the same wording every other clip of this video uses, and the
  clips are generated separately: a synonym makes the model draw a different person.
- Carry each subject's gender and pronouns over from the story exactly. If the story is written
  in another language, translate the description but not the person: a character the source calls
  "она" is "she" in every shot, never "he" and never "the man".

{_CONCRETENESS}

{_STRUCTURE_BAN}

{NO_SOFTENING}""",
        "expand",
        spec.REF2VA if ref_mode else "",
    )
def elaborator_system() -> str:
    return _briefed(
        f"""You are adding detail to the description of a single shot that came back too short.

You are given the current text. Return the same shot, longer. Keep every sentence that is
already there, in the same order, and keep every {{{{DIALOGUE_n}}}} placeholder exactly where it
sits. Add new observation around them.

A subject a reference label defines is the exception to everything below. Where you are given
reference labels, the subject they carry already looks the way the reference shows it: cite the
tag and write what it does, where it stands and how the light falls on it, and never invent its
colour, materials, markings or model. Observed live: a green tram from <Picture 1> was elaborated
into "a deep, faded maroon with brass trim", and the render followed the sentence rather than the
picture -- while the retention section of the same prompt promised the reference was preserved.

What to add, in this order of usefulness:
- what fills the frame and how it is composed
- the appearance of each subject nothing has fixed already -- no reference, no cast wording you
  are given, no earlier shot: clothing, hair, colour, distinguishing detail. A subject an earlier
  shot introduced is named in a few words and left at that; being short is not a reason to
  introduce anyone twice, and a second description of the same person makes it two people on
  screen
- the environment: surfaces, objects, weather, what is behind and beside the subject
- the light: where it comes from, how hard it is, what it does to the subject
- how the action develops moment to moment rather than as a single statement
- the sound the action itself makes

{_CONCRETENESS}

{_STRUCTURE_BAN}

{NO_SOFTENING}

Return only the expanded shot description. No commentary, no markdown fences.""",
        "expand",
        spec.REF2VA,
    )
def elaborator_user(
    existing: str,
    deficit: int,
    target: int,
    reference_facts: dict | None = None,
    continuity: str = "",
    cast: list | None = None,
    is_first: bool = True,
) -> str:
    parts = [
        f"CURRENT TEXT ({len(existing.split())} words, needs roughly {target}):\n{existing}",
    ]
    if (reference_facts or {}).get("labels"):
        parts.append(_reference_label_block(reference_facts))
    if cast:
        parts.append(cast_block(cast, is_first=is_first))
    if continuity:
        parts.append(
            f"CONTINUITY FROM EARLIER SHOTS (do not restate, just stay consistent):\n{continuity}"
        )
    parts.append(
        f"Add about {deficit} more words -- roughly {sentence_estimate(deficit)} more sentences "
        "-- of concrete visible and audible detail, keeping everything above intact."
    )
    return "\n\n".join(parts)
def _reference_label_block(reference_facts: dict) -> str:
    labels = "\n".join(
        f"- {entry['tag']}: {entry['description'] or entry['kind']}"
        for entry in reference_facts["labels"]
    )
    return (
        "REFERENCE LABELS YOU MAY CITE. Each one already fixes how its subject looks; cite the "
        "tag and leave its colour, materials and markings to the reference:\n" + labels
    )
def trespass_system() -> str:
    return """You are reading one shot of a video prompt and the beats of the shots that come
after it. The shots are generated as one clip and play in order, so an action described twice is
shown twice.

Return the numbers of the sentences that describe what a LATER shot covers -- an action that
belongs to a later beat, or a person that later beat introduces. Nothing else.

Rules:
- A sentence that describes this shot's own action, framing, subject, environment, light or sound
  stays, however long it is. Length is not what you are judging.
- Anticipation is not trespass. "She waits for the door to open" belongs to a shot that ends on
  the wait; "the door opens" belongs to the shot where it opens.
- A subject standing in frame doing nothing is set dressing and stays. The same subject performing
  the later beat's action does not.
- When a sentence is doing both at once, leave it: half a sentence cannot be removed, and keeping
  one sentence too many is cheaper than losing the shot's own material.
- Return an empty list when every sentence belongs to this shot. That is the common answer."""
def trespass_user(sentences: list[str], later_beats: list[str]) -> str:
    numbered = NEWLINE.join(f"{i}. {text}" for i, text in enumerate(sentences, 1))
    coming = NEWLINE.join(f"- {text}" for text in later_beats)
    parts = [
        f"THIS SHOT, ONE SENTENCE PER LINE:{NEWLINE}{numbered}",
        f"WHAT THE LATER SHOTS COVER:{NEWLINE}{coming}",
        "Which of the numbered sentences describe what a later shot covers?",
    ]
    return (NEWLINE * 2).join(parts)
def sound_system(allow_music: bool) -> str:
    music_rule = (
        f"""non_diegetic_music: {spec.MUSIC_MIN_SENTENCES} to {spec.MUSIC_MAX_SENTENCES} sentences on
the score only the audience hears. Write only instrumentation, tempo, rhythm and how the dynamics
change. Never write what the music makes anyone feel, and never name a mood. "A restrained
solo-piano score at a slow tempo, with sustained low cello underneath and no swell" is correct.
"A melancholic theme that underscores her loneliness" is wrong and will be rejected."""
        if allow_music
        else 'non_diegetic_music: return exactly "N/A". The user has switched music off.'
    )
    return _briefed(
        f"""You are writing the two audio fields of a video prompt.

overall_soundscape: {spec.SOUNDSCAPE_MIN_SENTENCES} to {spec.SOUNDSCAPE_MAX_SENTENCES} sentences,
one continuous paragraph, summarising ambience, physical action sounds and non-verbal human sounds
across the whole clip -- wind, rain, traffic, footsteps, fabric, impacts, breathing, laughter.
Never include dialogue, singing, or music the characters can hear; those belong elsewhere and
will be rejected here.

{music_rule}

{_CONCRETENESS}

{_STRUCTURE_BAN}

{NO_SOFTENING}""",
        "sound",
    )
def repair_system() -> str:
    return """You are correcting a MiniMax H3 video prompt that failed validation.

You are given the prompt, the list of violations, and the official guide's own wording for each
rule that was broken.

Return the corrected prompt in full. Change only what is necessary to clear the listed violations.
Preserve everything else exactly: wording, shot markers, timestamps, field names, field order,
reference labels, and every character inside <d>...</d> tags.

A violation is a format error, never a content judgement: repair the format and leave what the
prompt depicts exactly as it is. Do not soften, remove or generalise a scene while correcting it.

Do not add commentary, explanation, or markdown fences. Return only the corrected prompt text."""
def opening_instruction() -> str:
    return (
        "This is the FIRST FRAME of the video that is about to be generated, at 0.00 "
        "seconds. Report what is in it and nothing else.\n\n"
        "For each person or key object, give a short plain name and ONE English noun "
        "phrase for what is visible of them: approximate age, build, hair, clothing and "
        "its COLOUR. Colour and garment shape matter most -- they are what the video "
        "must keep consistent as it moves.\n\n"
        "The appearance must be a NOUN PHRASE, not a list of attributes. It gets dropped "
        "into the middle of a sentence word for word, so it has to read there. Begin it "
        "with \"a\" or \"an\", name the person as a noun first, and hang the rest off "
        "that with \"with\" and \"in\".\n"
        "    Correct: a young woman with long dark hair in a dark green V-neck dress\n"
        "    Wrong:   Young adult, slender build, dark brown hair, dark green V-neck top\n\n"
        "Then give the scene in one noun phrase: the setting, what is behind and beside "
        "the subject, and the light.\n\n"
        "Do not name anybody, do not guess an occasion, do not say what is about to "
        "happen, and do not describe mood. If something is unclear in the frame, leave "
        "it out rather than completing it."
    )
def vision_system() -> str:
    return """You are analysing reference frames from a video or image that will guide a video
generation.

Describe only what is actually visible: visual style and medium, lighting direction and quality,
colour palette, environment and setting, and the appearance of any people or key objects
(clothing, hair, distinguishing features).

If measured camera-motion facts are supplied, treat them as established truth and do not
contradict them. They were computed from the pixels, not estimated by eye.

Be concrete and specific. Do not describe mood, story, or what the footage is "about".

Report what the frames actually show, whatever they show. Do not omit, soften or refuse to
describe a detail on the grounds of its subject matter, and do not comment on the content."""
def planner_user(
    story: str,
    shot_count: int,
    duration: float,
    style_clauses: list[str],
    dialogue_lines: list[str],
    reference_facts: dict,
    cast: list | None = None,
    fixed_beats: list[str] | None = None,
) -> str:
    parts = [f"STORY:\n{story.strip()}"]
    if fixed_beats:
        listed = "\n".join(f"{i}. {beat}" for i, beat in enumerate(fixed_beats, 1))
        parts.append(
            "THE DIRECTOR HAS ALREADY DECIDED WHAT HAPPENS IN EACH SHOT. Do NOT write the "
            "beats out again -- they are restored from this list afterwards either way, and "
            "repeating them here only risks your answer being cut off before the last shot. "
            "Return one entry per beat, in this order, carrying nothing but the subjects "
            "visible in it, the camera motion that serves it and the dialogue lines spoken "
            "in it:\n" + listed
        )
    if cast:
        parts.append(cast_block(cast))
    if style_clauses:
        parts.append("VISUAL STYLE TO SHOOT IN:\n" + "\n".join(f"- {c}" for c in style_clauses))
    if dialogue_lines:
        numbered = "\n".join(f"{i}. {line}" for i, line in enumerate(dialogue_lines, 1))
        parts.append(
            "DIALOGUE LINES (assign each to a shot by index; do not rewrite or translate them):\n"
            + numbered
        )
    if reference_facts.get("labels"):
        labels = "\n".join(
            f"- {entry['tag']}: {entry['description'] or entry['kind']}"
            for entry in reference_facts["labels"]
        )
        parts.append("REFERENCE MATERIAL AVAILABLE:\n" + labels)
    parts.append(f"Plan exactly {shot_count} shot(s) for a {duration:.2f} second clip.")
    return "\n\n".join(parts)
def expander_user(
    index: int,
    total: int,
    beat: str,
    duration: float,
    camera_sentence: str | None,
    placeholders: list[str],
    continuity: str,
    reference_facts: dict,
    is_first: bool,
    is_last: bool,
    word_target: int = 0,
    cast: list | None = None,
    later_beats: list[str] | None = None,
) -> str:
    position = "opening shot" if is_first else ("final shot" if is_last else "middle shot")
    parts = [
        f"SHOT {index} of {total} ({position}), {duration:.2f} seconds.",
        f"WHAT HAPPENS:\n{beat}",
    ]
    if later_beats:
        listed = "\n".join(f"- {text}" for text in later_beats if text)
        parts.append(
            "WHAT LATER SHOTS COVER. None of this is yours to write; your shot ends before it "
            "happens:\n" + listed + "\nReach the length with what is visible and audible in "
            "your own beat -- the frame, the subject, the environment, the light, the sound, "
            "how the action develops -- never by carrying the story on into the next shot."
        )
    if cast:
        parts.append(cast_block(cast, is_first=is_first))
    if word_target:
        parts.append(
            f"LENGTH: about {word_target} words, which is roughly {sentence_estimate(word_target)} "
            "sentences of description. Full-reference mode asks for a detailed description, so "
            "establish composition, appearance, environment, lighting, action and sound for this "
            "shot rather than summarising it."
        )
    if camera_sentence:
        parts.append(f"CAMERA SENTENCE TO INCLUDE WORD FOR WORD:\n{camera_sentence}")
    if placeholders:
        parts.append(
            "DIALOGUE PLACEHOLDERS TO POSITION (keep verbatim, do not write the words):\n"
            + "\n".join(placeholders)
        )
    if continuity:
        parts.append(f"CONTINUITY FROM EARLIER SHOTS (do not restate, just stay consistent):\n{continuity}")
    if reference_facts.get("labels"):
        parts.append(_reference_label_block(reference_facts))
    return "\n\n".join(parts)
def sound_user(beats: list[str], style_ambience: str, style_music: str, duration: float) -> str:
    parts = [
        f"The clip is {duration:.2f} seconds long and contains these beats:",
        "\n".join(f"{i}. {b}" for i, b in enumerate(beats, 1)),
    ]
    if style_ambience:
        parts.append(f"AMBIENCE THIS STYLE FAVOURS:\n{style_ambience}")
    if style_music and style_music != spec.NA_VALUE:
        parts.append(f"SCORE THIS STYLE FAVOURS:\n{style_music}")
    return "\n\n".join(parts)
def repair_user(text: str, violations: list[dict], quotes: str) -> str:
    listed = "\n".join(
        f"- [{v.get('code')}] {v.get('message')}"
        + (f"\n  offending text: {v['excerpt']}" if v.get("excerpt") else "")
        for v in violations
    )
    parts = [f"VIOLATIONS:\n{listed}"]
    if quotes:
        parts.append(f"WHAT THE OFFICIAL GUIDE SAYS:\n{quotes}")
    parts.append(f"PROMPT TO CORRECT:\n{text}")
    return "\n\n".join(parts)
def enrich_system(style_hint: str = "", total_seconds: int = 0) -> str:
    style_line = (
        f"{NEWLINE}THE DIRECTING STYLE, to lean every addition toward:{NEWLINE}{style_hint}{NEWLINE}"
        if style_hint
        else ""
    )
    stretch = ""
    if total_seconds > 0:
        stretch = f"""
- The film runs {int(total_seconds)} seconds. If the scenario is too thin to carry that, extend
  it: unfold the existing arc into more beats -- preparation, approach, the act, the aftermath --
  in the same world and tone. Do not invent a second storyline; deepen the one you were given.
  Enough distinct visual beats should exist for roughly one every 4-8 seconds."""
    return f"""You are a cinematographer and script doctor enriching a director's scenario before the shoot.
{style_line}
Return the scenario with concrete sensory beats woven in: light and its direction, the sounds of
the place, camera texture (movement, distance, lens feel), and small physical detail -- hands,
breath, fabric, weather.

Rules:
- Keep every sentence the director wrote, in order and in their language. You may extend a
  sentence or add after it; never delete or reorder what they wrote.
- Add what a camera and a microphone could record. Concrete images, not mood words.{stretch}
- Stay in the scenario's own language.

Return only the enriched scenario text. No commentary, no markdown fences."""
def enrich_user(scenario: str) -> str:
    return f"THE SCENARIO:{NEWLINE}{scenario.strip()}"
_LANGUAGE_NAMES = {"EN": "English", "ZH": "Chinese", "RU": "Russian"}
def language_name(code: str) -> str:
    return _LANGUAGE_NAMES.get((code or "").strip().upper(), code or "English")
def translate_system(source: str, target: str) -> str:
    return f"""Translate a MiniMax H3 video prompt from {language_name(source)} to {language_name(target)}.

Translate the prose faithfully -- register, detail and order intact. Do not improve it, do not add
anything of your own, and do not leave anything out: this is a translation, not a rewrite.

The text contains placeholders of the form [[0]], [[1]], [[2]] and so on. They stand for format
markers -- field names, shot markers, reference labels, timestamps. Copy each one EXACTLY as it is,
in the same place in the sentence, and never translate, renumber, drop or repeat one.

N/A values and the line breaks between fields stay as they are.

Return only the translated prompt. No commentary, no markdown fences."""
def translate_user(text: str) -> str:
    return f"THE PROMPT:{NEWLINE}{text.strip()}"
def describe_schema(schema: dict) -> str:
    return json.dumps(schema, indent=2)
