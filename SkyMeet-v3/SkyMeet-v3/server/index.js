import { version } from './version.js';
import { createApp } from './app.js';
const { server, close, ready } = createApp();
await ready;
const port = Number(process.env.PORT || 3000);
server.listen(port, '0.0.0.0', () => console.log(JSON.stringify({ event: 'listening', port, version })));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, async () => { setTimeout(() => process.exit(1),25000).unref();try{await close();process.exit(0);}catch{process.exit(1);} });
