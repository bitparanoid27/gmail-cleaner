/*  Internal modules are imported here */
import { authoriseLogin } from './src/auth.js';
import { retrieveUserMessages, sortUserMessages, deleteUserMessages } from './src/controllers/user-controllers.js';

/* Authorise login runner function */

const auth = await authoriseLogin();
const userMsgsData = await retrieveUserMessages(auth);
const filteredMsgsData = await sortUserMessages(userMsgsData);
// await deleteUserMessages(auth, filteredMsgsData);
