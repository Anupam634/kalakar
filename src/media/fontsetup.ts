// Imported first by the server: points fontconfig (used by sharp's text renderer) at the bundled
// Google Fonts, so post designs look identical on every machine and Indic scripts shape correctly.
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { config } from "../config.js";

const fontsRoot = join(process.cwd(), "node_modules", "@expo-google-fonts");
const conf = join(config.dataDir, "fonts.conf");
mkdirSync(join(config.dataDir, "fontcache"), { recursive: true });

if (existsSync(fontsRoot)) {
  writeFileSync(
    conf,
    `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${fontsRoot}</dir>
  <cachedir>${join(config.dataDir, "fontcache")}</cachedir>
  <alias><family>sans-serif</family><prefer><family>Inter Tight</family><family>Noto Sans Devanagari</family></prefer></alias>
</fontconfig>
`,
  );
  process.env.FONTCONFIG_FILE = conf;
}
