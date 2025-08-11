const { exec } = require('child_process');
const path = require('path');
const { PEM_KEY_PATH } = require('./ec2InstanceData');

async function runConnectScript(ip, userId) {
  const script = path.resolve(__dirname, '../scripts/connect-instance.sh');
  const command = `bash ${script} ${ip} ${PEM_KEY_PATH} ${userId}`;

  return new Promise((resolve, reject) => {
    exec(command, (err, stdout, stderr) => {
      if (err) return reject(err);
      console.log(stdout);
      if (stderr) console.error(stderr);
      resolve(true);
    });
  });
}

module.exports = { runConnectScript };
