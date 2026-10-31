import {createReadStream,createWriteStream} from 'node:fs';
import {mkdir,open,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createGzip,constants} from 'node:zlib';
import {pipeline} from 'node:stream/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {digestFile} from './prepare-model.mjs';

const root=fileURLToPath(new URL('../',import.meta.url)),source=process.argv[2],tag=process.argv[3];
if(!source||!tag||!/^[A-Za-z0-9._-]+$/.test(tag))throw new Error('Usage: node scripts/package-model-release.mjs <complete.3dm> <release-tag>');
const directory=path.join(root,'.local/model-release',tag);await mkdir(directory,{recursive:true});
const model={name:path.basename(source),...await digestFile(source)},archivePath=path.join(directory,'space.3dm.gz');
console.log('Losslessly compressing full Rhino model…');
await pipeline(createReadStream(source),createGzip({level:constants.Z_BEST_COMPRESSION}),createWriteStream(archivePath));
const archive={compression:'gzip',...await digestFile(archivePath)},parts=[],file=await open(archivePath,'r');
const partSize=16*1024*1024,buffer=Buffer.alloc(partSize);
try{let position=0;while(position<archive.bytes){
  let length=0;while(length<Math.min(partSize,archive.bytes-position)){const {bytesRead}=await file.read(buffer,length,Math.min(partSize-length,archive.bytes-position-length),position+length);if(!bytesRead)throw new Error('Archive truncated while splitting');length+=bytesRead;}
  const data=buffer.subarray(0,length),name='space.3dm.gz.part'+String(parts.length+1).padStart(2,'0');
  await writeFile(path.join(directory,name),data);parts.push({name,bytes:length,sha256:createHash('sha256').update(data).digest('hex'),url:`https://github.com/dongfeng19830925-stack/laser-space/releases/download/${tag}/${name}`});position+=length;
}}finally{await file.close();}
const manifest={schemaVersion:1,release:{tag,url:`https://github.com/dongfeng19830925-stack/laser-space/releases/tag/${tag}`},model,archive,parts};
await mkdir(path.join(root,'models'),{recursive:true});await writeFile(path.join(root,'models/manifest.json'),JSON.stringify(manifest,null,2)+'\n');
await writeFile(path.join(directory,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({releaseTag:tag,directory,parts:parts.map(p=>({name:p.name,bytes:p.bytes})),modelSha256:model.sha256},null,2));
