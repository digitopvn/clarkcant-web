/**
 * WebGL renderer for the Orb.
 *
 * Adapted from the product's renderer (packages/conversation-client/src/orb.ts): same spring,
 * same pointer mapping. Two additions for the website:
 *   - setShape() eases exposure/glow/chromatic/sheen towards new targets, so a story chapter can
 *     dim the Orb or wake it without a jump;
 *   - setLevel() feeds a 0..1 audio level into the same spring the pointer drives, so a voice
 *     demo moves the shell the way a flick of the mouse does.
 * There is no internal loop: frame() draws one frame and the caller owns the schedule.
 */

import { ORB_FRAGMENT_SHADER, ORB_PALETTE, ORB_SHAPE, ORB_VERTEX_SHADER } from "./orb-shader.js";

const UNIFORMS = [
  "u_resolution", "u_time", "u_radius", "u_exposure", "u_chromatic", "u_glow", "u_sheen",
  "u_pointer", "u_pointerStrength", "u_wobble", "u_canvas", "u_glowColor", "u_highlight",
  "u_shellMid", "u_shellEdge", "u_sheenColor", "u_colorA", "u_colorB", "u_colorC", "u_colorD",
];

const PHYSICS = { stiffness: 90, damping: 7.5 };

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) || "no compiler log";
    gl.deleteShader(shader);
    throw new Error(`orb shader did not compile: ${log}`);
  }
  return shader;
}

/** Page pointer → the shader's space (y up, x scaled by aspect), plus a proximity strength. */
export function pointerFromClient(rect, clientX, clientY, radiusShare = ORB_SHAPE.radius) {
  const width = Math.max(rect.width, 1);
  const height = Math.max(rect.height, 1);
  const u = (clientX - rect.left) / width;
  const v = 1 - (clientY - rect.top) / height;
  const distance = Math.hypot(clientX - rect.left - width / 2, clientY - rect.top - height / 2);
  const radius = (Math.min(width, height) / 2) * radiusShare;
  const strength = Math.max(0, Math.min(1, (radius * 2.4 - distance) / (radius * 1.6)));
  return { x: (u - 0.5) * 2 * (width / height), y: (v - 0.5) * 2, strength };
}

/**
 * @returns {{ok: true, renderer: object} | {ok: false, reason: string}}
 */
export function createOrbRenderer(canvas, options = {}) {
  const gl = canvas.getContext("webgl", {
    alpha: true, premultipliedAlpha: true, antialias: true, depth: false, stencil: false,
    powerPreference: "low-power",
  });
  if (!gl) return { ok: false, reason: "WebGL is not available" };

  let program;
  try {
    const vs = compile(gl, gl.VERTEX_SHADER, ORB_VERTEX_SHADER);
    const fs = compile(gl, gl.FRAGMENT_SHADER, ORB_FRAGMENT_SHADER);
    program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("orb program did not link");
  } catch (error) {
    return { ok: false, reason: String(error.message || error) };
  }

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "a_position");
  const loc = Object.fromEntries(UNIFORMS.map((name) => [name, gl.getUniformLocation(program, name)]));

  const palette = { ...ORB_PALETTE, ...(options.palette || {}) };
  const shape = { ...ORB_SHAPE, ...(options.shape || {}) };
  const target = { ...shape };
  const speed = options.speed ?? 1.23;
  const maxRatio = options.maxPixelRatio ?? 2;

  const pointer = { x: 0, y: 0, target: 0, strength: 0 };
  let level = 0;
  let wobble = 0;
  let wobbleVelocity = 0;
  let lastX = 0;
  let lastY = 0;
  let lastMs;
  let lost = false;
  let disposed = false;

  const onLost = (event) => { event.preventDefault(); lost = true; };
  const onRestored = () => { lost = false; };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);

  const vec3 = (name, value) => gl.uniform3f(loc[name], value[0], value[1], value[2]);

  function frame(timeMs, snap = false) {
    if (disposed || lost) return;
    const dt = lastMs === undefined ? 0 : Math.min(Math.max((timeMs - lastMs) / 1000, 0), 0.1);
    lastMs = timeMs;

    // Shape eases towards its target; a zero dt (first or single frame) lands on it directly.
    const shapeEase = dt === 0 || snap ? 1 : 1 - Math.exp(-dt / 0.45);
    for (const key of ["exposure", "chromatic", "glow", "sheen", "radius"]) {
      shape[key] += (target[key] - shape[key]) * shapeEase;
    }

    const ease = dt === 0 ? 1 : 1 - Math.exp(-dt / 0.1);
    pointer.strength += (pointer.target - pointer.strength) * ease;
    const travelled = Math.hypot(pointer.x - lastX, pointer.y - lastY);
    lastX = pointer.x;
    lastY = pointer.y;
    const travelSpeed = dt > 0 ? travelled / dt : 0;

    // Underdamped spring: overshoot and ring is what makes the shell read as jelly.
    const push = Math.min(0.6, travelSpeed * 0.1) * pointer.target + level * 0.55;
    wobbleVelocity += ((push - wobble) * PHYSICS.stiffness - wobbleVelocity * PHYSICS.damping) * dt;
    wobble += wobbleVelocity * dt;
    if (wobble > 1 || wobble < -1) { wobble = Math.sign(wobble); wobbleVelocity = 0; }

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    gl.uniform2f(loc.u_resolution, canvas.width, canvas.height);
    gl.uniform1f(loc.u_time, (timeMs / 1000) * speed);
    gl.uniform1f(loc.u_radius, shape.radius);
    gl.uniform1f(loc.u_exposure, shape.exposure + level * 1.4);
    gl.uniform1f(loc.u_chromatic, shape.chromatic);
    gl.uniform1f(loc.u_glow, shape.glow + level * 0.25);
    gl.uniform1f(loc.u_sheen, shape.sheen);
    gl.uniform2f(loc.u_pointer, pointer.x, pointer.y);
    gl.uniform1f(loc.u_pointerStrength, pointer.strength);
    gl.uniform1f(loc.u_wobble, wobble);
    for (const key of Object.keys(ORB_PALETTE)) {
      vec3(`u_${key}`, palette[key]);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  return {
    ok: true,
    renderer: {
      frame,
      /** True while the shell is still ringing or a shape is still easing: worth another frame. */
      isSettling() {
        const easing = Object.keys(target).some((k) => Math.abs(target[k] - shape[k]) > 0.002);
        return easing || Math.abs(wobble) > 0.002 || Math.abs(wobbleVelocity) > 0.002 || level > 0.002;
      },
      setPointer(sample) {
        pointer.x = sample.x;
        pointer.y = sample.y;
        pointer.target = Math.max(0, Math.min(1, sample.strength));
      },
      setShape(next) { Object.assign(target, next); },
      setLevel(value) { level = Math.max(0, Math.min(1, value)); },
      setCanvasColor(rgb) { palette.canvas = rgb; },
      resize() {
        const rect = canvas.getBoundingClientRect();
        const ratio = Math.min(window.devicePixelRatio || 1, maxRatio);
        const w = Math.max(1, Math.round(rect.width * ratio));
        const h = Math.max(1, Math.round(rect.height * ratio));
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        canvas.removeEventListener("webglcontextlost", onLost);
        canvas.removeEventListener("webglcontextrestored", onRestored);
        gl.deleteBuffer(quad);
        gl.deleteProgram(program);
      },
    },
  };
}
