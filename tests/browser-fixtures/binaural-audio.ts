import { createBinauralGraph } from "../../src/lib/binaural/engine";
import { defaultConfig, modes } from "../../src/lib/binaural/config";

declare global {
  interface Window {
    verifyBinauralStereo: () => Promise<
      {
        mode: string;
        beatHz: number;
        left: number;
        right: number;
        leftLeak: number;
        rightLeak: number;
      }[]
    >;
  }
}
window.verifyBinauralStereo = async () => {
  const results = [];
  for (const [mode, band] of Object.entries(modes)) {
    for (const beatHz of [...band.presets, ...(mode === "delta" ? [0.5] : [])]) {
      const context = new OfflineAudioContext(2, 96000, 48000);
      const graph = createBinauralGraph(context, {
        ...defaultConfig,
        mode: mode as keyof typeof modes,
        beatHz,
        toneVolume: 1,
      });
      graph.master.gain.value = 1;
      graph.left.start(0);
      graph.right.start(0);
      const buffer = await context.startRendering();
      const amplitude = (channel: number, frequency: number) => {
        const values = buffer.getChannelData(channel);
        let sine = 0,
          cosine = 0;
        for (let index = 0; index < values.length; index++) {
          const phase = (2 * Math.PI * frequency * index) / buffer.sampleRate;
          sine += values[index] * Math.sin(phase);
          cosine += values[index] * Math.cos(phase);
        }
        return (2 * Math.hypot(sine, cosine)) / values.length;
      };
      results.push({
        mode,
        beatHz,
        left: amplitude(0, 200),
        right: amplitude(1, 200 + beatHz),
        leftLeak: amplitude(0, 200 + beatHz),
        rightLeak: amplitude(1, 200),
      });
    }
  }
  return results;
};
