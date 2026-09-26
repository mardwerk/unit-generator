import type { ReactNode } from 'react';

/**
 * The unit page: references on the left, the sheet in the middle and the
 * stages on the right. Below 851px the stages sit beside the sheet with the
 * references underneath; below 601px everything stacks.
 */
export function UnitWorkspace({
  gallery,
  workflow,
  children,
}: {
  gallery: ReactNode;
  workflow: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="flex flex-col sm:grid sm:min-h-[calc(100dvh-70px)] sm:grid-cols-[minmax(0,1fr)_220px] sm:items-start md:grid-cols-[180px_minmax(0,1fr)_210px] lg:grid-cols-[clamp(220px,18vw,360px)_minmax(0,1fr)_290px]">
      <div className="order-2 w-full min-w-0 px-[18px] py-6 empty:hidden sm:order-none sm:col-start-1 sm:row-start-2 sm:p-6 md:sticky md:top-[70px] md:row-start-1 md:px-3.5 md:py-[22px] lg:px-6 lg:py-8">
        {gallery}
      </div>
      <div className="sheet-column order-1 w-full min-w-0 px-[18px] py-6 sm:order-none sm:col-start-1 sm:row-start-1 sm:px-[22px] sm:pt-7 sm:pb-[60px] md:col-start-2 lg:px-[clamp(24px,3.5vw,64px)] lg:pt-8 lg:pb-[70px]">
        {children}
      </div>
      <div className="order-3 flex w-full min-w-0 flex-col px-[18px] py-6 sm:sticky sm:top-[70px] sm:order-none sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:min-h-[calc(100dvh-70px)] sm:px-3.5 sm:py-[22px] md:col-start-3 md:row-span-1 lg:px-6 lg:py-8">
        {workflow}
      </div>
    </main>
  );
}
