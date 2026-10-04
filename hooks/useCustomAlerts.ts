import { useCallback, useEffect, useState } from 'react';
import {
  loadCustomAlerts,
  newCustomRuleId,
  saveCustomAlerts,
  MAX_CUSTOM_ALERTS,
} from '../utils/customAlerts';
import type { CustomAlertRule, CustomMetric, CustomOp } from '../utils/customAlerts';

/**
 * The user's custom alert rules (Settings -> Alerts): load once on mount,
 * mutate in-memory, persist through saveCustomAlerts (which validates and
 * caps at MAX_CUSTOM_ALERTS, evicting the oldest).
 */
export function useCustomAlerts() {
  const [rules, setRules] = useState<CustomAlertRule[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await loadCustomAlerts();
      if (!cancelled) {
        setRules(stored);
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const addRule = useCallback(
    (metric: CustomMetric, op: CustomOp, value: number, note?: string) => {
      const rule: CustomAlertRule = { id: newCustomRuleId(), metric, op, value, enabled: true };
      if (note && note.trim()) rule.note = note.trim();
      // Cap: adding past MAX_CUSTOM_ALERTS evicts the OLDEST (first created).
      const next = [...rules, rule].slice(-MAX_CUSTOM_ALERTS);
      setRules(next);
      void saveCustomAlerts(next);
    },
    [rules],
  );

  const setNote = useCallback(
    (id: string, note: string) => {
      const next = rules.map((rule) => {
        if (rule.id !== id) return rule;
        const trimmed = note.trim();
        // Empty note = back to the generic template (field removed, not blank).
        if (!trimmed) {
          const { note: _dropped, ...rest } = rule;
          return rest;
        }
        return { ...rule, note: trimmed };
      });
      setRules(next);
      void saveCustomAlerts(next);
    },
    [rules],
  );

  const toggleRule = useCallback(
    (id: string) => {
      const next = rules.map((rule) =>
        rule.id === id ? { ...rule, enabled: !rule.enabled } : rule,
      );
      setRules(next);
      void saveCustomAlerts(next);
    },
    [rules],
  );

  const deleteRule = useCallback(
    (id: string) => {
      const next = rules.filter((rule) => rule.id !== id);
      setRules(next);
      void saveCustomAlerts(next);
    },
    [rules],
  );

  return { rules, ready, addRule, toggleRule, deleteRule, setNote };
}