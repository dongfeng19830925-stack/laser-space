import {createReadStream,createWriteStream} from 'node:fs';
import {mkdir,readFile,rename,stat,unlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createGunzip} from 'node:zlib';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
export async function digestFile(filename){
  const hash=createHash('sha256');let bytes=0;
  for await(const chunk of createReadStream(filename)){hash.update(chunk);bytes+=chunk.length;}
  return {bytes,sha256:hash.digest('hex')};
}
const matches=(a,b)=>a.bytes===b.bytes&&a.sha256===b.sha256;
async function validFile(filename,expected){try{if((await stat(filename)).size!==expected.bytes)return false;return matches(await digestFile(filename),expected);}catch(error){if(error.code==='ENOENT')return false;throw error;}}

export async function prepareModel({target=path.join(root,'public/models/space.3dm'),localPartsDir=null}={}){
  const manifest=JSON.parse(await readFile(path.join(root,'models/manifest.json'),'utf8'));
  if(manifest.schemaVersion!==1||manifest.archive.compression!=='gzip')throw new Error('Unsupported model manifest');
  if(await validFile(target,manifest.model)){console.log('Rhino model ready: SHA-256 verified.');return {cached:true,...manifest.model};}
  const cache=path.join(root,'.local/model-parts');await mkdir(cache,{recursive:true});await mkdir(path.dirname(target),{recursive:true});
  const files=[];
  for(const part of manifest.parts){
    if(!/^[A-Za-z0-9._-]+$/.test(part.name))throw new Error('Invalid model part name');
    const filename=localPartsDir?path.join(localPartsDir,part.name):path.join(cache,part.sha256+'-'+part.name);
    if(!await validFile(filename,part)){
      if(localPartsDir)throw new Error('Model part missing or corrupt: '+part.name);
      const url=new URL(part.url);
      if(url.origin!=='https://github.com'||!url.pathname.startsWith('/dongfeng19830925-stack/laser-space/releases/download/'))throw new Error('Unexpected model release URL');
      console.log('Downloading model part: '+part.name);
      const response=await fetch(url,{signal:AbortSignal.timeout(180000)});
      if(!response.ok||!response.body)throw new Error(`Model part download failed: ${response.status} ${part.name}`);
      const temporary=filename+'.tmp-'+process.pid;
      try{
        await pipeline(Readable.fromWeb(response.body),createWriteStream(temporary));
        if(!await validFile(temporary,part))throw new Error('Model part checksum mismatch: '+part.name);
        await rename(temporary,filename);
      }finally{await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
    }
    files.push(filename);
  }
  const archiveHash=createHash('sha256'),modelHash=createHash('sha256');let archiveBytes=0,modelBytes=0;
  const archiveTap=new Transform({transform(chunk,encoding,callback){archiveHash.update(chunk);archiveBytes+=chunk.length;callback(null,chunk);}});
  const modelTap=new Transform({transform(chunk,encoding,callback){modelHash.update(chunk);modelBytes+=chunk.length;callback(null,chunk);}});
  async function* join(){for(const filename of files)for await(const chunk of createReadStream(filename))yield chunk;}
  const temporary=path.join(root,'.local','restored-model-'+process.pid+'.3dm.tmp');
  try{
    await pipeline(Readable.from(join(),{objectMode:false}),archiveTap,createGunzip(),modelTap,createWriteStream(temporary));
    if(!matches({bytes:archiveBytes,sha256:archiveHash.digest('hex')},manifest.archive))throw new Error('Reassembled archive checksum mismatch');
    if(!matches({bytes:modelBytes,sha256:modelHash.digest('hex')},manifest.model))throw new Error('Restored Rhino model checksum mismatch');
    await rename(temporary,target);
  }finally{await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
  console.log('Rhino model restored from Release parts: '+modelBytes+' bytes, SHA-256 verified.');
  return {cached:false,...manifest.model};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await prepareModel();
