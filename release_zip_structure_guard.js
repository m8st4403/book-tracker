const fs = require('fs');
const cp = require('child_process');

const zipPath = process.argv[2];
if (!zipPath) { console.error('usage: node release_zip_structure_guard.js <zip>'); process.exit(2); }
if (!fs.existsSync(zipPath)) { console.error(`FAIL | ZIP-STRUCT | ZIP not found: ${zipPath}`); process.exit(2); }

const raw = cp.execFileSync('unzip', ['-Z1', zipPath], {encoding:'utf8'});
const listing = raw.split(/\r?\n/).filter(Boolean);
const requiredRoots = ['GitHubアップロード', 'アップロード不要'];

const rootSet = new Set(listing.map(x => x.split('/')[0]));
const unexpectedRoots = [...rootSet].filter(x => !requiredRoots.includes(x));

for (const root of requiredRoots) {
  if (!rootSet.has(root)) {
    console.error(`FAIL | ZIP-STRUCT | exact UTF-8 root missing: ${root}`);
    process.exit(1);
  }
}
if (unexpectedRoots.length) {
  console.error(`FAIL | ZIP-STRUCT | unexpected root(s): ${unexpectedRoots.join(', ')}`);
  process.exit(1);
}

const uploadEntries = listing.filter(x => x.startsWith('GitHubアップロード/'));
const unnecessaryEntries = listing.filter(x => x.startsWith('アップロード不要/'));
if (!uploadEntries.length) {
  console.error('FAIL | ZIP-STRUCT | GitHubアップロード is empty');
  process.exit(1);
}
if (!unnecessaryEntries.length) {
  console.error('FAIL | ZIP-STRUCT | アップロード不要 is empty');
  process.exit(1);
}

// Verify exact UTF-8 names by round-tripping the ZIP listing through Node strings.
// This catches the class of mojibake/renamed-folder failures that a generic
// "two roots exist" assertion can miss.
for (const required of requiredRoots) {
  const exactDirEntry = `${required}/`;
  const exactFileEntry = `${required}/`;
  const hasDirEntry = listing.includes(exactDirEntry);
  if (!hasDirEntry) {
    console.error(`FAIL | ZIP-STRUCT | exact directory entry missing: ${exactDirEntry}`);
    process.exit(1);
  }
}

// Also reject common mojibake markers and replacement characters anywhere in roots.
const badRootPattern = /�|(?:Ã|Â|â|ð|ï¿½|πé|╕Φ)/;
const badRoots = [...rootSet].filter(x => badRootPattern.test(x));
if (badRoots.length) {
  console.error(`FAIL | ZIP-STRUCT | mojibake/replacement root(s): ${badRoots.join(', ')}`);
  process.exit(1);
}

console.log(`PASS | ZIP-STRUCT | exactRoots=${JSON.stringify(requiredRoots)} | entries=${listing.length}`);
