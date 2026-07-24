import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import config from './config.js';

const logs = [];

const persistLog = (entry) => {
  const destination = config.logging.destination;
  mkdirSync(dirname(destination), { recursive: true });
  appendFileSync(destination, `${entry}\n`, 'utf8');
};

const logger = {
  add(message) {
    const entry = `[${new Date().toISOString()}] ${message}`;
    logs.push(entry);
    persistLog(entry);
  },
  getLogs() {
    return logs.slice(-8);
  }
};

export default logger;
