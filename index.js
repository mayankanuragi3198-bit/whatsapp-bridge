const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/', (req, res) => {
  res.send('Shiv Shakti Nagar WhatsApp Bridge is Running!');
});

app.listen(PORT, () => {
  console.log(`Bridge server is running on port ${PORT}`);
});
