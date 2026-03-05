/* External modules */
import path from 'node:path';
import { fileURLToPath } from 'url';
import { authenticate } from '@google-cloud/local-auth';
import { google } from 'googleapis';
import fs from 'node:fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// The scope for reading Gmail labels and path to the credentials file.
const SCOPES = ['https://www.googleapis.com/auth/gmail.modify'];
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');

/* Lists the labels in the user's account. */
const getCredentials = async () => {
  // Authenticate with Google and get an authorized client.
  const auth = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });

  // Create a new Gmail API client.
  const gmail = google.gmail({ version: 'v1', auth });
  // Get the list of labels.
  const result = await gmail.users.labels.list({
    userId: 'me',
  });

  const labels = result.data.labels;
  if (!labels || labels.length === 0) {
    console.log('No labels found.');
  }

  // console.log('Labels:');
  // // Print the name of each label.
  // labels.forEach(label => {
  //   console.log(`- ${label.name}`);
  // });

  // Save the credentials object so re-logins aren't required
  for (const authElement of Object.keys(auth)) {
    if (authElement === 'credentials') {
      const securityTokenData = auth.credentials;
      const securityToken = {
        credentials: securityTokenData,
      };
      const TOKEN_PATH = path.join(__dirname, 'tokens.json');
      const securityTokenObject = JSON.stringify(securityToken);
      await fs.writeFile(TOKEN_PATH, securityTokenObject);
      console.log('Re-login credentials saved successfully.');
    }
  }
  return auth;
};

const getAuthorizedClient = async () => {
  const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
  const CREDENTIALS_DATA = await fs.readFile(CREDENTIALS_PATH, { encoding: 'utf8' });

  if (CREDENTIALS_DATA.length === 0) {
    throw new Error('Empty Credentials object received');
  }
  const CREDENTIALS_DATA_OBJ = JSON.parse(CREDENTIALS_DATA);

  const TOKEN_PATH = path.join(__dirname, 'tokens.json');
  const TOKEN_DATA = await fs.readFile(TOKEN_PATH, { encoding: 'utf8' });

  if (TOKEN_DATA.length === 0) {
    throw new Error('Empty user-local token object received');
  }
  const TOKEN_DATA_OBJ = JSON.parse(TOKEN_DATA);

  // console.log('Welcome back', typeof TOKEN_DATA_OBJ);

  /* Hydrate the oAuth2Client*/
  const oAuth2Client = new google.auth.OAuth2({
    clientId: CREDENTIALS_DATA_OBJ.installed.client_id,
    clientSecret: CREDENTIALS_DATA_OBJ.installed.client_secret,
    redirectUri: CREDENTIALS_DATA_OBJ.installed.redirect_uris[0],
  });

  oAuth2Client.setCredentials(TOKEN_DATA_OBJ.credentials);
  return oAuth2Client;

  // try {
  //
  // } catch (e) {
  //   console.log('Error occurred during file read operation', e);
  //   return e;
  // }
};

export const authoriseLogin = async () => {
  try {
    const TOKEN_PATH = path.join(__dirname, 'tokens.json');
    const TOKEN_DATA = await fs.readFile(TOKEN_PATH, { encoding: 'utf8' });
    if (TOKEN_DATA.length > 0) {
      console.log('Login credentials found. Welcome back');
      return await getAuthorizedClient();
    } else {
      console.log('Login credentials needed. Kindly login. Thank you');
      return await getCredentials();
    }
  } catch (e) {
    console.log('Error occurred in the master function', e);
    return e;
  }
};
