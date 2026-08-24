"use client";

import { useEffect, useState, type ComponentProps } from "react";
import { AdminDashboard } from "@/components/admin-dashboard";
import { MetaTemplateEnhancer } from "@/components/meta-template-enhancer";

export function AdminDashboardClient(props: ComponentProps<typeof AdminDashboard>) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div aria-hidden="true" style={{ minHeight: "100vh" }} />;
  }

  return <><AdminDashboard {...props} /><MetaTemplateEnhancer /></>;
}
