/**
 * "Let the Orb hear you": the microphone's loudness moves the Orb, the way voice mode does in
 * the app. Audio is analysed in the browser and discarded frame by frame; nothing is recorded,
 * transcribed or sent.
 */

export function initVoiceListen(voiceOrb) {
  const button = document.querySelector("[data-listen]");
  if (!button) return;
  const label = button.querySelector("[data-listen-label]");
  const status = document.querySelector("[data-listen-status]");
  const idleStatus = status.textContent;

  if (!navigator.mediaDevices?.getUserMedia) {
    button.disabled = true;
    status.textContent = "This browser doesn't offer microphone access, so the Orb will just listen to your pointer.";
    return;
  }

  let session = null;

  async function start() {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      status.textContent = "No microphone access, and that's fine. Clark only listens when you let him.";
      return;
    }
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    context.createMediaStreamSource(stream).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    let smoothed = 0;
    let frame = 0;

    const read = () => {
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const s of samples) sum += s * s;
      const rms = Math.sqrt(sum / samples.length);
      // Speech sits around 0.02–0.2 RMS; map it onto 0..1 with a soft knee, fast up and slow down.
      const target = Math.min(1, Math.max(0, (rms - 0.008) * 7));
      smoothed += (target - smoothed) * (target > smoothed ? 0.5 : 0.08);
      voiceOrb.setLevel(smoothed);
      frame = requestAnimationFrame(read);
    };
    read();

    session = { stream, context, stop: () => cancelAnimationFrame(frame) };
    button.setAttribute("aria-pressed", "true");
    label.textContent = "Stop listening";
    status.textContent = "Listening. Say something — the Orb is hearing you, and only the Orb.";
  }

  function stop() {
    if (!session) return;
    session.stop();
    session.stream.getTracks().forEach((track) => track.stop());
    session.context.close();
    session = null;
    voiceOrb.setLevel(0);
    button.setAttribute("aria-pressed", "false");
    label.textContent = "Let the Orb hear you";
    status.textContent = idleStatus;
  }

  button.addEventListener("click", () => (session ? stop() : start()));
  // Leaving the section ends listening: a microphone should never stay open out of sight.
  new IntersectionObserver((entries) => {
    if (!entries[0].isIntersecting) stop();
  }).observe(button.closest("section"));
  document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); });
}
