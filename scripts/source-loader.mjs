// Load the production TypeScript graph without emitting test builds or using strip-only transforms.
import {registerHooks} from 'node:module';
import {existsSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
const root=new URL('../',import.meta.url).href;
registerHooks({
 resolve(specifier,context,next){
  if(specifier.startsWith('.')&&context.parentURL?.startsWith(root)){
   const url=new URL(specifier,context.parentURL);
   const directoryEntry=new URL(url.href+'/index.ts');if(existsSync(fileURLToPath(directoryEntry)))return next(directoryEntry.href,context);
   if(!existsSync(fileURLToPath(url))&&url.pathname.endsWith('.js')){const candidate=new URL(url.href.slice(0,-3)+'.ts');if(existsSync(fileURLToPath(candidate)))return next(candidate.href,context);}
   if(!existsSync(fileURLToPath(url)))for(const suffix of ['.ts','.js']){
    const candidate=new URL(url.href+suffix);if(existsSync(fileURLToPath(candidate)))return next(candidate.href,context);
   }
  }
  return next(specifier,context);
 },
 load(url,context,next){
  if(url.startsWith(root)&&url.endsWith('.ts'))return{format:'module',source:ts.transpileModule(readFileSync(fileURLToPath(url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,shortCircuit:true};
  return next(url,context);
 },
});
