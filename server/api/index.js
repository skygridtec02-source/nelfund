export default async function handler(req, res) {
  const url = new URL(req.url, 'https://nelpaybackend.vercel.app');

  if (req.method === 'GET' && url.pathname === '/') {
    res.setHeader('content-type', 'application/json');
    res.status(200).end(JSON.stringify({ ok: true, service: 'NelPay backend', host: 'nelpaybackend.vercel.app' }));
    return;
  }

  if (req.method === 'POST') {
    if (url.pathname === '/api/public/mpesa/timeout') {
      res.setHeader('content-type', 'application/json');
      res.status(200).end(JSON.stringify({ ok: true, message: 'timeout received' }));
      return;
    }

    if (url.pathname === '/api/public/mpesa/result') {
      res.setHeader('content-type', 'application/json');
      res.status(200).end(JSON.stringify({ ok: true, message: 'result received' }));
      return;
    }

    if (url.pathname === '/api/public/mpesa/c2b-confirmation') {
      res.setHeader('content-type', 'application/json');
      res.status(200).end(JSON.stringify({ ok: true, message: 'c2b confirmation received' }));
      return;
    }

    if (url.pathname === '/api/public/mpesa/c2b-validation') {
      res.setHeader('content-type', 'application/json');
      res.status(200).end(JSON.stringify({ ok: true, message: 'c2b validation received' }));
      return;
    }
  }

  res.setHeader('content-type', 'application/json');
  res.status(404).end(JSON.stringify({ ok: false, error: 'not found' }));
}
