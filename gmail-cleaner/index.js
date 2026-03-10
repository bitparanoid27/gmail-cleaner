/*  Internal modules are imported here */
import { authoriseLogin } from './src/auth.js';
import {
  sortUserMessages,
  deleteUserMessages,
  getUserMessageIds,
  getUserRawMessages,
  getCleanedUserMessageObj,
  getBulkUnsubscribeMsgs,
  sortBulkUnsubscribeMsgs,
} from './src/controllers/user-controllers.js';
import { logger } from './src/utils/logger.js';

/* Authorise login runner function */

const auth = await authoriseLogin();
// Orchestrator function that runs fetch emails from multiple pages.
async function trashMessagesManager() {
  let token = null;
  let allProcessed = [];
  let pageCount = 1;

  try {
    do {
      console.log(`--- Processing Page ${pageCount} ---`);
      await logger.loggerLog('info', 'FETCH_STARTED', { page: pageCount });
      // 1. Get IDs for this page
      const { ids, nextToken } = await getUserMessageIds(auth, token);

      // 2. Fetch full details (Parallel)
      const raw = await getUserRawMessages(auth, ids);

      // 3. Clean and Shape
      const cleanedBatch = await getCleanedUserMessageObj(raw);

      // 4. Store
      allProcessed.push(...cleanedBatch);
      await logger.loggerLog('info', `PAGE_PROCESSED ${pageCount}`, {
        msgsfoundonpage: cleanedBatch.length,
        totalmsgs: allProcessed.length,
      });

      // 5. Update token for next cycle
      token = nextToken;
      pageCount++;
    } while (token && pageCount <= 3); // Safety limit of 3 pages for now

    // 6. After the loop, do the final sorting and trashing
    console.log('All the messages marked for cleaning are', allProcessed);
    await logger.loggerLog('info', 'FETCH_FINISHED', { msgsfetched: allProcessed.length });

    const trashQueue = await sortUserMessages(allProcessed);
    // await deleteUserMessages(auth, trashQueue);
    // await logger.loggerLog('info', 'BATCH_TRASH_FINISHED', { msgsTrashed: trashQueue.length });
    //
  } catch (error) {
    console.error('The Orchestrator encountered a fatal error:', error);
    await logger.loggerLog('error', 'ERROR_OCCURED_IN_ORCHESTRATOR', { error: error.message });
    //
  }
}
// trashMessagesManager();

const { ids, nexttoken } = await getUserMessageIds(auth, null, 'unsubscribe');
const userRawMsgsData = await getUserRawMessages(auth, ids);
const bulkMailDataArr = await getBulkUnsubscribeMsgs(userRawMsgsData);
await sortBulkUnsubscribeMsgs(bulkMailDataArr);
