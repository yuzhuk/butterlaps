export type Marker = {
  timeOffsetSeconds: number;
  label: string;
};

export type FitSummary = {
  durationSeconds: number;
  distanceMeters: number;
  hasHeartRate: boolean;
  hasPower: boolean;
  hasCadence: boolean;
  activityType: string;
  startTime: number | null;
};

export type FitActivity = {
  fileName: string;
  summary: FitSummary;
  markers: Marker[];
  recordTimestamps: number[];
  series: Array<{
    name: string;
    values: Array<{ timeOffsetSeconds: number; value: number }>;
  }>;
  rawFitPayload: ArrayBuffer;
};
