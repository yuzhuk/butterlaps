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
  subSport?: string;
  startTime: number | null;
  device?: string;
  deviceApp?: string;
};

export type FitActivity = {
  fileName: string;
  summary: FitSummary;
  markers: Marker[];
  recordTimestamps: number[];
  series: Array<{
    name: string;
    values: Array<{ timeOffsetSeconds: number; value: number | null }>;
  }>;
  unshownSeries: string[];
  lapDevFields: string[];
  rawFitPayload: ArrayBuffer;
};
