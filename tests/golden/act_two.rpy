label gate_2:

    "Beyond the gate."

    if courage > 5:
        jump the_end
    elif trust >= 3 or nickname != "Bob":
        jump locked_door
    else:
        return


label locked_door:

    anna "It's locked."

    menu:

        "Knock" if has_key:
            jump the_end

        "Leave" if courage > 0:
            jump gate_2

    return


label the_end:

    "The end."

    return
