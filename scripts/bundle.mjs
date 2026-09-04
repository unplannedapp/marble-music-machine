/** Build a single-file HTML of the game (for sharing as one page). Run after `npm run build`. */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
const out = process.argv[2] ?? 'dist/marble-music-machine.html';
const js = readdirSync('dist/assets').find((n) => n.endsWith('.js'));
const src = readFileSync('dist/assets/' + js, 'utf8');
const page = readFileSync('index.html', 'utf8');
const body = page.slice(page.indexOf('<title>'), page.indexOf('</head>')) + page.slice(page.indexOf('<body>') + 6, page.indexOf('</body>'));
const html = body.replace(/<script type="module" src="[^"]+"><\/script>/, () => `<script type="module">\n${src}\n</script>`);
writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1e6).toFixed(2)} MB)`);
