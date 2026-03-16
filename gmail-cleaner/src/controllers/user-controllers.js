/* External modules required are  */
import { google } from 'googleapis';
import 'dotenv/config';
import pLimit from 'p-limit';
/* Internal modules required are  */
import { loggerPino } from '../utils/logger-pino.js';
const log = loggerPino.child({ module: 'gmail-api-worker' });

async function getMessageIds(gmailInstance, pageToken, optionalqueryparam = null) {
  try {
    /*Only interesed in storing pageToken exists true/false.
    To ensure when token is received store the boolean equivalent instead of real token.*/
    log.debug({ hasPageToken: !!pageToken, actionWhere: 'Retrieve_ids' }, 'SERVICE_INVOKED');

    // if 'unsubscribe' received retrieve mass-mailers so they can be unsubscribed from.
    const query = optionalqueryparam === 'unsubscribe' ? 'unsubscribe' : null;
    log.debug({ incomingParam: query }, 'MSG_IDS_FETCH_STARTED');

    //   Get message id from user.messages.list
    const msgMetaData = await gmailInstance.users.messages.list({
      userId: 'me',
      pageToken: pageToken,
      q: query,
    });
    const userMsgIds = msgMetaData.data.messages || [];
    const nextPageExists = msgMetaData.data.nextPageToken;

    log.debug(
      { msgIdsFound: userMsgIds.length, nextPageTokenFound: nextPageExists ? true : false },
      'MSG_IDS_FETCH_FINISHED',
    );

    return { ids: userMsgIds, nextToken: nextPageExists };
  } catch (error) {
    log.error(
      { err: error, actionWhere: 'Retrieve_ids' },
      'Encountered error in getUserMessageIds fn.',
    );
    throw error;
  }
}

async function getRawMessages(gmailInstance, userMsgIds) {
  try {
    /* Can't search messages without ids. Return immediately. */
    if (userMsgIds.length === 0) {
      log.debug('Received empty array of IDs. Empty array returned');
      return [];
    }

    log.debug(
      { msgIdsReceived: userMsgIds.length === 0 ? false : true, actionWhere: 'Retrieve_msgs' },
      'MSGS_FETCH_STARTED',
    );

    /* Set concurrency limit to the msgs fetch fn to ensure it stays within the API limits. 20 value is the set. */
    const limit = pLimit(parseInt(process.env.GMAIL_API_CONCURRENCY_LIMIT));

    /* Use the userMsgIds array to get emails. */
    const userRawMsgArr = userMsgIds.map(item => {
      let msgId = item.id;
      return limit(() => {
        return gmailInstance.users.messages.get({
          userId: 'me',
          id: msgId,
          format: 'metadata',
        });
      });
    });

    /* Create an array of retrieved emails, using Promise.all */
    const userRawMsgsData = await Promise.all(userRawMsgArr);

    // console.log('User(s) raw messages data retrieved successfully', userRawMsgsData.length);
    log.debug({ retrievedMsgCount: userRawMsgsData.length }, 'MSGS_FETCH_FINISHED');
    return userRawMsgsData;
  } catch (error) {
    // console.log('Error occurred during user raw messages data retrieval', e);
    log.error(
      { err: error, batchSize: userMsgIds.length, actionWhere: 'Retrieve_msgs' },
      'Error occurred in the getUserRawMessages fn.',
    );
    throw error;
  }
}

