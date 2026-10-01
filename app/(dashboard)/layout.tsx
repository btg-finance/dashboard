'use client';

/**
 * The frame every page sits in: header, page body, footer, the details
 * drawer and the chat. Also the login gate, the check that this person may
 * open the page, the single read of the sheets, and the notices about
 * anything in the sheets that needs attention.
 */

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Chat } from '@/components/chat';
import { Drawer } from '@/components/drawer';
import { Header } from '@/components/header';
import { homeFor, pageOfPath } from '@/lib/access';
import { DrawerProvider } from '@/lib/drawer';
import { useFilters } from '@/lib/filters';
import { fyLabel } from '@/lib/model';
import type { DashboardData } from '@/lib/types';
import { ApiError, useAccess, useDashboard, useSession } from '@/lib/use-dashboard';
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
  const pathname = usePathname();
  const session = useSession();
  const access = useAccess();
  const { data, isLoading, error, refetch } = useDashboard();
  const m = useBuiltModel(data);
  const { setDefaultFY } = useFilters();
  const [asOf, setAsOf] = useState('');

  const signedIn = session.data?.user ?? null;
  const page = pageOfPath(pathname);
  const mayOpen = page !== null && access.pages.includes(page);
  const home = homeFor(access);

  useEffect(() => {
    if (!session.isLoading && !signedIn) router.replace('/login');
  }, [session.isLoading, signedIn, router]);

  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) router.replace('/login');
  }, [error, router]);

  // Someone who may not open this page is sent to the first one they may.
  useEffect(() => {
    if (signedIn && !mayOpen && home) router.replace(home);
  }, [signedIn, mayOpen, home, router]);

  // People who may not export cannot print the page to a file either.
  useEffect(() => {
    document.body.classList.toggle('no-export', !access.canExport);
    return () => document.body.classList.remove('no-export');
  }, [access.canExport]);

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
        {!home ? (
          <div className="banner warn">
            <b>Your access does not include any page yet.</b> Ask the dashboard&apos;s owner to choose the pages you may open.
          </div>
        ) : null}
        {data && mayOpen ? <SheetNotices data={data} /> : null}
        {m && mayOpen ? (
          <ModelProvider model={m}>
            <div className="page on">{children}</div>
            <Drawer />
            {access.chat ? <Chat /> : null}
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
