'use client';

/**
 * The frame every page sits in: header, page body, footer, the details
 * drawer and the chat. Also the login gate, the single read of the sheets,
 * and the notices about anything in the sheets that needs attention.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Chat } from '@/components/chat';
import { Drawer } from '@/components/drawer';
import { Header } from '@/components/header';
import { DrawerProvider } from '@/lib/drawer';
import { useFilters } from '@/lib/filters';
import { fyLabel } from '@/lib/model';
import type { DashboardData } from '@/lib/types';
import { ApiError, useDashboard, useSession } from '@/lib/use-dashboard';
import { ModelProvider, useBuiltModel } from '@/lib/use-model';

/** What the sheets are missing, in the order it matters: wrong figures first, then incomplete ones. */
function SheetNotices({ data }: { data: DashboardData }) {
  const { missingTabs, missingColumns, skippedRows } = data;
  if (!missingTabs.length && !missingColumns.length && !skippedRows.length) return null;
  return (
    <>
      {missingTabs.length || missingColumns.length ? (
        <div className="banner bad">
          <b>The sheets are missing something the dashboard needs, so some figures below are wrong.</b>
          {missingTabs.length ? <> Missing tabs: {missingTabs.join(', ')}.</> : null}
          {missingColumns.length ? <> Missing columns: {missingColumns.map((c) => `${c.column} in ${c.tab}`).join(', ')}.</> : null}
        </div>
      ) : null}
      {skippedRows.length ? (
        <div className="banner warn">
          <b>Some rows could not be read and are left out.</b> {skippedRows.map((s) => `${s.tab}: ${s.count} ${s.count === 1 ? 'row' : 'rows'}, ${s.reason}`).join(' · ')}.
        </div>
      ) : null}
    </>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const session = useSession();
  const { data, isLoading, error, refetch } = useDashboard();
  const m = useBuiltModel(data);
  const { setDefaultFY } = useFilters();
  const [asOf, setAsOf] = useState('');

  const signedIn = session.data?.user ?? null;

  useEffect(() => {
    if (!session.isLoading && !signedIn) router.replace('/login');
  }, [session.isLoading, signedIn, router]);

  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) router.replace('/login');
  }, [error, router]);

  useEffect(() => {
    if (m) setDefaultFY(m.defaultFY);
  }, [m, setDefaultFY]);

  // The date is rendered after mount so server and browser agree.
  useEffect(() => {
    setAsOf(new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }));
  }, []);

  if (session.isLoading || !signedIn) {
    return (
      <div className="empty" style={{ padding: 60 }}>
        <p>Checking your session…</p>
      </div>
    );
  }

  return (
    <DrawerProvider>
      <Header asOf={asOf} m={m} />
      <div className="wrap">
        {isLoading ? (
          <div className="empty" style={{ padding: 60 }}>
            <i>◦</i>
            <p>Reading the sheets…</p>
          </div>
        ) : null}
        {error ? (
          <div className="banner bad">
            <b>Could not load the sheets.</b> {error.message}{' '}
            <button type="button" className="linkbtn" onClick={() => void refetch()}>
              Try again
            </button>
          </div>
        ) : null}
        {data ? <SheetNotices data={data} /> : null}
        {m ? (
          <ModelProvider model={m}>
            <div className="page on">{children}</div>
            <Drawer />
            <Chat />
          </ModelProvider>
        ) : null}
      </div>
      <div className="foot">
        <div>
          <b>
            btg<span style={{ color: 'var(--accent)' }}>.</span>
          </b>{' '}
          &nbsp;Finance · confidential
        </div>
        <div>{m ? `Source: Google Sheets · ${m.P.length} projects · ${m.FYS.length ? m.FYS.map(fyLabel).join(' – ') : 'no years'}` : ''}</div>
      </div>
    </DrawerProvider>
  );
}
