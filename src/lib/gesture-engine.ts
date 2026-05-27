import type { GestureLabel } from "./types";

type Point = {
  x: number;
  y: number;
  z?: number;
};

interface GestureMatch {
  label: GestureLabel;
  confidence: number;
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
}

function angle(a: Point, b: Point, c: Point) {
  const ab = { x: a.x - b.x, y: a.y - b.y, z: (a.z ?? 0) - (b.z ?? 0) };
  const cb = { x: c.x - b.x, y: c.y - b.y, z: (c.z ?? 0) - (b.z ?? 0) };
  const dot = ab.x * cb.x + ab.y * cb.y + ab.z * cb.z;
  const mag = Math.hypot(ab.x, ab.y, ab.z) * Math.hypot(cb.x, cb.y, cb.z);

  if (!mag) {
    return 0;
  }

  return (Math.acos(Math.min(1, Math.max(-1, dot / mag))) * 180) / Math.PI;
}

function isFingerExtended(mcp: Point, pip: Point, dip: Point, tip: Point) {
  const curlAngle = angle(mcp, pip, dip) + angle(pip, dip, tip);
  return curlAngle > 300 && distance(tip, mcp) > distance(pip, mcp) * 1.25;
}

export function classifyGesture(landmarks?: Point[]): GestureMatch {
  if (!landmarks || landmarks.length < 21) {
    return {
      label: "unknown",
      confidence: 0
    };
  }

  const indexExtended = isFingerExtended(landmarks[5], landmarks[6], landmarks[7], landmarks[8]);
  const middleExtended = isFingerExtended(landmarks[9], landmarks[10], landmarks[11], landmarks[12]);
  const ringExtended = isFingerExtended(landmarks[13], landmarks[14], landmarks[15], landmarks[16]);
  const pinkyExtended = isFingerExtended(landmarks[17], landmarks[18], landmarks[19], landmarks[20]);
  const thumbSpread = distance(landmarks[4], landmarks[8]);

  if (indexExtended && middleExtended && ringExtended && pinkyExtended && thumbSpread > 0.12) {
    return {
      label: "open-palm",
      confidence: 0.92
    };
  }

  if (indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
    const indexVector = {
      x: landmarks[8].x - landmarks[5].x,
      y: landmarks[8].y - landmarks[5].y
    };
    const magnitude = Math.hypot(indexVector.x, indexVector.y);

    if (!magnitude) {
      return {
        label: "unknown",
        confidence: 0
      };
    }

    const horizontalBias = Math.abs(indexVector.x) / magnitude;
    const verticalBias = Math.abs(indexVector.y) / magnitude;

    if (horizontalBias > 0.82) {
      return {
        label: indexVector.x > 0 ? "point-right" : "point-left",
        confidence: horizontalBias
      };
    }

    if (verticalBias > 0.82) {
      return {
        label: indexVector.y < 0 ? "point-up" : "point-down",
        confidence: verticalBias
      };
    }
  }

  return {
    label: "unknown",
    confidence: 0.15
  };
}
