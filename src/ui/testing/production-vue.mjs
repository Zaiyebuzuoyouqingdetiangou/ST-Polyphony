// Exercise the real SFC setup/render/event handlers in memory, without a browser or host data.
import '../../../scripts/source-loader.mjs';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse, compileScript } from 'vue/compiler-sfc';
import ts from 'typescript';
import { createRenderer, nextTick } from 'vue';
registerHooks({load(url, context, next) {
  if (!url.endsWith('.vue')) return next(url, context);
  const filename = fileURLToPath(url), { descriptor } = parse(readFileSync(filename, 'utf8'), { filename });
  const compiled = compileScript(descriptor, { id: 'memory-test', inlineTemplate: true });
  return { format: 'module', source: ts.transpileModule(compiled.content, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText, shortCircuit: true };
}});

export class Events {
  listeners = new Map();
  addEventListener(type, listener) { const set = this.listeners.get(type) ?? new Set(); set.add(listener); this.listeners.set(type, set); }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  dispatch(type, event) { for (const listener of [...this.listeners.get(type) ?? []]) listener(event); }
}
export function event(target, options = {}) {
  return { target, currentTarget: target, button: 0, isPrimary: true, pointerId: 1, clientX: 0, clientY: 0, defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, stopImmediatePropagation() { this.stopped = true; },
    composedPath() { const path=[];let node=this.target;while(node){path.push(node);node=node.parent;}return path; }, ...options };
}
export class MemoryNode extends Events {
  constructor(tag='div', text='') { super(); this.tagName=tag.toUpperCase(); this.text=text; this.props={}; this.children=[]; this.parent=null; this.nodeType=1; this.style={setProperty(k,v){this[k]=v;}}; this.value=''; this.type='text'; }
  get className(){return this.props.class??'';} set className(value){this.props.class=value;}
  get textContent(){return this.text+this.children.map(child=>child.textContent).join('');} set textContent(value){this.text=String(value);this.children=[];}
  get ownerDocument(){return globalThis.document;}
  get parentElement(){return this.parent;}
  appendChild(node){node.remove();node.parent=this;this.children.push(node);return node;}
  remove(){if(this.parent){const at=this.parent.children.indexOf(this);if(at>=0)this.parent.children.splice(at,1);}this.parent=null;}
  setAttribute(name,value){this.props[name]=String(value);} getAttribute(name){return this.props[name]??null;} hasAttribute(name){return this.props[name]!==undefined && this.props[name]!==false;}
  matches(selector){return selector.split(',').some(part=>{part=part.trim();const disabled=part.includes(':not(:disabled)');part=part.replace(':not(:disabled)','');if(disabled&&this.props.disabled)return false;const tag=/^[a-z]+/i.exec(part);if(tag&&this.tagName!==tag[0].toUpperCase())return false;for(const match of part.matchAll(/\.([\w-]+)/g))if(!this.className.split(/\s+/).includes(match[1]))return false;for(const match of part.matchAll(/\[([^=\]]+)(?:=["']?([^\]"']+)["']?)?\]/g)){const name=match[1].replace(/~$/,'');if(!this.hasAttribute(name)||match[2]!==undefined&&(match[1].endsWith('~')?!String(this.props[name]).split(/\s+/).includes(match[2]):String(this.props[name])!==match[2]))return false;}return true;});}
  querySelectorAll(selector){return this.children.flatMap(child=>[...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)]);}
  querySelector(selector){return this.querySelectorAll(selector)[0]??null;}
  closest(selector){let node=this;while(node){if(node.matches?.(selector))return node;node=node.parent;}return null;}
  contains(node){while(node){if(node===this)return true;node=node.parent;}return false;}
  getRootNode(){let node=this;while(node.parent)node=node.parent;return node;}
  getBoundingClientRect(){return {left:0,top:0,width:400,height:600};} getClientRects(){let branch=this;for(let p=this.parent;p;branch=p,p=p.parent)if(p.tagName==='DETAILS'&&!p.props.open&&branch.tagName!=='SUMMARY')return [];return [this.getBoundingClientRect()];}
  focus(){this.getRootNode().activeElement=this;this.ownerDocument.activeElement=this;} select(){}
  fire(type, options={}) {const e=event(this,options);let node=this;while(node&&!e.stopped){e.currentTarget=node;node.dispatch(type,e);const handler=node.props['on'+type[0].toUpperCase()+type.slice(1)];for(const listener of Array.isArray(handler)?handler:handler?[handler]:[])listener(e);node=node.parent;}if(!e.defaultPrevented&&this.tagName==='SUMMARY'&&(type==='click'||type==='keydown'&&['Enter',' '].includes(e.key)))this.parent.props.open=!this.parent.props.open;return e;}
}
export async function settle(){for(let i=0;i<5;i++){await Promise.resolve();await nextTick();}}
export function createMemoryHost() {
  const previous = Object.fromEntries(['document','window','HTMLElement','HTMLInputElement','Element','Document','ShadowRoot','getComputedStyle'].map(key=>[key,globalThis[key]]));
  const root=new MemoryNode('root'); root.nodeType=11;root.host=new MemoryNode('host');
  const viewport=new Events();Object.assign(viewport,{innerWidth:390,innerHeight:844,visualViewport:new Events()});
  const documentRef=new Events();Object.assign(documentRef,{createElement:tag=>new MemoryNode(tag),defaultView:viewport,activeElement:null});
  Object.assign(globalThis,{document:documentRef,window:viewport,HTMLElement:MemoryNode,Element:MemoryNode,Document:class {},ShadowRoot:class {},HTMLInputElement:class extends MemoryNode{},getComputedStyle:()=>({fontFamily:'test font',getPropertyValue:()=>'',position:'fixed'})});
  // Only inputs should satisfy the editor's implicit Enter check.
  Object.defineProperty(globalThis.HTMLInputElement,Symbol.hasInstance,{value:node=>node?.tagName==='INPUT'});
  const renderer=createRenderer({
    createElement:tag=>new MemoryNode(tag),createText:text=>new MemoryNode('#text',text),createComment:text=>new MemoryNode('#comment'),
    setText:(node,text)=>node.text=text,setElementText:(node,text)=>node.textContent=text,
    patchProp(node,key,_old,value){node.props[key]=key==='open'&&value===''?true:value;if(['value','type','readOnly'].includes(key))node[key]=value;},
    insert(node,parent,anchor=null){node.remove();node.parent=parent;const at=anchor?parent.children.indexOf(anchor):-1;if(at<0)parent.children.push(node);else parent.children.splice(at,0,node);},
    remove:node=>node.remove(),parentNode:node=>node.parent,nextSibling:node=>node.parent?.children[node.parent.children.indexOf(node)+1]??null,
    querySelector:()=>root,
  });
  const apps=[];
  return {root,viewport,documentRef,async mount(component,props){const container=new MemoryNode('container');root.appendChild(container);const app=renderer.createApp(component,props);apps.push(app);app.mount(container);await settle();return{app,container};},
    cleanup(){for(const app of apps)app.unmount();for(const [key,value]of Object.entries(previous)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}};
}
