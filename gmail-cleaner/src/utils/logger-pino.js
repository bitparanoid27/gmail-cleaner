/* External files required are */
import pino from 'pino';

const optionsArr = process.argv;
const options = optionsArr.includes('--dev');

const __dirname = import.meta.dirname;
const logTragets = [
  {
    target: 'pino/file',
    level: 'info',
    options: { destination: `${__dirname}/logs/app.log`, mkdir: true },
  },
  {
    target: 'pino/file',
    level: 'error',
    options: { destination: `${__dirname}/logs/error.log`, mkdir: true },
  },
  {
    target: 'pino/file',
    level: 'debug',
    options: { destination: `${__dirname}/logs/debug.log`, mkdir: true },
  },
];

if (options) {
  logTragets.push({
    // Sends logs to the terminal
    target: 'pino-pretty',
    level: 'debug',
    options: { destination: 1 },
  });
}

const fileTransport = pino.transport({ targets: logTragets });

// const fileTransport = pino.transport({
//   targets: [
//     {
//       target: 'pino/file',
//       level: 'info',
//       options: { destination: `${__dirname}/logs/app.log`, mkdir: true },
//     },
//     {
//       target: 'pino/file',
//       level: 'error',
//       options: { destination: `${__dirname}/logs/error.log`, mkdir: true },
//     },
//     {
//       target: 'pino/file',
//       level: 'debug',
//       options: { destination: `${__dirname}/logs/debug.log`, mkdir: true },
//     },
//     {
//       // Sends logs to the terminal
//       target: 'pino-pretty',
//       level: 'debug',
//       options: { destination: 1 },
//     },
//   ],
// });

const loggerPino = pino(
  {
    level: process.env.PINO_LOG_LEVEL || 'debug',
    /*    Pourquoi mixin? Pino doesn't allow writing to multiple files without underlying codes.
    But I need text logs to understand logging. So mixin allows mix text levels with the generated log
    _context is for child loggers to be appended to the final log object.
    If child loggers are not used '_' makes it ignore the variable and if they're present, they're added to log.*/
    mixin(level) {
      return { loglevel: pino.levels.labels[level] };
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    base: null,
  },
  fileTransport,
);

export { loggerPino };
