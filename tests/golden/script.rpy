define anna = Character("Anna", color="#e86a92")
define left_char = Character("Left", color="#4a90d9")
define dr_d = Character("Dr. \"D\"", color="#c0a060")

default courage = 0
default has_key = False
default nickname = "Stranger"
default trust = 2.5


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

    anna "She said \"hi\" \\ back, [nickname] has [courage] and [[bogus] {b}bold{/b} {{size=20}small{{/size} 100%%\nSecond line."

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

    jump the_end