async function getCleanedMessages(userRawMsgsData) {
  try {
    if (userRawMsgsData.length === 0) {
      log.debug('Empty msgs array received. Returned empty array and fn exited');
      return [];
    }

    /* Stores cleaned messages array returned by the function. */
    const allMessagesData = [];

    log.debug(
      {
        rawMessagesReceived: userRawMsgsData.length === 0 ? false : true,
        actionWhere: 'Clean_msgs',
      },
      'MSG_CLEANING_STARTED',
    );

    userRawMsgsData.forEach(userRawMsgDataElement => {
      // Extract message array and filter for Subject, From, Date and isMassMail.
      const msgsHeadersArr = userRawMsgDataElement.data.payload.headers;
      const filteredMsgsHeaderData = msgsHeadersArr.filter(element => {
        const targetHeaders = ['Subject', 'From', 'Date', 'List-Unsubscribe'];
        if (
          /*element['name'] === 'Subject' ||
          element['name'] === 'From' ||
          element['name'] === 'Date' ||
          element['name'] === 'List-Unsubscribe' ||*/
          targetHeaders.includes(element['name'])
        ) {
          return true;
        }
      });

      //   clean object contains messages selected to deleted (trash).
      const cleanedObject = { id: userRawMsgDataElement.data.id, isMassMail: false };
      filteredMsgsHeaderData.forEach(filteredHeaderDataElement => {
        if (filteredHeaderDataElement['name'] === 'Subject') {
          cleanedObject.Subject = filteredHeaderDataElement.value.trim();
        }
        if (filteredHeaderDataElement['name'] === 'From') {
          const headerFromValToBeCleaned = filteredHeaderDataElement.value;
          const cleanedHeaderFromVal = headerFromValToBeCleaned.replace(/[<>]/g, '').trim();
          cleanedObject.From = cleanedHeaderFromVal;
        }
        if (filteredHeaderDataElement['name'] === 'Date') {
          cleanedObject.Date = filteredHeaderDataElement.value.trim();
        }
        if (filteredHeaderDataElement['name'] === 'List-Unsubscribe') {
          cleanedObject.isMassMail = true;
        }
      });
      allMessagesData.push(cleanedObject);
    });
    log.debug({ cleanedMsgsCount: allMessagesData.length }, 'MSG_CLEANING_FINISHED');
    return allMessagesData;
  } catch (error) {
    debug.error(
      { err: error, batchSize: userRawMsgsData.length, actionWhere: 'Clean_msgs' },
      'Error occurred during message cleaning process.',
    );
    throw error;
  }
}

async function sortMessages(userMsgsDataArr) {
  try {
    // Separate mass-mailers for deletion.
    if (userMsgsDataArr.length === 0) {
      log.debug('Empty cleaned msgs array received. Returning empty array & early exit triggered.');
      return [];
    }

    log.debug(
      {
        cleanedMsgsReceived: userMsgsDataArr.length === 0 ? false : true,
        actionWhere: 'Sort_msgs',
      },
      'MSG_SORTING_STARTED',
    );

    const filterMsgsArr = userMsgsDataArr
      .filter(msgElement => {
        if (msgElement.isMassMail) {
          return true;
        }
      })
      .map(msgElementId => {
        return msgElementId.id;
      });

    log.debug({ msgsMarkedForDelete: filterMsgsArr.length }, 'MSG_SORTING_FINISHED');
    return filterMsgsArr;
  } catch (error) {
    log.error(
      { err: error, batchSize: userMsgsDataArr.length, actionWhere: 'Sort_msgs' },
      'Error occurred during msg sorting.',
    );
  }
}

async function deleteMessages(gmailInstance, filteredMsgsDataArr) {
  try {
    if (filteredMsgsDataArr.length === 0) {
      log.debug('Empty filtered messages array recieved. Return none & exit condition triggered');
      return 'None';
    }

    log.debug(
      { msgsToBeTrashed: filteredMsgsDataArr.length, actionWhere: 'Delete_msgs' },
      'MSG_DELETE_STARTED',
    );

    const moveMsgsToTrash = await gmailInstance.users.messages.batchModify({
      userId: 'me',
      requestBody: {
        ids: filteredMsgsDataArr,
        addLabelIds: ['TRASH'],
        removeLabelIds: ['INBOX'],
      },
    });
    log.debug({ msgsTrashedCount: filteredMsgsDataArr.length }, 'MSG_DELETE_FINISHED');
  } catch (error) {
    log.debug(
      { err: error, batchSize: filteredMsgsDataArr.length, sctionWhere: 'Delete_msgs' },
      'Error occurred during msg movement to trash bin',
    );
  }
}

