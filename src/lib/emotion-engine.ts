import { getMoodDescriptor } from "./constants";
import type { EmotionScanResult, MoodKey, RankedMood } from "./types";

type BlendshapeMap = Record<string, number>;

interface EmotionFrame {
  scores: Record<MoodKey, number>;
  reasons: Partial<Record<MoodKey, string[]>>;
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function average(...values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function toBlendshapeMap(categories?: Array<{ categoryName: string; score: number }>) {
  const map: BlendshapeMap = {};

  categories?.forEach((entry) => {
    map[entry.categoryName] = entry.score;
  });

  return map;
}

function captureFrame(blendshapes: BlendshapeMap): EmotionFrame {
  const smile = average(blendshapes.mouthSmileLeft ?? 0, blendshapes.mouthSmileRight ?? 0);
  const frown = average(blendshapes.mouthFrownLeft ?? 0, blendshapes.mouthFrownRight ?? 0);
  const browDown = average(blendshapes.browDownLeft ?? 0, blendshapes.browDownRight ?? 0);
  const browUp = average(blendshapes.browOuterUpLeft ?? 0, blendshapes.browOuterUpRight ?? 0);
  const browInnerUp = blendshapes.browInnerUp ?? 0;
  const eyeWide = average(blendshapes.eyeWideLeft ?? 0, blendshapes.eyeWideRight ?? 0);
  const eyeSquint = average(blendshapes.eyeSquintLeft ?? 0, blendshapes.eyeSquintRight ?? 0);
  const blink = average(blendshapes.eyeBlinkLeft ?? 0, blendshapes.eyeBlinkRight ?? 0);
  const jawOpen = blendshapes.jawOpen ?? 0;
  const mouthPress = average(blendshapes.mouthPressLeft ?? 0, blendshapes.mouthPressRight ?? 0);
  const noseSneer = average(blendshapes.noseSneerLeft ?? 0, blendshapes.noseSneerRight ?? 0);
  const mouthPucker = blendshapes.mouthPucker ?? 0;
  const mouthShrug = average(blendshapes.mouthShrugLower ?? 0, blendshapes.mouthShrugUpper ?? 0);
  const cheekRaise = average(blendshapes.cheekSquintLeft ?? 0, blendshapes.cheekSquintRight ?? 0);

  const scores: Record<MoodKey, number> = {
    euphoric: clamp(smile * 0.56 + cheekRaise * 0.14 + eyeWide * 0.12 + jawOpen * 0.1 + browUp * 0.08),
    calm: clamp((1 - browDown) * 0.32 + (1 - jawOpen) * 0.22 + (1 - eyeWide) * 0.18 + (1 - mouthPress) * 0.16 + (1 - blink) * 0.12),
    focused: clamp(eyeSquint * 0.26 + (1 - jawOpen) * 0.24 + (1 - smile) * 0.16 + mouthPucker * 0.12 + browInnerUp * 0.1 + (1 - blink) * 0.12),
    melancholic: clamp(frown * 0.38 + browInnerUp * 0.2 + mouthShrug * 0.16 + (1 - smile) * 0.12 + blink * 0.14),
    intense: clamp(browDown * 0.34 + mouthPress * 0.2 + noseSneer * 0.14 + jawOpen * 0.12 + eyeWide * 0.1 + eyeSquint * 0.1)
  };

  const reasons: Partial<Record<MoodKey, string[]>> = {
    euphoric: [],
    calm: [],
    focused: [],
    melancholic: [],
    intense: []
  };

  if (smile > 0.28) {
    reasons.euphoric?.push("strong smile signal");
  }

  if (cheekRaise > 0.22) {
    reasons.euphoric?.push("cheek lift");
  }

  if (browDown < 0.14 && jawOpen < 0.18) {
    reasons.calm?.push("low facial tension");
  }

  if (eyeSquint > 0.18 && jawOpen < 0.16) {
    reasons.focused?.push("locked-in eye posture");
  }

  if (frown > 0.16 || mouthShrug > 0.18) {
    reasons.melancholic?.push("downturned mouth cues");
  }

  if (browDown > 0.18 || mouthPress > 0.18) {
    reasons.intense?.push("tight brow and mouth tension");
  }

  return { scores, reasons };
}

export function summarizeEmotionFrames(frames: Array<{ faceBlendshapes?: Array<{ categories: Array<{ categoryName: string; score: number }> }> }>): EmotionScanResult {
  const collected = frames
    .map((frame) => frame.faceBlendshapes?.[0]?.categories)
    .filter((categories): categories is Array<{ categoryName: string; score: number }> => Boolean(categories))
    .map((categories) => captureFrame(toBlendshapeMap(categories)));

  if (collected.length === 0) {
    const fallbackMood = getMoodDescriptor("focused");

    return {
      recommendedMood: fallbackMood.key,
      moods: [
        {
          key: fallbackMood.key,
          label: fallbackMood.label,
          subtitle: fallbackMood.subtitle,
          score: 0.5,
          confidence: 0.2,
          reasons: ["no usable face frames captured"]
        }
      ],
      confidence: 0.2,
      stability: 0,
      totalFrames: 0
    };
  }

  const aggregate: Record<MoodKey, number> = {
    euphoric: 0,
    calm: 0,
    focused: 0,
    melancholic: 0,
    intense: 0
  };

  const frameTopSpread: number[] = [];
  const reasonBag: Partial<Record<MoodKey, string[]>> = {};

  collected.forEach((frame) => {
    const ranked = Object.entries(frame.scores).sort((a, b) => b[1] - a[1]) as Array<[MoodKey, number]>;
    frameTopSpread.push(ranked[0][1] - ranked[1][1]);

    (Object.keys(frame.scores) as MoodKey[]).forEach((key) => {
      aggregate[key] += frame.scores[key];
      if (!reasonBag[key]) {
        reasonBag[key] = [];
      }

      reasonBag[key]?.push(...(frame.reasons[key] ?? []));
    });
  });

  const averaged = Object.entries(aggregate).map(([key, total]) => {
    const descriptor = getMoodDescriptor(key as MoodKey);
    return {
      key: descriptor.key,
      label: descriptor.label,
      subtitle: descriptor.subtitle,
      score: total / collected.length
    };
  });

  averaged.sort((a, b) => b.score - a.score);
  const top = averaged[0];
  const second = averaged[1];
  const stability = clamp(frameTopSpread.reduce((sum, value) => sum + value, 0) / frameTopSpread.length);
  const overallConfidence = clamp(top.score * 0.68 + (top.score - second.score) * 0.42 + stability * 0.2);

  const moods: RankedMood[] = averaged.map((entry, index) => ({
    key: entry.key,
    label: entry.label,
    subtitle: entry.subtitle,
    score: entry.score,
    confidence: clamp(entry.score * 0.72 + (index === 0 ? stability * 0.18 : 0)),
    reasons: Array.from(new Set(reasonBag[entry.key] ?? [])).slice(0, 2)
  }));

  return {
    recommendedMood: top.key,
    moods,
    confidence: overallConfidence,
    stability,
    totalFrames: collected.length
  };
}
