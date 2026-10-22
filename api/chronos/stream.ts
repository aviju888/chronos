import { createChronosResponse } from '../../modern/server/chronosResponse.js';

// Node runtime Web Standard handler: https://vercel.com/docs/functions/runtimes/node-js
export default { fetch: createChronosResponse };
