// Builds SuperFood for macOS (Apple silicon) and Windows (portable) into desktop/dist.
const { packager } = require('@electron/packager');
const path = require('path'); const fs = require('fs');
const version = require('./package.json').version;
(async () => {
  const common = { dir: __dirname, name: 'SuperFood', out: path.join(__dirname, 'dist'), overwrite: true, appVersion: version,
    ignore: [/^\/dist/, /^\/build/, /^\/stage\.js$/, /^\/build\.js$/, /^\/node_modules\/(?!$)/] };
  await packager({ ...common, platform: 'darwin', arch: 'arm64', icon: path.join(__dirname, 'build/icon.icns'), appBundleId: 'com.superfood.app', appCategoryType: 'public.app-category.lifestyle' });
  const [winDir] = await packager({ ...common, platform: 'win32', arch: 'x64', icon: path.join(__dirname, 'build/icon.ico'),
    win32metadata: { CompanyName: 'Max', ProductName: 'SuperFood', FileDescription: 'SuperFood' } });
  fs.writeFileSync(path.join(winDir, 'portable.txt'), 'Данные SuperFood хранятся рядом, в папке data.\r\n');
  console.log('done');
})().catch((e) => { console.error(e); process.exit(1); });
