/* External modules required are  */
import { google } from 'googleapis';
/* Internal modules required are  */

async function getUserMessageIds(authClient, pageToken) {
  //   Retrieve user messages from 1 or more than 1 inbox page(s).
  try {
    const gmail = google.gmail({ version: 'v1', auth: authClient });
    console.log('Gmail instance created successfully on step 1.');

    let nextPageExists = pageToken;

    //   Get message id from user.messages.list
    const msgMetaData = await gmail.users.messages.list({
      userId: 'me',
      pageToken: nextPageExists,
    });
    const userMsgIds = msgMetaData.data.messages;
    nextPageExists = msgMetaData.data.nextPageToken;

    console.log(`User ids retrieved successfully`);
    return { ids: userMsgIds, nextToken: nextPageExists };
  } catch (e) {
    console.log('Error occurred during user messages-ID retrieval', e);
  }
}

async function getUserRawMessages(authClient, userMsgIds) {
  try {
    const gmail = google.gmail({ version: 'v1', auth: authClient });
    console.log('Gmail instance created successfully on step 2.');
    // Get messages using above received ids and return array of IDS
    // Create an array of ids to get messages using Promise.all
    const userRawMsgArr = userMsgIds.map(item => {
      let msgId = item.id;
      return gmail.users.messages.get({
        userId: 'me',
        id: msgId,
        format: 'metadata',
      });
    });

    const userRawMsgsData = await Promise.all(userRawMsgArr);
    console.log('User(s) raw messages data retrieved successfully', userRawMsgsData.length);
    return userRawMsgsData;
  } catch (e) {
    console.log('Error occurred during user raw messages data retrieval', e);
  }
}

async function getCleanedUserMessageObj(userRawMsgsData) {
  try {
    console.log('Message cleaning started for thrash removal.');

    const allMessagesData = [];

    userRawMsgsData.forEach(userRawMsgDataElement => {
      // Messages array is extracted and filtered for Subject, From, Date and isMassMail.
      const msgsHeadersArr = userRawMsgDataElement.data.payload.headers;
      const filteredMsgsHeaderData = msgsHeadersArr.filter(element => {
        if (
          element['name'] === 'Subject' ||
          element['name'] === 'From' ||
          element['name'] === 'Date' ||
          element['name'] === 'List-Unsubscribe'
        ) {
          return true;
        }
      });

      //   clean object creation which will be used for thrashing the messages
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
    console.log('Async cleaned object is ready', typeof allMessagesData);
    return allMessagesData;
  } catch (e) {
    console.log('Error occurred during batch request processing', e);
  }
}

async function sortUserMessages(userMsgsDataArr) {
  // Segregate the messages marked for deletion.

  try {
    console.log('User messages filteration started.');
    const filterMsgsArr = userMsgsDataArr
      .filter(msgElement => {
        if (msgElement.isMassMail) {
          return true;
        }
      })
      .map(msgElementId => {
        return msgElementId.id;
      });
    console.log('Msgs marked for deletion are:', filterMsgsArr);
    return filterMsgsArr;
  } catch (e) {
    console.log('Error occurred during user message sorting', e);
  }
}

async function deleteUserMessages(authClient, filteredMsgsDataArr) {
  try {
    console.log('Messages are being moved to trash.');
    const gmail = google.gmail({ version: 'v1', auth: authClient });
    const moveMsgsToTrash = await gmail.users.messages.batchModify({
      userId: 'me',
      requestBody: {
        ids: filteredMsgsDataArr,
        addLabelIds: ['TRASH'],
        removeLabelIds: ['INBOX'],
      },
    });
    console.log(`${filteredMsgsDataArr.length} messages moved successfully to trash`);
  } catch (e) {
    console.log('Error occurred during msg movement to trash bin', e);
  }
}

export {
  getUserMessageIds,
  getUserRawMessages,
  getCleanedUserMessageObj,
  sortUserMessages,
  deleteUserMessages,
};
