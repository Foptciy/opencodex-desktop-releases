import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const [sourceRoot,version,sourceCommit,reportPath]=process.argv.slice(2);
const {hashFile,verifySynchronizedRelease}=await import(pathToFileURL(join(sourceRoot,'scripts/release-package-validation.mjs')));
const repo='Foptciy/opencodex-desktop-releases';
const gh=args=>execFileSync('gh',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});
const latest=JSON.parse(gh(['api',`repos/${repo}/releases/latest`]));
assert.equal(latest.tag_name,'v'+version);assert.equal(latest.draft,false);assert.equal(latest.prerelease,false);
const directory=mkdtempSync(join(tmpdir(),'opencodex-public-verification-'+version+'-'));
console.log('Downloading '+latest.assets.length+' public assets into '+directory);
const download=spawnSync('gh',['release','download','v'+version,'--repo',repo,'--dir',directory],{stdio:'inherit'});
assert.equal(download.status,0,'Public asset download failed');
const verified=await verifySynchronizedRelease(directory,version,sourceCommit);
assert.equal(verified.platforms.macos.architecture,'arm64');assert.equal(verified.platforms.windows.architecture,'x64');
assert.deepEqual(JSON.parse(readFileSync(join(directory,'release.json'),'utf8')),verified);
const files=[...verified.files,await hashFile(directory,'release.json')];
assert.equal(readFileSync(join(directory,'SHA256SUMS.txt'),'utf8'),files.map(f=>f.sha256+'  '+f.name+'\n').join(''));
files.push(await hashFile(directory,'SHA256SUMS.txt'));
assert.equal(files.length,13);assert.equal(latest.assets.length,files.length);
for(const file of files){const asset=latest.assets.find(a=>a.name===file.name);assert.ok(asset,'Missing '+file.name);assert.equal(asset.size,file.size);assert.equal(asset.digest,'sha256:'+file.sha256)}
for(const name of ['latest-mac.yml','latest.yml']){const response=await fetch(`https://github.com/${repo}/releases/latest/download/${name}`,{signal:AbortSignal.timeout(30000)});assert.ok(response.ok,'Latest feed unavailable: '+name);assert.deepEqual(Buffer.from(await response.arrayBuffer()),readFileSync(join(directory,name)))}
assert.equal(gh(['api','repos/Foptciy/opencodex-desktop/commits/main','--jq','.sha']).trim(),sourceCommit);
const report={success:true,version,sourceCommit,url:latest.html_url,draft:false,prerelease:false,checkedAt:new Date().toISOString(),latestFeeds:['latest-mac.yml','latest.yml'],files,directory};
writeFileSync(reportPath ?? join(directory,'verification-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({success:true,version,sourceCommit,publicAssets:files.length,latestFeeds:report.latestFeeds,url:latest.html_url,report:reportPath ?? join(directory,'verification-report.json')},null,2));