async function cleanUnsubscribeMessages(userRawMsgsData) {
  try {
    if (userRawMsgsData.length === 0) {
      log.debug('Empty messages array received. Returned empty array & exit triggered');
      return [];
    }

    /* Stores cleaned messages to be returned */
    const cleanedBulkMailersData = [];

    log.debug(
      {
        rawMessagesReceived: userRawMsgsData.length === 0 ? false : true,
        actionWhere: 'Clean_msgs_unsubscribe_mass_mailers',
      },
      'MSG_CLEANING_STARTED',
    );
    userRawMsgsData.forEach(rawMsgElement => {
      // retrieve headers array i.e. messages from the incoming payload
      const headersArr = rawMsgElement.data.payload.headers;
      const bulkMailData = headersArr.filter(headerElement => {
        const headerFootprint = ['List-ID', 'List-Unsubscribe', 'Subject', 'From'];
        if (headerFootprint.includes(headerElement['name'])) {
          return true;
        }
      });

      const bulkMailers = {};
      bulkMailData.forEach(bulkMailData => {
        bulkMailers.id = rawMsgElement.data.id;
        if (bulkMailData['name'].trim() === 'List-Unsubscribe') {
          bulkMailers.ListUnsubscribe = bulkMailData.value.match(/<(https?:\/\/[^>]+)>/)[1];
        }
        if (bulkMailData['name'].trim() === 'Subject') {
          bulkMailers.Subject = bulkMailData.value;
        }
        if (bulkMailData['name'].trim() === 'From') {
          bulkMailers.From = bulkMailData.value.replace(/[<>]/g, '');
        }
      });
      cleanedBulkMailersData.push(bulkMailers);
    });

    log.debug({ cleanedMsgsCount: cleanedBulkMailersData.length }, 'MSG_CLEANING_FINISHED');
    return cleanedBulkMailersData;
  } catch (error) {
    log.debug(
      {
        err: error,
        batchSize: userRawMsgsData.length,
        actionWhere: 'Clean_msgs_unsubscribe_mass_mailers',
      },
      'Error occurred during unsubscribe msg cleaning operation',
    );
    throw error;
  }
}

async function sortUnsubscribeMessages(bulkMailersDataArr) {
  try {
    if (bulkMailersDataArr.length === 0) {
      log.debug('Empty messages array received. Returned empty array & exit triggered');
      return [];
    }
    log.debug(
      {
        cleanedMsgsReceived: bulkMailersDataArr.length === 0 ? false : true,
        actionWhere: 'Sort_msgs_unsubscribe_mass_mailers',
      },
      'MSG_SORTING_STARTED',
    );

    /* Stores messages to be deleted, after unsubscribing from senders. */
    const sortedBulkMailersData = [];
    const bulkMailerMsgMap = {};
    bulkMailersDataArr
      .filter(subsMailData => {
        if (subsMailData['ListUnsubscribe']) {
          return true;
        }
      })
      .forEach(item => {
        const presentKeys = Object.keys(bulkMailerMsgMap);
        if (!presentKeys.includes(item['From'])) {
          bulkMailerMsgMap[item['From']] = {
            count: 1,
            unsuburl: [item['ListUnsubscribe']],
          };
        } else {
          bulkMailerMsgMap[item['From']].count++;
          let nextUrl = item['ListUnsubscribe'];
          bulkMailerMsgMap[item['From']].unsuburl.push(nextUrl);
        }
      });
    sortedBulkMailersData.push(bulkMailerMsgMap);

    log.debug({ msgsMarkedForDelete: sortedBulkMailersData.length }, 'MSG_SORTING_FINISHED');
    return sortedBulkMailersData;
  } catch (error) {
    log.error(
      { err: error, batchSize: bulkMailersDataArr.length, actionWhere: 'Sort_msgs' },
      'Error occurred during unsubscribe msg sorting.',
    );
  }
}

export {
  getMessageIds,
  getRawMessages,
  getCleanedMessages,
  sortMessages,
  deleteMessages,
  cleanUnsubscribeMessages,
  sortUnsubscribeMessages,
};
