const { sign } = require('@noble/ed25519');
const { BACKPACK_SECRET_KEY, BACKPACK_API_KEY, DEFAULT_SIGNATURE_WINDOW } = require('../config/constants');

/**
 * Sign a request for Backpack Exchange API
 * @param {string} instruction - The API instruction (e.g., 'balanceQuery', 'orderExecute')
 * @param {object} queryParams - Query parameters to include in signature
 * @param {number} window - Signature window in milliseconds (default: 5000)
 * @returns {Promise<{signature: string, timestamp: number, window: number, apiKey: string}>}
 */
async function signRequest(instruction, queryParams = {}, window = DEFAULT_SIGNATURE_WINDOW) {
  if (!BACKPACK_SECRET_KEY) {
    throw new Error('BACKPACK_SECRET_KEY environment variable is not set');
  }

  const timestamp = Date.now();
  
  // Build query string from sorted parameters
  // For POST requests, parameters should be sorted alphabetically
  // Ensure all values are strings for consistent signing
  const sortedParams = Object.keys(queryParams)
    .sort()
    .map(key => {
      const value = queryParams[key];
      // Ensure value is a string
      const stringValue = typeof value === 'string' ? value : String(value);
      return `${key}=${stringValue}`;
    })
    .join('&');
  
  // Create signing string: instruction + query params + timestamp + window
  let signingString = `instruction=${instruction}`;
  if (sortedParams) {
    signingString += `&${sortedParams}`;
  }
  signingString += `&timestamp=${timestamp}&window=${window}`;
  
  // Log signing string for debugging (remove in production)
  if (instruction === 'orderExecute') {
    console.log('=== SIGNATURE DEBUG ===');
    console.log('Query params:', JSON.stringify(queryParams, null, 2));
    console.log('Sorted keys:', Object.keys(queryParams).sort());
    console.log('Sorted params string:', sortedParams);
    console.log('Full signing string:', signingString);
    console.log('Timestamp:', timestamp);
    console.log('Window:', window);
    console.log('======================');
  }
  
  // Decode base64 private key to Uint8Array
  const privateKeyBytes = new Uint8Array(Buffer.from(BACKPACK_SECRET_KEY, 'base64'));
  
  // Convert signing string to Uint8Array (UTF-8 bytes)
  const messageBytes = new TextEncoder().encode(signingString);
  
  // Sign the message
  const signatureBytes = await sign(messageBytes, privateKeyBytes);
  
  // Encode signature to base64
  const signature = Buffer.from(signatureBytes).toString('base64');
  
  return {
    signature,
    timestamp,
    window,
    apiKey: BACKPACK_API_KEY
  };
}

module.exports = {
  signRequest
};
