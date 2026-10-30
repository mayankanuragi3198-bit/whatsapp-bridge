const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN || 'secret123';

let sock = null;
let currentQR = '';
let connectionStatus = 'disconnected';

async function startWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: 'silent' }),
    browser: ["Chrome", "Desktop", "10.0"]
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      currentQR = qr;
      connectionStatus = 'qr_ready';
    }
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      connectionStatus = 'disconnected';
      currentQR = '';
      if (shouldReconnect) {
        setTimeout(startWhatsApp, 3000);
      }
    } else if (connection === 'open') {
      connectionStatus = 'connected';
      currentQR = '';
    }
  });

  sock.ev.on('creds.update', saveCreds);
}

const verifyToken = (req, res, next) => {
  const token = req.headers['authorization'] || req.headers['x-bridge-token'] || req.query.token || req.body?.token;
  const cleanToken = token ? token.replace('Bearer ', '') : '';
  if (!cleanToken || cleanToken !== BRIDGE_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

app.get('/', (req, res) => {
  res.send({ status: 'running', connection: connectionStatus });
});

app.get('/qr', verifyToken, async (req, res) => {
  if (connectionStatus === 'connected') {
    return res.json({ status: 'connected', message: 'Already connected' });
  }
  if (!currentQR) {
    return res.json({ status: 'waiting', message: 'QR generating, please wait 5 seconds and retry.' });
  }
  try {
    const qrImage = await qrcode.toDataURL(currentQR);
    res.json({ status: 'qr_ready', qr: qrImage });
  } catch (e) {
    res.status(500).json({ error: 'QR conversion failed' });
  }
});

app.listen(PORT, () => {
  startWhatsApp();
});
