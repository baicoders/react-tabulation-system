/** Results may only be combined if both their unit and ranking direction agree. */
export interface Measurement {
  unit: 'SCORED_POINTS' | 'RANK_POINTS' | 'PAIR_VOTE_OUTCOMES';
  direction: 'asc' | 'desc';
}

export const SCORED_POINTS: Measurement = { unit: 'SCORED_POINTS', direction: 'desc' };

export class IncompatibleMeasurementsError extends Error {
  constructor() {
    super('Votes and scores are different units — no conversion rule exists. Results must use the same unit and ranking direction.');
    this.name = 'IncompatibleMeasurementsError';
  }
}

export function assertCompatibleMeasurements(measurements: Measurement[]): void {
  if (measurements.some((m) => m.unit !== measurements[0]?.unit || m.direction !== measurements[0]?.direction)) {
    throw new IncompatibleMeasurementsError();
  }
}
