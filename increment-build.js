import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const packagePath = path.join(__dirname, 'package.json');
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

const versionParts = pkg.version.split('.');
if (versionParts.length === 4) {
  versionParts[3] = parseInt(versionParts[3]) + 1;
  pkg.version = versionParts.join('.');
  fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`Version incremented to ${pkg.version}`);
} else {
  console.error('Version format is not major.minor.patch.build');
  process.exit(1);
}