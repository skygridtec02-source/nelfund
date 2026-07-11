import express from 'express';
import cors from 'cors';
import { createServer } from 'http';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (_req, res) => {
  res.json({ ok: true, service: 'NelPay backend', host: 'nelpaybackend.vercel.app' });
});

app.post('/api/public/mpesa/timeout', (_req, res) => {
  res.status(200).json({ ok: true, message: 'timeout received' });
});

app.post('/api/public/mpesa/result', (_req, res) => {
  res.status(200).json({ ok: true, message: 'result received' });
});

app.post('/api/public/mpesa/c2b-confirmation', (_req, res) => {
  res.status(200).json({ ok: true, message: 'c2b confirmation received' });
});

app.post('/api/public/mpesa/c2b-validation', (_req, res) => {
  res.status(200).json({ ok: true, message: 'c2b validation received' });
});

const port = Number(process.env.PORT || 3001);
const server = createServer(app);
server.listen(port, () => {
  console.log(`NelPay backend listening on port ${port}`);
});
