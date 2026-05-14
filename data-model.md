# Data Model (Draft)

This document defines the first draft of the core data model for the `ButterLaps` application.

## Goals

- Represent laps as marker boundaries rather than explicit lap objects.
- Preserve raw FIT data while exposing a safe editing model.
- Keep chart series and lap marker metadata separate from FIT export internals.
- Support editing, snapping, and re-derivation of lap summaries.

## Core Types

### `Marker`
A boundary marker that defines a lap edge.

```ts
export type Marker = {
  id: string;
  timeOffsetSeconds: number;
  label: string;
  isStart?: boolean;
  isFinish?: boolean;
};
```

- `id`: stable unique identifier for the marker.
- `timeOffsetSeconds`: position relative to activity start.
- `label`: user-facing text such as `Start`, `Lap 1`, `Lap 2`, `Finish`.
- `isStart` / `isFinish`: optional semantic hints.

### `Lap`
Derived from adjacent boundary markers.

```ts
export type Lap = {
  id: string;
  startMarkerId: string;
  endMarkerId: string;
  durationSeconds: number;
  distanceMeters: number | null;
  averagePaceSecondsPerKm: number | null;
  averageHeartRate: number | null;
  averagePower: number | null;
  averageCadence: number | null;
};
```

- `Lap` objects are computed from `Marker[]` and raw sample data.
- The model never stores laps as primary state, only derives them.

### `SeriesPoint`
A single sample value in a time series.

```ts
export type SeriesPoint = {
  timeOffsetSeconds: number;
  value: number;
};
```

### `Series`
A time series for chart rendering.

```ts
export type Series = {
  id: string;
  name: string;
  type: 'elevation' | 'pace' | 'heartRate' | 'power' | 'cadence';
  visible: boolean;
  values: SeriesPoint[];
};
```

- `type` identifies the data series semantics.
- `visible` controls chart toggles.

### `FitSummary`
Basic activity summary data.

```ts
export type FitSummary = {
  durationSeconds: number;
  distanceMeters: number;
  hasHeartRate: boolean;
  hasPower: boolean;
  hasCadence: boolean;
  activityType: string;
};
```

### `FitActivity`
The edited activity model exposed to the UI.

```ts
export type FitActivity = {
  fileName: string;
  summary: FitSummary;
  markers: Marker[];
  series: Series[];
  rawFitPayload: ArrayBuffer | null;
  originalMarkers?: Marker[];
};
```

- `rawFitPayload` retains the original FIT file bytes for export and integrity-preserving rewrite.
- `originalMarkers` can be used for undo/compare operations.

## Additional model concepts

### `FitExportPayload`
A payload used by the export layer.

```ts
export type FitExportPayload = {
  rawFitPayload: ArrayBuffer;
  markers: Marker[];
};
```

### `MarkerEditAction`
A representation of user edits in the editor.

```ts
export type MarkerEditAction =
  | { type: 'add'; marker: Marker }
  | { type: 'move'; markerId: string; newTimeOffsetSeconds: number }
  | { type: 'delete'; markerId: string }
  | { type: 'merge'; markerId: string; targetMarkerId: string };
```

## Invariants

- Markers must always be ordered by `timeOffsetSeconds`.
- The first marker should represent the activity start and the last marker should represent finish.
- No two markers may occupy the same exact timestamp.
- Derived laps are recomputed from marker boundary order, not stored directly.

## Notes

- The UI works with a marker-first model so drag, insert, and delete operations are simpler.
- FIT export should use the preserved raw payload and only update the lap marker records.
- This draft is intentionally minimal to support the v0.1 POC requirements.
