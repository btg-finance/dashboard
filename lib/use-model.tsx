'use client';

/**
 * What every page reads: the model built from the sheets, plus the active
 * year and period. The model is built once, by the layout, and shared.
 */

import { createContext, useContext, useMemo } from 'react';
import { useFilters } from './filters';
import { buildModel, type Model } from './model';
import type { DashboardData, FinancialYear, Period } from './types';

export interface View {
  m: Model;
  fy: FinancialYear;
  period: Period;
}

const ModelContext = createContext<Model | null>(null);

/** Builds the model from a payload, or null while there is none yet. */
export function useBuiltModel(data: DashboardData | undefined): Model | null {
  return useMemo(() => (data ? buildModel(data) : null), [data]);
}

export function ModelProvider({ model, children }: { model: Model; children: React.ReactNode }) {
  return <ModelContext.Provider value={model}>{children}</ModelContext.Provider>;
}

export function useModel(): Model {
  const model = useContext(ModelContext);
  if (!model) throw new Error('useModel must be used inside ModelProvider');
  return model;
}

/** The model with the current selection. */
export function useView(): View {
  const m = useModel();
  const { fy, period } = useFilters();
  return { m, fy: fy ?? m.defaultFY, period };
}
