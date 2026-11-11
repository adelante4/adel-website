// Runs on the audio thread. Collects the microphone (input 0) and what the page sends to the speakers
// (input 1), sample for sample on the same clock, and posts them in blocks with the frame they start at.
class Tap extends AudioWorkletProcessor {
  constructor() {
    super();
    this.size = 2048;
    this.mic = new Float32Array(this.size);
    this.ref = new Float32Array(this.size);
    this.n = 0;
    this.start = 0;
  }
  process(inputs) {
    const m = inputs[0] && inputs[0][0];
    const r = inputs[1] && inputs[1][0];
    const len = (m || r || { length: 128 }).length;
    if (this.n === 0) this.start = currentFrame;
    for (let i = 0; i < len; i++) {
      this.mic[this.n] = m ? m[i] : 0;
      this.ref[this.n] = r ? r[i] : 0;
      if (++this.n === this.size) {
        this.port.postMessage({ start: this.start, mic: this.mic, ref: this.ref });
        this.mic = new Float32Array(this.size);
        this.ref = new Float32Array(this.size);
        this.n = 0;
        this.start = currentFrame + i + 1;
      }
    }
    return true;
  }
}
registerProcessor("tap", Tap);
