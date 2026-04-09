import RAPIER from "@dimforge/rapier3d/rapier.js";

async function boot() {
  await RAPIER.init();
  const { initFlopSandbox } = await import("./fish-flop.js");
  const container = document.getElementById("app");
  if (!container) throw new Error("missing #app container");
  await initFlopSandbox(container);
}

boot().catch((err) => {
  console.error("failed to boot:", err);
  document.body.textContent = `Boot error: ${err.message}`;
});
