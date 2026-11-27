// Copies the web app (repository root) into desktop/web, which is what the program serves.
const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..'); const out = path.join(__dirname, 'web');
fs.rmSync(out, { recursive: true, force: true });
for (const f of ['index.html', 'styles.css', 'manifest.webmanifest', 'js', 'data', 'vendor', 'icons']) fs.cpSync(path.join(root, f), path.join(out, f), { recursive: true });
console.log('staged web app into', out);
