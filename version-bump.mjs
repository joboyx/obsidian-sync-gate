import { readFileSync, writeFileSync } from 'fs';

const targetVersion = process.env.npm_package_version;

// Set manifest.json to the new version and keep its minAppVersion.
const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeFileSync('manifest.json', JSON.stringify(manifest, null, '\t') + '\n');

// Map the new version to minAppVersion in versions.json, unless it is already there.
const versions = JSON.parse(readFileSync('versions.json', 'utf8'));
if (!(targetVersion in versions)) {
	versions[targetVersion] = minAppVersion;
	writeFileSync('versions.json', JSON.stringify(versions, null, '\t') + '\n');
}
