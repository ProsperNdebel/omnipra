"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function SavedNotice({ name }: { name: string }) {
  const [visible, setVisible] = useState(true);
  const pathname = usePathname();
  const router = useRouter();
  const search = useSearchParams();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setVisible(false);
      const params = new URLSearchParams(search.toString());
      params.delete("saved");
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    }, 3000);

    return () => window.clearTimeout(timer);
  }, [pathname, router, search]);

  if (!visible) return null;
  return <p>Saved. {name} will use these changes going forward.</p>;
}
