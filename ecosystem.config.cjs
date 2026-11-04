// PM2 process config for deploying MyPadi on a plain VPS (alternative to Docker).
//
//   pm2 start ecosystem.config.cjs
//   pm2 logs mypadi
//   pm2 save && pm2 startup   # survive reboots
//
// Secrets come from the .env file in the app directory (loaded by dotenv in src/config/env.ts);
// PM2 does not inject them, so keep .env present and gitignored on the server. Run the DB
// migration once before the first start: `npm run migrate`.
//
// The process is launched through deploy/start-with-keyring.sh, which unlocks the OS keychain
// (gnome-keyring) in its D-Bus session before exec'ing `npm run start`. buy's mainnet signing
// reads the wallet key from that keychain, so the app must run inside the unlocked session.
module.exports = {
  apps: [
    {
      name: 'mypadi',
      script: 'deploy/start-with-keyring.sh',
      interpreter: 'bash',
      cwd: __dirname,
      instances: 1, // single instance: the Telegram long-poll loop must not run twice.
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
