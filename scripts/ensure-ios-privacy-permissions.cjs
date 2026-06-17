const fs = require("fs");
const path = require("path");

if (process.env.CAPACITOR_PLATFORM_NAME && process.env.CAPACITOR_PLATFORM_NAME !== "ios") {
  process.exit(0);
}

const rootDir = process.env.CAPACITOR_ROOT_DIR || process.cwd();
const infoPlistPath = path.join(rootDir, "ios", "App", "App", "Info.plist");

if (!fs.existsSync(infoPlistPath)) {
  process.exit(0);
}

const requiredKeys = [
  ["NSCameraUsageDescription", "Stafly needs camera access so workers can take photos for documents and profile verification."],
  ["NSPhotoLibraryUsageDescription", "Stafly needs photo library access so workers can upload existing document and profile photos."],
  ["NSPhotoLibraryAddUsageDescription", "Stafly needs permission to save photos only when workers choose to use photo upload features."],
];

let plist = fs.readFileSync(infoPlistPath, "utf8");
const missing = requiredKeys.filter(([key]) => !plist.includes(`<key>${key}</key>`));

if (missing.length === 0) {
  process.exit(0);
}

const insertion = missing
  .map(([key, value]) => `\t<key>${key}</key>\n\t<string>${value}</string>`)
  .join("\n");

plist = plist.replace(/\n<\/dict>\s*\n<\/plist>\s*$/, `\n${insertion}\n</dict>\n</plist>\n`);
fs.writeFileSync(infoPlistPath, plist);
console.log(`Added iOS privacy permission descriptions to ${infoPlistPath}`);