/* External modules required are  */
import { google } from 'googleapis';
/* Internal modules required are  */

async function retrieveUserMessages(authClient) {
  /*Check if the user login via running authoriseLogin
  Pass the oAuthClient received from the authoriseLogin fn to authenticate
  Create a gmail instance to retrieve messages from the gmail.

  Create a list of ids that needs to be passed to retrieve msgs.
  Retrieved msgs need to be converted into an useful object.

  */
  try {
    const gmail = google.gmail({ version: 'v1', auth: authClient });
    console.log('Gmail instance created successfully.');

    const messageMetaData = await gmail.users.messages.list({ userId: 'me' });
    const messageIdMetaData = messageMetaData.data.messages;

    console.log('Message retrieval started.');
    const msgsCleanedResultsArr = [];
    for (const msgIdElem of messageIdMetaData) {
      let Id = msgIdElem.id;
      const messagesDataDump = await gmail.users.messages.get({ userId: 'me', id: Id, format: 'metadata' });
      const headersArr = messagesDataDump.data.payload.headers;

      const filteredHeaderData = headersArr.filter(element => {
        if (element.name === 'Subject' || element.name === 'From' || element.name === 'Date' || element.name === 'List-Unsubscribe') {
          return true;
        }
      });

      const headerDataObject = {
        isMassMail: false,
      };
      const headerDataResult = filteredHeaderData.forEach(headerDataElement => {
        headerDataObject.id = Id;
        if (headerDataElement['name'] === 'Subject') {
          headerDataObject.Subject = headerDataElement.value.trim();
        }
        if (headerDataElement['name'] === 'From') {
          const headerFromValToBeCleaned = headerDataElement.value;
          const cleanedHeaderFromVal = headerFromValToBeCleaned.replace(/[<>]/g, '').trim();
          headerDataObject.From = cleanedHeaderFromVal;
        }
        if (headerDataElement['name'] === 'Date') {
          headerDataObject.Date = headerDataElement.value.trim();
        }
        if (headerDataElement['name'] === 'List-Unsubscribe') {
          headerDataObject.isMassMail = true;
        }
      });
      msgsCleanedResultsArr.push(headerDataObject);
    }
    // console.log('Execution control is on this line now', msgsCleanedResultsArr);
    return msgsCleanedResultsArr;
  } catch (e) {
    console.log('Error occurred during message retrieval', e);
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

export { retrieveUserMessages, sortUserMessages, deleteUserMessages };
