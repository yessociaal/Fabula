screen office_desk():

    modal True

    add "images/ui/desk.png" xpos 0 ypos 0 xsize 1280 ysize 720

    text "Where to \"look\"? 100%%" xpos 100 ypos 40 size 36 color "#ffffff" font "fonts/handwriting.ttf"

    textbutton "Open the door" xpos 200 ypos 500 xsize 220 ysize 60 background Solid("#3a3f4b") hover_background Solid("#4a5266") text_xalign 0.5 text_yalign 0.5 action Return("door")

    imagebutton idle "images/ui/desk.png" hover "images/ui/desk.png" xpos 900 ypos 200 action SetVariable("has_key", True)

    button xpos 400 ypos 300 xsize 180 ysize 120 background None action Return("drawer")

    button xpos 700 ypos 300 xsize 200 ysize 150 background None action Return("window")

    button xpos 50 ypos 200 xsize 120 ysize 80 background None action SetVariable("trust", trust + 1)

    textbutton "Read the note" xpos 200 ypos 600 xsize 220 ysize 60 background Solid("#3a3f4b") hover_background Solid("#4a5266") text_xalign 0.5 text_yalign 0.5 action Show("note")

    bar value VariableValue("trust", 10) xpos 40 ypos 120 xsize 300 ysize 24 left_bar Solid("#7c9cff") right_bar Solid("#262a33")


screen note():

    text "The key is in the drawer." xpos 500 ypos 600 size 28 color "#ffff80"

    textbutton "Close note" xpos 500 ypos 650 xsize 200 ysize 50 background Solid("#3a3f4b") hover_background Solid("#4a5266") text_xalign 0.5 text_yalign 0.5 action Hide()
