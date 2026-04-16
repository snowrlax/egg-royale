# Ground Detection via Ray Casting

## Why Do We Need Ground Detection?

The state machine needs to know if the fish is touching the ground:
- Can't start a curl or jump unless grounded
- Airborne → land transition requires ground contact
- Recovery torque only applies when grounded
- Braking only applies when grounded

## Ray Casting Basics

A ray is a line with an origin and direction. Ray casting asks: "If I shoot a ray from here in this direction, what does it hit?"

```ts
const ray = new RAPIER.Ray(
  { x: 0, y: 2, z: 0 },    // origin
  { x: 0, y: -1, z: 0 }    // direction (downward)
);

const hit = world.castRay(
  ray,
  maxDistance,   // how far to look
  solid,         // true = hit at surface, false = pass through
  filterFlags,   // optional: exclude categories
  filterGroups,  // optional: collision group filter
  filterCollider, // optional: exclude specific collider
  filterBody     // optional: exclude specific body
);

if (hit !== null) {
  // hit.timeOfImpact = distance from origin to hit point
  // hit.collider = the collider that was hit
}
```

**Docs:** https://rapier.rs/docs/user_guides/javascript/scene_queries

## Our Ground Detection

```ts
function checkGrounded(bodyRB: RAPIER.RigidBody, world: RAPIER.World): boolean {
  const bpos = bodyRB.translation();
  const ray = new RAPIER.Ray(
    { x: bpos.x, y: bpos.y, z: bpos.z },  // from body center
    { x: 0, y: -1, z: 0 }                  // straight down
  );
  const hit = world.castRay(
    ray,
    FLOP.BODY_RADIUS + FLOP.GROUND_RAY_LENGTH,  // 0.28 + 0.15 = 0.43
    true,
    undefined,    // no filter flags
    undefined,    // no group filter
    undefined,    // no collider exclusion
    bodyRB        // EXCLUDE SELF — don't detect our own body!
  );
  return hit !== null;
}
```

### Why This Distance?

```
Body center (origin)
    │
    │  0.28m (BODY_RADIUS — the capsule extends this far down)
    │
    ▼ ── bottom of capsule collider
    │
    │  0.15m (GROUND_RAY_LENGTH — extra tolerance)
    │
    ▼ ── max ray distance
```

Total ray distance: 0.43m from body center.

The extra 0.15m tolerance ensures ground is detected even when:
- The body is slightly above the surface (bouncing)
- The surface is uneven (kitchen geometry)
- The physics step hasn't fully resolved the collision yet

### Self-Exclusion

The last parameter `bodyRB` tells the ray cast to **ignore all colliders attached to this rigid body**. Without this, the ray would immediately hit the body's own capsule collider (distance=0) and always return "grounded."

## When Is grounded Checked?

Every physics frame, BEFORE the state machine runs:
```ts
fish.grounded = checkGrounded(fish.body, world);
```

This means all state transitions see the most up-to-date ground state.

## Alternative Approaches

### Contact Events (Not Used)
Rapier can notify you when colliders touch:
```ts
collider.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
// Then check world.contactPair() each frame
```
More complex to set up. Ray casting is simpler for "am I on the ground?"

### Shape Cast (Not Used)
Instead of a thin ray, you can sweep a shape downward:
```ts
world.castShape(position, rotation, direction, shape, ...)
```
More accurate for wide characters but overkill for our spherical body.

## Reference Files

- Ground detection: `client/src/fish-flop.ts` lines 391-407
- Called at: `client/src/fish-flop.ts` line 538
- Server version: `server/src/server-fish.ts` (same pattern)
