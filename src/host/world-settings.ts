import {getHostContext,type HostContext} from './host-context';
import type {WorldSettingsReader,WorldSettings} from '../application/contracts';
import {canonicalBook,excludedWorldBooks,worldInfoBindings} from './general-settings';
import {scopedWorldNames} from './world-book-catalog.js';
const object=(value:unknown):Record<string,any>|null=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,any>:null;
/** Read each permitted current source once; a failed external primary never selects its embedded old copy. */
export function createWorldSettingsReader({getContext=getHostContext}:{getContext?:()=>HostContext|undefined}={}):WorldSettingsReader {
  return{async read(){
    const result:WorldSettings={characterDescription:'',books:[],partial:false};
    const context=getContext();if(!context)return{...result,partial:true};
    const characters=context.characters as unknown[]|undefined,card=object(characters?.[Number(context.characterId)]);
    result.characterDescription=typeof card?.description==='string'?card.description:typeof card?.data?.description==='string'?card.data.description:'';
    let bindings:Record<string,any>={};
    try{bindings=await worldInfoBindings(context);}catch{result.partial=true;}
    let helperBooks:Record<string,any>|null=null;
    try{helperBooks=object(typeof bindings.getCharLorebooks==='function'?bindings.getCharLorebooks():(globalThis as any).TavernHelper?.getCharLorebooks?.());}catch{result.partial=true;}
    const names=new Map<string,string>();
    for(const items of scopedWorldNames(context,{...bindings,getCharLorebooks:()=>helperBooks??{}},{complete:true}).values())for(const name of items)names.set(canonicalBook(name),name);
    const load=context.loadWorldInfo??bindings.loadWorldInfo;
    const excluded=new Set(excludedWorldBooks(context.extensionSettings).map(canonicalBook));
    const entriesFor=(raw:unknown)=>Object.entries(object(raw)??(Array.isArray(raw)?raw:{})).flatMap(([id,value])=>{
      const item=object(value);if(!item||item.disable===true||item.enabled===false)return [];
      if(typeof item.content!=='string'||!item.content.trim()){result.partial=true;return [];}
      const ext=object(item.extensions)??{},valueFor=(key:string)=>item[key]??ext[key];
      return[{id:String(item.uid??item.id??id),content:item.content,comment:typeof item.comment==='string'?item.comment:typeof item.name==='string'?item.name:'',keys:(Array.isArray(item.key??item.keys)?item.key??item.keys:[]).filter((v:unknown)=>typeof v==='string'),secondaryKeys:(Array.isArray(item.keysecondary??item.secondary_keys)?item.keysecondary??item.secondary_keys:[]).filter((v:unknown)=>typeof v==='string'),constant:valueFor('constant')===true,selective:valueFor('selective')===true,selectiveLogic:valueFor('selectiveLogic'),useProbability:valueFor('useProbability')===true,probability:valueFor('probability')}];
    });
    const permitted=[...names].filter(([key])=>!excluded.has(key));
    if(permitted.length&&typeof load!=='function')result.partial=true;
    if(typeof load==='function')for(const [,name] of permitted)try{
      const book=object(await load(name));if(!book){result.partial=true;continue;}
      result.books.push({name,entries:entriesFor(book.entries)});
    }catch{result.partial=true;}
    const primary=helperBooks?.primary||card?.data?.extensions?.world||card?.extensions?.world;
    const embedded=object(card?.data?.character_book??card?.character_book),embeddedName=typeof embedded?.name==='string'&&embedded.name.trim()?embedded.name.trim():'角色内置世界书';
    if(!(typeof primary==='string'&&primary.trim())&&embedded&&!names.has(canonicalBook(embeddedName))&&!excluded.has(canonicalBook(embeddedName)))result.books.push({name:embeddedName,entries:entriesFor(embedded.entries)});
    return result;
  }};
}
