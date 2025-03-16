import { TopNav } from "@/components/TopNav";
import { Toaster } from "@/components/Toast";
import { NavBottom } from "@/components/NavBottom";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/SideNav";

export function SideNavWithTopNav({
  children,
  defaultOpen,
}: {
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar />
      <SidebarInset className="overflow-hidden bg-slate-50 dark:bg-black">
        <TopNav trigger={<SidebarTrigger className="sm:-ml-4" />} />
        <Toaster closeButton richColors theme="light" visibleToasts={9} />
        {children}
        <div
          className="md:hidden md:pt-0"
          style={{ paddingTop: "calc(env(safe-area-inset-bottom) + 1rem)" }}
        >
          <NavBottom />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
