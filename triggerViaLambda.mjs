// triggerViaLambda.mjs
const API_GATEWAY_URL = 'https://cw9ahgiyrl.execute-api.us-east-1.amazonaws.com/staging/launch';

const testPayload = {
  user_id: '9c0f7e26-eb29-4567-bcc7-f44a3e64e107',
  instance_type: 'g4dn.2xlarge',  // ← matches the fixed T4 instance
  ami_id: 'ami-0a7d80731ae1b2435' // ← T4 instance AMI
};

async function triggerViaLambda() {
  try {
    const response = await fetch(API_GATEWAY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testPayload),
    });

    const result = await response.text();

    console.log(`Lambda responded with status: ${response.status}`);
    console.log('Response body:', result);
  } catch (error) {
    console.error('Error triggering Lambda via API Gateway:', error);
  }
}

triggerViaLambda();
