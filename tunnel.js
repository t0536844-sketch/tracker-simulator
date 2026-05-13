const https = require('https');

// Simple tunnel using ngrok API (no pyngrok needed)
// This creates a TCP forwarder that ngrok can connect to

const PORT = 3000;
const NGROK_BIN = '/data/data/com.termux/files/usr/bin/ngrok';

// Since pyngrok doesn't work on Android, let's just print the LAN instructions
console.log('===========================================');
console.log('  Tracker Simulator - Network Access');
console.log('===========================================');
console.log('');
console.log('Server running on port', PORT);
console.log('');
console.log('📱 HP kedua (satu WiFi) buka:');
console.log('   http://<IP-HP-ini>:' + PORT);
console.log('');
console.log('🌐 Via internet (ngrok manual):');
console.log('   1. Daftar di https://ngrok.com');
console.log('   2. Download ngrok binary linux-arm64');
console.log('   3. Jalankan: ngrok http 3000');
console.log('   4. Copy URL yang muncul');
console.log('');
console.log('🔧 Alternatif - pakai SSH tunnel:');
console.log('   ssh -R 80:localhost:3000 localhost.run');
console.log('');

// Try localhost.run as fallback
console.log('Mencoba localhost.run tunnel...');
const { spawn } = require('child_process');
const ssh = spawn('ssh', ['-o', 'StrictHostKeyChecking=no', '-R', '80:localhost:' + PORT, 'localhost.run'], {
  stdio: ['ignore', 'pipe', 'pipe']
});

let tunnelUrl = null;
ssh.stdout.on('data', (data) => {
  const output = data.toString();
  console.log(output);
  const match = output.match(/(https:\/\/[a-z0-9-]+\.lhr\.life)/);
  if (match && !tunnelUrl) {
    tunnelUrl = match[1];
    console.log('\n✅ TUNNEL URL:', tunnelUrl, '\n');
  }
});

ssh.stderr.on('data', (data) => {
  const output = data.toString();
  console.error(output);
  const match = output.match(/(https:\/\/[a-z0-9-]+\.lhr\.life)/);
  if (match && !tunnelUrl) {
    tunnelUrl = match[1];
    console.log('\n✅ TUNNEL URL:', tunnelUrl, '\n');
  }
});

ssh.on('close', (code) => {
  console.log('SSH tunnel closed with code', code);
});

process.on('SIGINT', () => {
  ssh.kill();
  process.exit();
});
