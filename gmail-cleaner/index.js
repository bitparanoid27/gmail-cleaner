/*  External modules are imported here  */
import { Command } from 'commander';
import { google } from 'googleapis';
import ora from 'ora';
import { Chalk } from 'chalk';
/*  Internal modules are imported here */
import { authoriseLogin } from './src/auth.js';
import {
  getMessageIds,
  getRawMessages,
  getCleanedMessages,
  sortMessages,
  deleteMessages,
  cleanUnsubscribeMessages,
  sortUnsubscribeMessages,
} from './src/controllers/user-controllers.js';
import { loggerPino } from './src/utils/logger-pino.js';

// create a child logger to be attached to the final log.
const log = loggerPino.child({ module: 'user-controller' });

const chalk = new Chalk({ level: 1 });

// Commander will take inputs from the CLI
const program = new Command();
program
  .option(
    '-p --pages <number>',
    'number of pages to scan. If number of pages to scan not provided. Default value 1 is used.',
    '1',
  )
  .option('-t --trash', 'trash mass mailers')
  .option('-u --unsub', 'retrieve and unsubscrible mass mailers')
  .option('-d --dev', 'Runs the program in dev mode');
program.parse();
const options = program.opts();

async function authClientGenerator() {
  try {
    log.debug(
      { authClientFlag: false, mode: 'gmail-instance-creation' },
      'GMAIL_INSTANCE_CREATION_STARTED',
    );
    const auth = await authoriseLogin();
    // create a local gmail client object that knows how to connect to gmail APIs.
    const gmailInstance = google.gmail({ version: 'v1', auth: auth });
    if (gmailInstance) {
      log.debug({ authClientFlag: true }, 'GMAIL_INSTANCE_CREATION_COMPLETED');
    }

    return gmailInstance;
  } catch (error) {
    log.error({ err: error }, 'Error occurred during gmail instance creation');
    throw error;
  }
}
async function handleTrashMessages(cliArgs, gmailInstance) {
  let token = null;
  let allProcessedMsgs = [];
  let pageCount = 1;
  let maxPage = cliArgs.pages === undefined ? 1 : cliArgs.pages;

  log.info({ maxPagesToScan: maxPage, mode: 'mass-emails-delete' }, 'MASTER_CONTROLLER_STARTED');
  const spinner = ora('Trash mass-mailers service started').start();

  try {
    do {
      /*1. Get IDs for this page
      2. Fetch full details (Parallel)
      3. Clean and Shape
      4. Store*/

      log.info('MESSAGES_COLLECTION_STARTED');
      spinner.text = chalk.green(
        `Message collection started. Currently checking page number ${pageCount}`,
      );

      const { ids, nextToken } = await getMessageIds(gmailInstance, token);
      /*  If no ids are found on a page exit the loop */
      if (ids.length === 0) {
        spinner.text = chalk.red('No messages found. Program terminated');
        break;
      }
      const raw = await getRawMessages(gmailInstance, ids);
      const cleanedBatch = await getCleanedMessages(raw);

      allProcessedMsgs.push(...cleanedBatch);
      spinner.text = chalk.blueBright(`All messages on page number ${pageCount} collected.`);

      // 5. Update token for next cycle
      token = nextToken;
      pageCount++;
    } while (token && pageCount <= maxPage);

    log.info(
      { messagesCollected: allProcessedMsgs.length, pagesScanned: pageCount - 1 },
      'MESSAGES_COLLECTION_COMPLETED',
    );

    spinner.succeed(
      chalk.blueBright(`Total ${allProcessedMsgs.length} messages collected for sorting.`),
    );

    log.info('MESSAGES_PROCESSING_STARTED');
    const trashQueue = await sortMessages(allProcessedMsgs);
    log.info({ messagesPreparedForTrash: trashQueue.length }, 'MESSAGES_PROCESSING_COMPLETED');

    spinner.start('Message processing started');
    spinner.succeed(
      chalk.yellowBright(
        `Total ${Object.keys(trashQueue[0]).length} messages marked for deletion.`,
      ),
    );

    log.info('MESSAGES_EXECUTION_STARTED');
    // await deleteMessages(gmailInstance, trashQueue);
    log.info({ messagesTrashed: trashQueue.length }, 'MESSAGES_EXECUTION_COMPLETED');

    spinner.start('Messages deletion started');
    spinner.succeed(
      chalk.greenBright(`Total ${Object.keys(trashQueue[0]).length} messages deleted.`),
    );

    spinner.succeed(chalk.redBright('Finished'));
    log.info('MASTER_CONTROLLER_FINISHED');
    setTimeout(() => spinner.stop(), 1000);
    return {
      status: 'success',
      pageProcessed: pageCount - 1,
      messagesCollected: allProcessedMsgs.length,
      messagesTrashed: Object.keys(trashQueue[0]).length,
    };
    //
  } catch (error) {
    log.error({ err: error }, 'The handleTrashMessages controller encountered a fatal error');
    spinner.text = chalk.redBright('An error occurred during the mass-deletion operation');

    // since pino is async in nature without this, the code exits before logs are logged.
    await new Promise(resolve => setTimeout(resolve, 500));
    throw error;
  }
}
async function handleUnsubscribe(cliArgs, gmailInstance) {
  let token = null;
  let allProcessedMsgs = [];
  let pageCount = 1;
  let maxPage = cliArgs.pages === undefined ? 1 : cliArgs.pages;

  log.info({ maxPagesToScan: maxPage, mode: 'unsubscribe' }, 'MASTER_CONTROLLER_STARTED');
  const spinner = ora('Unsubscribe service started').start();

  try {
    do {
      log.info('MESSAGES_COLLECTION_STARTED');
      spinner.text = chalk.green(
        `Message collection started. Currently checking page number ${pageCount}`,
      );

      const { ids, nextToken } = await getMessageIds(gmailInstance, token, 'unsubscribe');
      /* If no ids found exit loop. */
      if (ids.length === 0) {
        spinner.text = chalk.red('No messages found. Program terminated');
        break;
      }
      const raw = await getRawMessages(gmailInstance, ids);
      const sortedMailQueue = await cleanUnsubscribeMessages(raw);

      allProcessedMsgs.push(...sortedMailQueue);
      spinner.text = chalk.blueBright(`All messages on page number ${pageCount} collected.`);

      token = nextToken;
      pageCount++;
    } while (token && pageCount <= maxPage);

    log.info(
      { messagesCollected: allProcessedMsgs.length, pagesScanned: pageCount - 1 },
      'MESSAGES_COLLECTION_COMPLETED',
    );

    spinner.succeed(
      chalk.blueBright(`Total ${allProcessedMsgs.length} messages collected for sorting.`),
    );

    log.info('MESSAGES_PROCESSING_STARTED');
    const trashQueue = await sortUnsubscribeMessages(allProcessedMsgs);
    log.info({ messagesPreparedForTrash: trashQueue.length }, 'MESSAGES_PROCESSING_COMPLETED');

    spinner.start('Message processing started');
    spinner.succeed(
      chalk.yellowBright(
        `Total ${Object.keys(trashQueue[0]).length} messages marked for deletion.`,
      ),
    );

    log.info('MESSAGES_EXECUTION_STARTED');
    // await deleteMessages(gmailInstance, trashQueue);
    log.info({ messagesTrashed: trashQueue.length }, 'MESSAGES_EXECUTION_COMPLETED');

    spinner.start('Messages deletion started');
    spinner.succeed(
      chalk.greenBright(`Total ${Object.keys(trashQueue[0]).length} messages deleted.`),
    );

    spinner.succeed(chalk.redBright('Finished'));
    log.info('MASTER_CONTROLLER_FINISHED');
    setTimeout(() => spinner.stop(), 1000);
    return {
      status: 'success',
      pageProcessed: pageCount - 1,
      messagesCollected: allProcessedMsgs.length,
      messagesTrashed: Object.keys(trashQueue[0]).length,
    };
  } catch (error) {
    log.error({ err: error }, 'The handleUnsubscribe controller encountered a fatal error');
    spinner.text = chalk.redBright('An error occurred during the unsubscribe operation');

    // since pino is async in nature without this, the code exits before logs are logged.
    await new Promise(resolve => setTimeout(resolve, 500));
    throw error;
  }
}

// Returns a gmail instace to connect to google APIs.
const gmailInstance = await authClientGenerator();
if (options.unsub) {
  console.log('Unsubscribe service fired.');
  await handleUnsubscribe(options, gmailInstance);
}
if (options.trash) {
  console.log('Delete mass mailers service fired.');
  await handleTrashMessages(options, gmailInstance);
}

// To ensure pino has enough time to write logs to file before the worker threads are killed.
await new Promise(resolve => setTimeout(resolve, 1500));
export { options };
