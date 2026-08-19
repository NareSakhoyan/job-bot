"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-renders the page while a run is in flight.
 *
 * Progress lives on the run row and the page is a server component, so
 * "live" is just re-asking the server. Polling stops the moment the panel
 * stops rendering this component — i.e. when nothing is RUNNING.
 */
export const RunPoller = ({ intervalMs = 2000 }: { intervalMs?: number }) => {
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(timer);
  }, [router, intervalMs]);

  return null;
};
