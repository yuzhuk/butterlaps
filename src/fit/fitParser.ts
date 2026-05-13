import type { FitActivity } from '../types';

export async function parseFitFile(file: File): Promise<FitActivity> {
  if (!file.name.toLowerCase().endsWith('.fit')) {
    throw new Error('Only .fit files are supported.');
  }

  const buffer = await file.arrayBuffer();
  if (buffer.byteLength === 0) {
    throw new Error('The uploaded FIT file is empty or corrupted.');
  }

  // TODO: Replace this placeholder parser with a real FIT parsing/writing implementation.
  // The parser must preserve unknown messages, developer/vendor fields, and export only lap edits.
  return {
    fileName: file.name,
    summary: {
      durationSeconds: 3600,
      distanceMeters: 10000,
      hasHeartRate: true,
      hasPower: false,
      hasCadence: true,
    },
    markers: [
      { timeOffsetSeconds: 0, label: 'Start' },
      { timeOffsetSeconds: 900, label: 'Lap 1' },
      { timeOffsetSeconds: 1800, label: 'Lap 2' },
      { timeOffsetSeconds: 2700, label: 'Lap 3' },
      { timeOffsetSeconds: 3600, label: 'Finish' },
    ],
    series: [
      {
        name: 'Elevation',
        values: Array.from({ length: 61 }, (_, index) => ({
          timeOffsetSeconds: index * 60,
          value: 200 + Math.sin(index / 6) * 25,
        })),
      },
      {
        name: 'Heart Rate',
        values: Array.from({ length: 61 }, (_, index) => ({
          timeOffsetSeconds: index * 60,
          value: 135 + Math.sin(index / 8) * 10,
        })),
      },
    ],
  };
}
