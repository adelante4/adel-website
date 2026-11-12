// Opens the microphone and feeds it, together with the page's own output, to a listener. Browser only.
// The browser's own voice processing is switched off: echo cancelling, noise suppression and automatic gain
// are made for speech and would move and reshape note attacks.

/**
 * @param {AudioContext} ctx
 * @param {AudioNode} output  the node that feeds the speakers (the reference)
 * @param {(block:{start:number, mic:Float32Array, ref:Float32Array})=>void} onBlock
 */
export async function openMic(ctx, output, onBlock, { deviceId = null, source: given = null } = {}) {
  // The bench hands in a node in place of a microphone, so the room it simulates has an exact delay.
  if (given) return attach(ctx, output, onBlock, given, null);
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser cannot open the microphone.");
  if (!ctx.audioWorklet) throw new Error("This browser cannot run the listener (no AudioWorklet).");
  const audio = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 };
  if (deviceId) audio.deviceId = { exact: deviceId };
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio });
  } catch (err) {
    const name = err && err.name;
    if (name === "NotAllowedError") throw new Error("The microphone was not allowed. Allow it for this page in the browser's site settings.");
    if (name === "NotFoundError") throw new Error("No microphone was found.");
    throw new Error("The microphone could not be opened.");
  }
  return attach(ctx, output, onBlock, ctx.createMediaStreamSource(stream), stream);
}

async function attach(ctx, output, onBlock, source, stream) {
  if (!ctx.audioWorklet) throw new Error("This browser cannot run the listener (no AudioWorklet).");
  await ctx.audioWorklet.addModule(new URL("./tap-worklet.js?v=20261112a", import.meta.url));
  const node = new AudioWorkletNode(ctx, "tap", { numberOfInputs: 2, numberOfOutputs: 1, channelCount: 1, channelCountMode: "explicit", channelInterpretation: "speakers" });
  node.port.onmessage = (e) => onBlock(e.data);
  source.connect(node, 0, 0);
  output.connect(node, 0, 1);
  // A node that leads nowhere may not be run. A silent path to the speakers keeps it running.
  const mute = ctx.createGain();
  mute.gain.value = 0;
  node.connect(mute);
  mute.connect(ctx.destination);
  const track = stream ? stream.getAudioTracks()[0] : null;
  const settings = track && track.getSettings ? track.getSettings() : {};
  return {
    label: (track && track.label) || "Microphone",
    inputLatency: typeof settings.latency === "number" ? settings.latency : 0,
    processed: settings.echoCancellation === true || settings.noiseSuppression === true || settings.autoGainControl === true,
    close() {
      try {
        node.port.onmessage = null;
        source.disconnect();
        output.disconnect(node, 0, 1);
        node.disconnect();
        mute.disconnect();
      } catch {}
      if (stream) stream.getTracks().forEach((t) => t.stop());
    },
  };
}
