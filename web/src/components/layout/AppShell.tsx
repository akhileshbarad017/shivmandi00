import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, m } from 'motion/react';
import BottomNav from './BottomNav';
import MoreSheet from './MoreSheet';
import Sidebar from './Sidebar';
import { pageVariants } from '@/lib/motion';

export default function AppShell() {
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="min-h-dvh">
      <Sidebar />
      <div className="lg:pl-72">
        <main className="mx-auto w-full max-w-7xl px-4 pb-[calc(var(--bottom-offset)+3.5rem)] pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 lg:pb-10 lg:pt-6">
          <AnimatePresence mode="wait" initial={false}>
            <m.div key={location.pathname} variants={pageVariants} initial="initial" animate="animate" exit="exit">
              <Outlet />
            </m.div>
          </AnimatePresence>
        </main>
      </div>
      <BottomNav onMore={() => setMoreOpen(true)} />
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </div>
  );
}
