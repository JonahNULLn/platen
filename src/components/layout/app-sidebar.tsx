"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { navSections } from "@/components/layout/nav-config";
import { OrgSwitcher } from "@/components/layout/org-switcher";
import { UserMenu } from "@/components/layout/user-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

function isActive(currentPath: string, href: string) {
  const target = href.split("?")[0] ?? href;
  if (target === currentPath) return true;
  if (currentPath.startsWith(`${target}/`)) return true;
  return false;
}

type UserInfo = {
  name: string;
  email: string;
  initials: string;
  avatarUrl: string | null;
};

export type OrgInfo = {
  id: string;
  name: string;
  logoUrl: string | null;
  subscriptionPlan: string;
};

export function AppSidebar({
  user,
  orgs,
  activeOrgId,
}: {
  user: UserInfo;
  orgs: OrgInfo[];
  activeOrgId: string | null;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentQuery = searchParams.toString();
  const { setOpenMobile } = useSidebar();

  // On mobile the sidebar is a drawer over the page. Close it once a link's
  // page has loaded (the route changed), so you actually see where you went.
  // Keyed on the location only — never on the open state, or it would shut
  // the moment it opens. Harmless on desktop (openMobile is already false).
  // biome-ignore lint/correctness/useExhaustiveDependencies: run on navigation only
  useEffect(() => {
    setOpenMobile(false);
  }, [pathname, currentQuery]);

  /** Tapping the page you're already on doesn't navigate, so close directly. */
  function closeIfCurrent(href: string) {
    const here = currentQuery ? `${pathname}?${currentQuery}` : pathname;
    if (href === here) setOpenMobile(false);
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <OrgSwitcher orgs={orgs} activeOrgId={activeOrgId} />
      </SidebarHeader>
      <SidebarContent>
        {navSections.map((section) => (
          <SidebarGroup key={section.label}>
            <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active = item.noActive ? false : isActive(pathname, item.href);

                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.label}
                        className="hover:bg-sidebar-accent/50 data-[active=true]:bg-sidebar-accent"
                      >
                        <Link href={item.href} onClick={() => closeIfCurrent(item.href)}>
                          <Icon />
                          <span>{item.label}</span>
                          {item.children ? (
                            <ChevronRight
                              className={cn(
                                "ml-auto size-3.5 opacity-60 transition-transform duration-200 ease-out",
                                active && "rotate-90",
                              )}
                            />
                          ) : null}
                        </Link>
                      </SidebarMenuButton>
                      {/* Sub-items stay mounted and animate open/closed via a
                          grid-rows transition so they don't just pop in. */}
                      {item.children ? (
                        <div
                          className={cn(
                            "grid transition-[grid-template-rows] duration-200 ease-out",
                            active ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                          )}
                        >
                          <div
                            className={cn(
                              "overflow-hidden transition-opacity duration-200 ease-out",
                              active ? "opacity-100" : "pointer-events-none opacity-0",
                            )}
                          >
                            <SidebarMenuSub>
                              {item.children.map((child) => (
                                <SidebarMenuSubItem key={child.href}>
                                  <SidebarMenuSubButton
                                    asChild
                                    isActive={
                                      `${pathname}${currentQuery ? `?${currentQuery}` : ""}` ===
                                      child.href
                                    }
                                  >
                                    <Link
                                      href={child.href}
                                      onClick={() => closeIfCurrent(child.href)}
                                    >
                                      {child.label}
                                    </Link>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              ))}
                            </SidebarMenuSub>
                          </div>
                        </div>
                      ) : null}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <UserMenu user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
