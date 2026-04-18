export type InputState = {
    up: boolean;
    down: boolean;
    left: boolean;
    right: boolean;
};

const KEY_MAP: Record<string, keyof InputState> = {
    "w": "up", "W": "up", "ArrowUp": "up",
    "s": "down", "S": "down", "ArrowDown": "down",
    "a": "left", "A": "left", "ArrowLeft": "left",
    "d": "right", "D": "right", "ArrowRight": "right",
};

export function createInput(): InputState {
    const state: InputState = { up: false, down: false, left: false, right: false };

    window.addEventListener("keydown", (e) => {
        const k = KEY_MAP[e.key];
        if (k) state[k] = true;
    });
    window.addEventListener("keyup", (e) => {
        const k = KEY_MAP[e.key];
        if (k) state[k] = false;
    });

    return state;
}
