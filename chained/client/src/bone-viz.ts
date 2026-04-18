import * as THREE from "three/webgpu";

// Bone connections — each pair is one line segment in the skeleton visualization.
// This defines the tree structure: torso is the root, limbs branch from it.
const CONNECTIONS: [string, string][] = [
    ["torso", "head"],
    ["torso", "upperArmL"], ["upperArmL", "lowerArmL"],
    ["torso", "upperArmR"], ["upperArmR", "lowerArmR"],
    ["torso", "upperLegL"], ["upperLegL", "lowerLegL"],
    ["torso", "upperLegR"], ["upperLegR", "lowerLegR"],
];

const BONE_NAMES = [
    "torso", "head",
    "upperArmL", "lowerArmL",
    "upperArmR", "lowerArmR",
    "upperLegL", "lowerLegL",
    "upperLegR", "lowerLegR",
] as const;

type BoneName = typeof BONE_NAMES[number];

export function createBoneViz(scene: THREE.Scene) {
    // All bones are direct children of a root Object3D at scene origin.
    // Since root = identity transform, bone.position IS the world position.
    // This lets us sync directly from physics without local-space math.
    const root = new THREE.Object3D();
    scene.add(root);

    const bones: Record<string, THREE.Bone> = {};
    for (const name of BONE_NAMES) {
        const bone = new THREE.Bone();
        bone.name = name;
        root.add(bone);
        bones[name] = bone;
    }

    // --- Skeleton lines ---
    // LineSegments uses pairs of vertices: [start, end, start, end, ...]
    const linePositions = new Float32Array(CONNECTIONS.length * 6); // 2 points * 3 components
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute("position", new THREE.BufferAttribute(linePositions, 3));

    const lines = new THREE.LineSegments(
        lineGeo,
        new THREE.LineBasicNodeMaterial({ color: 0xffff00 })
    );
    lines.renderOrder = 999;
    lines.material.depthTest = false;
    scene.add(lines);

    // --- Joint spheres ---
    // Small white sphere at every bone = visualizes where each joint is
    const jointMat = new THREE.MeshBasicNodeMaterial({ color: 0xffffff });
    const jointGeo = new THREE.SphereGeometry(0.07, 6, 4);
    for (const bone of Object.values(bones)) {
        const sphere = new THREE.Mesh(jointGeo, jointMat);
        sphere.renderOrder = 999;
        bone.add(sphere); // child of bone, so it follows the bone automatically
    }

    return {
        update(parts: Record<string, { body: any }>) {
            // Step 1: sync each bone position to its physics body
            for (const name of BONE_NAMES) {
                const body = parts[name]?.body;
                if (!body) continue;
                const pos = body.translation();
                bones[name].position.set(pos.x, pos.y, pos.z);
            }

            // Step 2: update line segment vertices from bone positions
            for (let i = 0; i < CONNECTIONS.length; i++) {
                const [a, b] = CONNECTIONS[i];
                const pa = bones[a].position;
                const pb = bones[b].position;
                const base = i * 6;
                linePositions[base + 0] = pa.x; linePositions[base + 1] = pa.y; linePositions[base + 2] = pa.z;
                linePositions[base + 3] = pb.x; linePositions[base + 4] = pb.y; linePositions[base + 5] = pb.z;
            }
            lineGeo.attributes.position.needsUpdate = true;
        }
    };
}
