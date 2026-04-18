import * as THREE from "three/webgpu";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export type Character = {
    object: THREE.Object3D;
    bones: Record<string, THREE.Bone>;
    actions: Record<string, THREE.AnimationAction>;
    play: (name: string, fadeSeconds?: number) => void;
    update: (deltaSeconds: number) => void;
};

export async function loadSteve(url = "/models/Steve.glb"): Promise<Character> {
    const gltf = await new GLTFLoader().loadAsync(url);
    const object = gltf.scene;

    // Collect every bone by name. The canonical source is the SkinnedMesh's skeleton —
    // some loaders/exports don't set `isBone` reliably, so traversing for it is fragile.
    const bones: Record<string, THREE.Bone> = {};
    object.traverse((node) => {
        const skinned = node as THREE.SkinnedMesh;
        if (skinned.isSkinnedMesh && skinned.skeleton) {
            for (const bone of skinned.skeleton.bones) {
                bones[bone.name] = bone;
            }
        }
    });
    console.log(`[character] Found ${Object.keys(bones).length} bones:`, Object.keys(bones));

    const mixer = new THREE.AnimationMixer(object);
    const actions: Record<string, THREE.AnimationAction> = {};

    // Clip names look like "CharacterArmature|...|Idle" — keep just the trailing label
    for (const clip of gltf.animations) {
        const name = clip.name.split("|").pop() ?? clip.name;
        actions[name] = mixer.clipAction(clip);
    }

    let current: THREE.AnimationAction | null = null;
    function play(name: string, fadeSeconds = 0.2) {
        const next = actions[name];
        if (!next || next === current) return;
        next.reset().fadeIn(fadeSeconds).play();
        current?.fadeOut(fadeSeconds);
        current = next;
    }

    play("Idle", 0);

    return {
        object,
        bones,
        actions,
        play,
        update: (deltaSeconds) => mixer.update(deltaSeconds),
    };
}
