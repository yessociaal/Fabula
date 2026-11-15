label left_path:

    scene bg forest

    anna "The trees close in."

    jump gate


label gate:

    scene bg gate

    "A locked gate."

    if not has_key:
        jump locked_door
    elif courage < 1 and trust <= 2.5:
        jump left_path
    elif nickname == "Stranger" or courage == 7:
        jump the_end
    else:
        jump gate_2
