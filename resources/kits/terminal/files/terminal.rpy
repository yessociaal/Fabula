init python:

    def terminal_pick_font():
        saved = config.allow_sysfonts
        config.allow_sysfonts = True
        for name in ("consola.ttf", "cour.ttf", "DejaVuSansMono.ttf", "LiberationMono-Regular.ttf"):
            try:
                renpy.text.font.load_face(name, "harfbuzz")
                return name
            except Exception:
                continue
        config.allow_sysfonts = saved
        return gui.text_font

    def terminal_escape(text):
        return text.replace("[", "[[").replace("{", "{{")

    def terminal_open(title, lines, prompt="> "):
        store.terminal_title = title
        store.terminal_prompt = prompt
        for line in lines:
            terminal_print(line)

    def terminal_print(text):
        for line in text.split("\n"):
            terminal_lines.append(line)

    def terminal_clear():
        del terminal_lines[:]

    def terminal_help(words):
        terminal_print("Commands: " + ", ".join(["help"] + list(words)))

    def terminal_read():
        text = renpy.call_screen("terminal", False)
        text = text.strip().lower()
        terminal_lines.append(terminal_prompt + terminal_escape(text))
        return text

    def terminal_close():
        renpy.call_screen("terminal", True)
        del terminal_lines[:]
        store.terminal_title = ""

default terminal_title = ""
default terminal_prompt = "> "
default terminal_lines = []

define terminal_font = terminal_pick_font()

transform terminal_blink:
    alpha 1.0
    pause 0.6
    alpha 0.3
    pause 0.6
    repeat

style terminal_text:
    font terminal_font
    size 26
    color "#7fe39a"
    xfill True

style terminal_input is terminal_text

screen terminal(waiting=False):

    modal True
    zorder 190

    frame:
        background Solid("#070b08")
        xfill True
        yfill True
        padding (80, 50, 80, 50)

        side "c r":
            xfill True
            yfill True
            spacing 12

            viewport:
                id "terminal_view"
                yinitial 1.0
                mousewheel True
                draggable True

                vbox:
                    xfill True
                    spacing 8

                    text terminal_title style "terminal_text" color "#d6ffe0" size 30
                    frame:
                        background Solid("#245c36")
                        xfill True
                        ysize 2
                        padding (0, 0)

                    for line in terminal_lines:
                        text line style "terminal_text"

                    if waiting:
                        text "Connection closed. Press Enter to continue." style "terminal_text" at terminal_blink
                        key "input_enter" action Return(True)
                        key "mouseup_1" action Return(True)
                    else:
                        hbox:
                            text terminal_prompt style "terminal_text" at terminal_blink xfill False
                            input style "terminal_input" copypaste True

            vbar:
                value YScrollValue("terminal_view")
                unscrollable "hide"
                xsize 14
                base_bar Solid("#0f1d14")
                thumb Solid("#2f7a49")
