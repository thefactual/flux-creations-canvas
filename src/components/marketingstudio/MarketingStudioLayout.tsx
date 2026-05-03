import { useEffect, useState } from 'react';
import { Sidebar } from './Sidebar';
import { TopHeader } from './TopHeader';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { hydrateMarketingStudio } from '@/lib/marketingStudioSync';

export function MarketingStudioLayout({
  showBack,
  title,
  rightSlot,
  children,
}: {
  showBack?: boolean;
  title?: string;
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  // Pull projects + generations from the DB on mount so refresh / new device works.
  useEffect(() => {
    hydrateMarketingStudio();
  }, []);

  return (
    <div className="h-screen w-screen ms-grid-bg text-foreground flex overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden md:flex h-full">
        <Sidebar />
      </div>
      {/* Mobile sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-72 bg-ms-surface border-ms-border">
          <Sidebar onClose={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex-1 flex flex-col min-w-0">
        <TopHeader onMenu={() => setMobileOpen(true)} showBack={showBack} title={title} rightSlot={rightSlot} />
        <main className="flex-1 overflow-y-auto ms-scroll relative">{children}</main>
      </div>
    </div>
  );
}
