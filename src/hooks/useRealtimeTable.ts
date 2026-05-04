import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

export type RealtimeFilter = {
  /** Postgres column to filter on (e.g. 'project_id'). Optional — omit to receive all rows for the table. */
  column?: string;
  /** Value to match. */
  value?: string | number;
};

type Handlers = {
  onUpsert?: (row: any) => void;
  onDelete?: (row: any) => void;
};

type Options = {
  /** Public schema table name (e.g. 'ms_generations'). */
  table: string;
  /** Optional server-side filter. If omitted, all changes for the table are streamed. */
  filter?: RealtimeFilter;
  /** Stable channel key — used to dedupe and as the channel name. */
  channelKey: string;
  /** Enable / disable the subscription without unmounting. */
  enabled?: boolean;
};

/**
 * Subscribe to Supabase Realtime postgres_changes for a table with automatic
 * reconnection. Reconnects on:
 *   - channel CHANNEL_ERROR / TIMED_OUT / CLOSED (exponential backoff, capped)
 *   - browser regaining network (`online`)
 *   - tab becoming visible again (`visibilitychange`)
 *
 * The hook ensures only one active channel per `channelKey` per mount.
 */
export function useRealtimeTable({ table, filter, channelKey, enabled = true }: Options, handlers: Handlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!enabled) return;

    let channel: RealtimeChannel | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    let disposed = false;

    const cleanupChannel = () => {
      if (channel) {
        try { supabase.removeChannel(channel); } catch { /* ignore */ }
        channel = null;
      }
    };

    const scheduleReconnect = () => {
      if (disposed) return;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      // Exponential backoff: 1s, 2s, 4s, 8s, capped at 15s.
      const delay = Math.min(15000, 1000 * Math.pow(2, Math.min(attempts, 4)));
      attempts += 1;
      reconnectTimer = setTimeout(() => {
        cleanupChannel();
        connect();
      }, delay);
    };

    const connect = () => {
      if (disposed) return;
      const filterStr = filter?.column && filter.value !== undefined
        ? `${filter.column}=eq.${filter.value}`
        : undefined;

      channel = supabase
        .channel(channelKey)
        .on(
          // @ts-ignore — runtime supports 'postgres_changes' event name
          'postgres_changes',
          { event: '*', schema: 'public', table, ...(filterStr ? { filter: filterStr } : {}) },
          (payload: RealtimePostgresChangesPayload<any>) => {
            const row = (payload.new ?? payload.old) as any;
            if (!row?.id) return;
            if (payload.eventType === 'DELETE') {
              handlersRef.current.onDelete?.(row);
            } else {
              handlersRef.current.onUpsert?.(row);
            }
          },
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            attempts = 0; // reset backoff on healthy connection
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            scheduleReconnect();
          }
        });
    };

    const onOnline = () => {
      attempts = 0;
      cleanupChannel();
      connect();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        // Tab is back in foreground — re-establish channel to avoid the stale-socket problem.
        attempts = 0;
        cleanupChannel();
        connect();
      }
    };

    connect();
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisibility);
      cleanupChannel();
    };
  }, [table, filter?.column, filter?.value, channelKey, enabled]);
}
