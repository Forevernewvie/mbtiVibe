/**
 * Structured logger interface used across services and route handlers.
 */
export interface Logger {
  info(message: string, metadata?: Record<string, unknown>): void;
  warn(message: string, metadata?: Record<string, unknown>): void;
  error(message: string, metadata?: Record<string, unknown>): void;
}

type LogLevel = "info" | "warn" | "error";

/**
 * Console-backed JSON logger for local development and production log pipelines.
 */
class ConsoleLogger implements Logger {
  /**
   * Writes a structured log line with consistent metadata envelope.
   */
  private write(level: LogLevel, message: string, metadata?: Record<string, unknown>) {
    const payload = {
      level,
      message,
      metadata: metadata ?? {},
      timestamp: new Date().toISOString(),
    };

    const serialized = JSON.stringify(payload);

    if (level === "error") {
      console.error(serialized);
      return;
    }

    if (level === "warn") {
      console.warn(serialized);
      return;
    }

    console.log(serialized);
  }

  /**
   * Logs an informational event.
   */
  info(message: string, metadata?: Record<string, unknown>) {
    this.write("info", message, metadata);
  }

  /**
   * Logs a warning event.
   */
  warn(message: string, metadata?: Record<string, unknown>) {
    this.write("warn", message, metadata);
  }

  /**
   * Logs an error event.
   */
  error(message: string, metadata?: Record<string, unknown>) {
    this.write("error", message, metadata);
  }
}

/**
 * Shared logger instance used by default in app services.
 */
export const logger: Logger = new ConsoleLogger();
