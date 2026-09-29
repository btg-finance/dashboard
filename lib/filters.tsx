'use client';

/**
 * The financial year and period chosen in the shared period bar. One
 * selection drives every page.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { FinancialYear, Period } from './types';

interface FilterState {
  fy: FinancialYear | null;
  period: Period;
  /** True once the viewer has chosen a period themselves. */
  userSet: boolean;
  setFY: (fy: FinancialYear) => void;
  setPeriod: (period: Period) => void;
  /** Called by the layout once the data's years are known. */
  setDefaultFY: (fy: FinancialYear) => void;
}

const FilterContext = createContext<FilterState | null>(null);

export function FilterProvider({ children }: { children: React.ReactNode }) {
  const [fy, setFyState] = useState<FinancialYear | null>(null);
  const [period, setPeriodState] = useState<Period>('all');
  const [userSet, setUserSet] = useState(false);
  const [defaultFY, setDefaultFY] = useState<FinancialYear | null>(null);

  useEffect(() => {
    if (fy === null && defaultFY !== null) setFyState(defaultFY);
  }, [fy, defaultFY]);

  const setFY = useCallback((next: FinancialYear) => {
    setUserSet(true);
    setFyState(next);
  }, []);
  const setPeriod = useCallback((next: Period) => {
    setUserSet(true);
    setPeriodState(next);
  }, []);

  const value = useMemo<FilterState>(() => ({ fy, period, userSet, setFY, setPeriod, setDefaultFY }), [fy, period, userSet, setFY, setPeriod]);
  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>;
}

export function useFilters(): FilterState {
  const context = useContext(FilterContext);
  if (!context) throw new Error('useFilters must be used inside FilterProvider');
  return context;
}
