init python:
    renpy.music.register_channel("ambient", "sfx", loop=True)

define anna = Character("Anna", color="#e86a92")
define left_char = Character("Left", color="#4a90d9")
define dr_d = Character("Dr. \"D\"", color="#c0a060")
define nova = Character("Nova", kind=nvl, color="#5fd08a", image="nova")
define narrator = nvl_narrator

default courage = 0
default has_key = False
default nickname = "Stranger"
default trust = 2.5
default persistent.seen_ending = False


label start:

    scene bg forest with fade

    scene black

    scene bg gate with dissolve

    play music "audio/music/morning.wav" fadein 1.5

    play music "audio/music/night_theme.wav" noloop

    play music "audio/music/morning.wav" fadein 2.0 noloop

    show anna happy at center with dissolve

    show left_char smile at right

    show anna sad at left

    anna "She said \"hi\" \\ back, [nickname] has [courage] and [[bogus] {b}bold{/b} {size=20}small{/size} {{blink}x{{/blink} 100%%\nSecond line."

    "The path {i}splits{/i} {u}ahead{/u}."

    left_char "I'm \"Left\"."

    hide left_char with fade

    hide anna

    play sound "audio/sfx/door.wav"

    $ courage = 1

    $ courage += 2

    $ courage -= 1

    $ has_key = not has_key

    $ nickname = "Bob \"B\""

    $ has_key = True

    $ trust = 2.5

    $ trust += 0.5

    pause

    pause 2.0

    pause 1.5

    with fade

    stop music fadeout 2.0

    stop music

    menu:

        anna "Which way, [nickname]?"

        "Take the left path":
            $ courage += 1
            jump left_path

        "Use the key" if has_key:
            jump gate_2

        "Go \"secret\"" if courage >= 3 and nickname != "Stranger":
            jump secret


label secret:

    jump extras


label extras:

    play ambient "audio/ambient/rain.wav" fadein 1.0

    show anna happy zorder 2:
        xalign 0.25
        yalign 1.0
        zoom 1.2
        alpha 0.8
    with dissolve

    show left_char smile at right zorder 1

    show nova calm:
        xalign 0.8
        yalign 0.9
        rotate 15

    voice "audio/voice/anna_01.wav"
    anna "Seen it? [persistent.seen_ending] {color=#ff0000}red{/color} {size=40}big{/size}{w} {cps=20}slow{/cps}{p}after {{color=red}bad"

    $ nickname = renpy.input("What is your name?", default="Alex", length=20).strip()

    window hide

    window show

    nova "I speak in NVL mode, [nickname]."

    "Narration on the same page."

    nvl clear

    $ persistent.seen_ending = True

    stop ambient fadeout 2.0

    if persistent.seen_ending:
        jump cutscene_intro
    else:
        jump the_end


label cutscene_intro:

    $ renpy.movie_cutscene("movies/intro.webm")

    "After the movie."

    jump the_end


label splashscreen:

    "Presented with care."

    return
