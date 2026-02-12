export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface DiagnosticLog {
  id: string;
  ts: string;
  level: LogLevel;
  category: string;
  message: string;
  meta?: string;
}

const LOG_KEY = 'diagnostic_logs';
const MAX_LOGS = 500;

function shouldAlwaysLog(level: LogLevel): boolean {
  return level === 'warn' || level === 'error';
}

export async function logDiagnostic(
  level: LogLevel,
  category: string,
  message: string,
  meta?: unknown
): Promise<void> {
  try {
    const { verbose_logging } = await chrome.storage.sync.get('verbose_logging');
    const verbose = Boolean(verbose_logging);

    if (!verbose && !shouldAlwaysLog(level)) {
      return;
    }

    const result = await chrome.storage.local.get(LOG_KEY);
    const logs: DiagnosticLog[] = (result[LOG_KEY] as DiagnosticLog[] | undefined) || [];

    const entry: DiagnosticLog = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      ts: new Date().toISOString(),
      level,
      category,
      message,
      meta: meta ? JSON.stringify(meta) : undefined,
    };

    logs.push(entry);
    if (logs.length > MAX_LOGS) {
      logs.splice(0, logs.length - MAX_LOGS);
    }

    await chrome.storage.local.set({ [LOG_KEY]: logs });
  } catch {
    // Diagnostics should never break core workflows.
  }
}

export async function getDiagnosticLogs(limit = 200): Promise<DiagnosticLog[]> {
  const result = await chrome.storage.local.get(LOG_KEY);
  const logs: DiagnosticLog[] = (result[LOG_KEY] as DiagnosticLog[] | undefined) || [];
  return logs.slice(-limit).reverse();
}

export async function clearDiagnosticLogs(): Promise<void> {
  await chrome.storage.local.set({ [LOG_KEY]: [] });
}
