import path from 'node:path';
import { fileURLToPath } from 'url';
import { appendFile } from 'node:fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logFilePath = path.join(__dirname, '..', '..', 'activity.log');

class ActivityLogger {
  constructor() {}

  async loggerLog(level, message, data) {
    try {
      const timeStamp = new Date().toISOString();
      const logEntry = {
        timestamp: timeStamp,
        level: level.toUpperCase(),
        message: message,
        data: data,
      };

      let logFileEntry = JSON.stringify(logEntry);
      await appendFile(logFilePath, `${logFileEntry}\n`);

      console.log(`${logEntry} added to the ${path.basename(logFilePath)}`);
      return logEntry;
    } catch (e) {
      console.error('Logger failed critically', e);
    }
  }
}

const logger = new ActivityLogger();

export { logger };

// INFO: Use this for general "Milestones."
// Example: logger.loggerLog('info', 'FETCH_STARTED', { page: 1 })
// WARN: Use this for "Unexpected but not Fatal" events.
// Example: logger.loggerLog('warn', 'EMPTY_PAGE_RECEIVED', { token: 'xyz' })
// ERROR: Use this for "Crashes or Failures."
// Example: logger.loggerLog('error', 'API_REQUEST_FAILED', { error: e.message })
// Pro Message: "INBOX_CLEANUP_SUCCESS" (Easy to filter with a search tool).
