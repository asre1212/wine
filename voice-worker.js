function workerMain(){
 let pipe; let lock=false;
 // Pin downloads and reject all network writes. No telemetry or inference API.
 const net=self.fetch.bind(self);
 self.fetch=(input,options={})=>{
  const u=new URL(typeof input==='string'?input:input.url);
  const method=(options.method||(input&&input.method)||'GET').toUpperCase();
  if(method!=='GET'||!['https://huggingface.co','https://cdn.jsdelivr.net'].includes(u.origin))throw new Error('Voice network request blocked');
  return net(input,{...options,credentials:'omit',referrerPolicy:'no-referrer'});
 };
 self.onmessage=async({data})=>{
  if(lock)return; lock=true;
  try{
   if(!pipe){
    const {pipeline,env}=await import('./vendor/transformers.min.js');
    env.allowLocalModels=false;env.useBrowserCache=true;
    env.backends.onnx.wasm.numThreads=1;env.backends.onnx.wasm.proxy=false;
    pipe=await pipeline('automatic-speech-recognition','Xenova/whisper-tiny.en',{revision:'79fb389fc764e7c395bd330e9531d9d32ada7049',device:'wasm',dtype:'q8',progress_callback:p=>self.postMessage({progress:p.status==='progress'?`Downloading speech files: ${Math.round(p.progress||0)}%`:'Loading local speech model…'})});
   }
   if(data.op==='load')self.postMessage({id:data.id,ready:true});
   else {const r=await pipe(data.audio,{chunk_length_s:30,stride_length_s:5});self.postMessage({id:data.id,text:r.text});}
  }catch(e){self.postMessage({id:data.id,error:e.message||String(e)});}finally{lock=false;}
 };
}
workerMain();

