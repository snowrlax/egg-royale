export type InputState = {
    up: boolean;
    down: boolean;
    left: boolean;
    right: boolean;
    sprint: boolean;
    jump: boolean;
};

const KEY_MAP: Record<string, keyof InputState> = {
    "w": "up", "W": "up", "ArrowUp": "up",
    "s": "down", "S": "down", "ArrowDown": "down",
    "a": "left", "A": "left", "ArrowLeft": "left",
    "d": "right", "D": "right", "ArrowRight": "right",
    "Shift": "sprint",
    " ": "jump", // spacebar — KeyboardEvent.key for space is the literal " "
};

export function createInput(): InputState {
    const state: InputState = { up: false, down: false, left: false, right: false, sprint: false, jump: false };

    window.addEventListener("keydown", (e) => {
        const k = KEY_MAP[e.key];
        if (k) {
            state[k] = true;
            console.log(state);
        }
    });
    window.addEventListener("keyup", (e) => {
        const k = KEY_MAP[e.key];
        if (k) {
            state[k] = false;
            console.log(state);
        }
    });

    return state;
}
