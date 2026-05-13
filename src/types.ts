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
};

export type FitActivity = {
  fileName: string;
  summary: FitSummary;
  markers: Marker[];
  series: Array<{
    name: string;
    values: Array<{ timeOffsetSeconds: number; value: number }>; 
  }>;
};
