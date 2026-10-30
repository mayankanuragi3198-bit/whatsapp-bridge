const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN || 'secret123';

let sock = null;
let qrCodeData = '';
let connectionStatus = 'disconnected';

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
  
  sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    logger: pino({ level: 'silent' })
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      qrCodeData = qr;
      connectionStatus = 'qr_ready';
    }
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      connectionStatus = 'disconnected';
      if (shouldReconnect) {
        connectToWhatsApp();
      }
    } else if (connection === 'open') {
      connectionStatus = 'connected';
      qrCodeData = '';
      console.log('WhatsApp connected successfully!');
    }
  });

  sock.ev.on('creds.update', saveCreds);
}

const verifyToken = (req, res, next) => {
  const token = req.headers['authorization'] || req.query.token;
  if (!token || token.replace('Bearer ', '') !== BRIDGE_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized: Invalid Bridge Token' });
  }
  next();
};

app.get('/', (req, res) => {
  res.send({ status: 'running', connection: connectionStatus });
});

app.get('/qr', verifyToken, async (req, res) => {
  if (connectionStatus === 'connected') {
    return res.json({ status: 'connected', message: 'WhatsApp is already connected!' });
  }
  if (!qrCodeData) {
    return res.json({ status: 'waiting', message: 'QR code is generating, please wait a few seconds and refresh.' });
  }
  try {
    const qrImage = await qrcode.toDataURL(qrCodeData);
    res.json({ status: 'qr_ready', qr: qrImage });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate QR code image' });
  }
});

app.post('/send', verifyToken, async (req, res) => {
  const { phone, message } = req.body;
  if (!phone || !message) {
    return res.status(400).json({ error: 'Phone and message are required' });
  }
  if (!sock || connectionStatus !== 'connected') {
    return res.status(400).json({ error: 'WhatsApp is not connected yet.' });
  }
  try {
    const chatId = phone.includes('@s.whatsapp.net') ? phone : `${phone}@s.whatsapp.net`;
    await sock.sendMessage(chatId, { text: message });
    res.json({ success: true, message: 'Message sent successfully!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`WhatsApp Bridge running on port ${PORT}`);
  connectToWhatsApp();
});
