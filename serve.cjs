const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3777;
const DIR = __dirname;
const DATA_FILE = path.join(DIR, 'context.json');
const HTML_FILE = path.join(DIR, 'tasks.html');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function readData() {
  try {
    return fs.readFileSync(DATA_FILE, 'utf-8');
  } catch {
    return '[]';
  }
}

function writeData(body) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(JSON.parse(body), null, 2), 'utf-8');
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  if (req.url === '/api/tasks' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(readData());
  }

  if (req.url === '/api/tasks' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        writeData(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(`{"error":"${e.message}"}`);
      }
    });
    return;
  }

  if (req.url === '/' || req.url === '/index.html') {
    try {
      const html = fs.readFileSync(HTML_FILE, 'utf-8');
      res.writeHead(200, { 'Content-Type': MIME['.html'] });
      return res.end(html);
    } catch {
      res.writeHead(404);
      return res.end('tasks.html not found');
    }
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`Task Control running at http://localhost:${PORT}`);
});
