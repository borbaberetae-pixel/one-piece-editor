import SDK from 'https://cdn.jsdelivr.net/npm/@owlbear-rodeo/sdk@3.1.0/+esm';
// Editor visual v3.3 — modelo, dados e imagens separados.
const $=id=>document.getElementById(id);
const prefix='one-piece-rpg.fichas/';
const groups=[['Identidade',['Nome','Idade','Raça','Classe','Subclasse','Nível','XP','Berries','Recompensa']],['Status',['Vida atual','Vida máxima','Mana atual','Mana máxima','Defesa','Movimentação']],['Atributos',['Força','Destreza','Constituição','Inteligência','Sabedoria','Carisma']],['Habilidades e itens',['Perícias','Habilidades raciais','Habilidades de classe','Akuma no Mi','Haki','Armas','Equipamentos','Inventário','Anotações']]];
const slots=['a','b'], key=(s,f)=>prefix+s+'/'+f, slot=()=>$('sheet').value;
const status=t=>$('status').textContent=t;
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const read=(k,d)=>{try{return JSON.parse(localStorage.getItem(k)||'null')??d;}catch{return d;}};
const store=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));return true;}catch{status('Armazenamento local indisponível ou cheio. Exporte um backup antes de fechar.');return false;}};
const valueStore='rpg-test-values', modelStore='rpg-test-model', artStore='rpg-test-item-art-v3';
let metadata=read(valueStore,{}), art=read(artStore,{}), model=read(modelStore,{image:'',fields:[]});
let OBR,ready=false,editing=true,selected=null,activeSlot=slot();
const inputs=new Map(), pending=new Map();let timer, sending=false, inFlight={};
const kinds=['text','number','area','card','counter'];
const rarities={'Comum':'#a5a5b0','Incomum':'#65c68a','Raro':'#66aaff','Épico':'#b68cff','Lendário':'#e7c17b','Mítico':'#f18b8b'};
const categories=['Outro','Consumível','Arma','Equipamento','Acessório','Material','Tesouro','Item especial','Missão'];
const cardDefaults={name:'',qty:'1',rarity:'Comum',category:'Outro',desc:''};
const defaults={Color:'#ffffff',Size:16,Font:'system-ui',Align:'left',Weight:'normal',Bg:'#ffffff',Opacity:0,Border:0,BorderColor:'#ffffff'};
const cardStyle={...defaults,Size:13,Bg:'#292235',Opacity:94,Border:1,Rarity:true};
const counterStyle={...defaults,Size:20,Align:'center',Weight:'bold'};
const counterDefaults={min:null,max:null,step:1,showName:true,signed:true};
const safeInt=v=>{if(typeof v!=='number'&&typeof v!=='string')return null;if(!/^[+-]?\d+$/.test(String(v).trim()))return null;const n=Number(v);return Number.isSafeInteger(n)?n:null;};
function normalizeCounter(c={}){c=c&&typeof c==='object'?c:{};let min=safeInt(c.min),max=safeInt(c.max);if(min!==null&&max!==null&&min>max)throw Error('O mínimo não pode ser maior que o máximo.');const step=safeInt(c.step);return {min,max,step:step!==null&&step>0?step:1,showName:c.showName!==false,signed:c.signed!==false};}
const counterOf=f=>normalizeCounter(f.counter);
const fieldKey=f=>'visual/'+f.id;
const cardKey=(f,p)=>fieldKey(f)+'/card/'+p;
const hostedImage='https://borbaberetae-pixel.github.io/one-piece-editor/a_highly_detailed_clean_graphic_design_of_a_blank_1.png';
const imageOK=v=>typeof v==='string'&&(v===hostedImage||/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v));
const uid=()=>crypto.randomUUID();
function normalizeModel(m){
 if(!m||!Array.isArray(m.fields)||!(m.image===''||imageOK(m.image)))throw Error('Modelo inválido');
 const ids=new Set();
 const fields=m.fields.map(f=>{if(!f||typeof f.id!=='string'||!f.id||typeof f.name!=='string'||!kinds.includes(f.kind)||!['x','y','w','h'].every(k=>Number.isFinite(f[k])))throw Error('Campo inválido');if(ids.has(f.id))throw Error('IDs duplicados no modelo');ids.add(f.id);const w=Math.max(4,Math.min(100,f.w)),h=Math.max(3,Math.min(100,f.h));return {id:f.id,name:f.name,kind:f.kind,x:Math.max(0,Math.min(100-w,f.x)),y:Math.max(0,Math.min(100-h,f.y)),w,h,style:f.style&&typeof f.style==='object'?f.style:{},...(f.kind==='counter'?{counter:normalizeCounter(f.counter)}:{}),legacyName:typeof f.legacyName==='string'?f.legacyName:(!m.version&&f.kind!=='card'?f.name:undefined)};});
 return {version:3,image:m.image,fields};
}
try{model=normalizeModel(model);}catch{model={version:3,image:'',fields:[]};status('Modelo local inválido. Importe um backup.');}
function persistModel(){if(officialView)return true;return store(modelStore,model);}
function patchValues(patch,{immediate=false}={}){
 Object.assign(metadata,patch);
 if(!ready){store(valueStore,metadata);return;}
 for(const [k,v] of Object.entries(patch))pending.set(k,v);
 clearTimeout(timer);if(immediate)void flush();else timer=setTimeout(flush,350);
}
async function flush(){
 if(!ready||sending||!pending.size)return;
 sending=true;const batch=Object.fromEntries(pending);inFlight=batch;pending.clear();let failed=false;
 try{await OBR.room.setMetadata(batch);status('Alterações salvas na sala.');}
 catch(e){failed=true;for(const [k,v] of Object.entries(batch))if(!pending.has(k))pending.set(k,v);status('Falha ao sincronizar. Dados ainda nesta tela; exporte um backup. '+e.message);}
 finally{inFlight={};sending=false;if(pending.size&&!failed){clearTimeout(timer);timer=setTimeout(flush,50);}}
}
function save(s,f,v,immediate=false){patchValues({[key(s,f)]:v},{immediate});}
// Versões antigas usavam nomes da ficha clássica como chave. Copia uma vez,
// preserva a fonte antiga e nunca volta a compartilhar a chave entre campos.
function migrate(){const patch={};for(const s of slots)for(const f of model.fields){if(f.kind==='card'||!f.legacyName)continue;const dest=key(s,fieldKey(f)),src=key(s,f.legacyName);if(!own(metadata,dest)&&own(metadata,src))patch[dest]=String(metadata[src]);}if(Object.keys(patch).length)patchValues(patch);}
function value(s,f){return metadata[key(s,f)]??'';}
function element(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
function download(data,name){const u=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=element('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
function commitFocus(){if(document.activeElement instanceof HTMLElement)document.activeElement.blur();if(ready)void flush();}
for(const [title,fields] of groups){const h=element('h3','',title);$('fields').append(h);const box=element('div',title!=='Habilidades e itens'?'grid':'');for(const field of fields){const label=element('label','',field);const el=element(title==='Habilidades e itens'?'textarea':'input');label.append(el);box.append(label);inputs.set(field,el);el.oninput=()=>save(activeSlot,field,el.value);el.onchange=()=>save(activeSlot,field,el.value,true);} $('fields').append(box);}
function renderClassic(force=false){for(const [f,e] of inputs)if(force||e!==document.activeElement)e.value=value(activeSlot,f);}
function styleOf(f){return {...(f.kind==='card'?cardStyle:f.kind==='counter'?counterStyle:defaults),...f.style};}
function syncStyle(){const f=model.fields.find(f=>f.id===selected);$('stylepanel').hidden=!editing||!f;if(!f)return;const s=styleOf(f);for(const k of Object.keys(defaults))$('st'+k).value=s[k];$('rename').value=f.name;$('rarityStyle').hidden=f.kind!=='card';$('stRarity').checked=!!s.Rarity;$('counterSettings').hidden=f.kind!=='counter';if(f.kind==='counter'){const c=counterOf(f);$('ctMin').value=c.min??'';$('ctMax').value=c.max??'';$('ctStep').value=c.step;$('ctName').checked=c.showName;$('ctSigned').checked=c.signed;}}
const hex=v=>/^#[0-9a-f]{6}$/i.test(v)?v:'#ffffff';
const num=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));
function applyStyle(el,f){const s=styleOf(f),alpha=Math.round(num(s.Opacity,0,100)*255/100).toString(16).padStart(2,'0');Object.assign(el.style,{color:hex(s.Color),fontSize:num(s.Size,8,96)+'px',fontFamily:s.Font,textAlign:s.Align,fontWeight:s.Weight==='bold'?'bold':'normal',fontStyle:s.Weight==='italic'?'italic':'normal',backgroundColor:hex(s.Bg)+alpha,border:num(s.Border,0,2)+'px solid '+hex(s.BorderColor)});}
function cardValue(s,f,p){return String(metadata[key(s,cardKey(f,p))]??cardDefaults[p]);}
function cardImage(s,f){const v=art[key(s,fieldKey(f))];return imageOK(v)?v:'';}
function refreshCard(box,f,s){
 for(const e of box.querySelectorAll('[data-card-prop]'))if(e!==document.activeElement)e.value=cardValue(s,f,e.dataset.cardProp);
 const rarity=cardValue(s,f,'rarity'),color=rarities[rarity]||rarities.Comum,style=styleOf(f);
 if(style.Rarity&&Number(style.Border)>0)box.style.borderColor=color;
 const sel=box.querySelector('[data-card-prop="rarity"]');if(sel)sel.style.color=color;
 const src=cardImage(s,f),img=box.querySelector('img'),wrap=box.querySelector('.item-art');img.hidden=!src;if(src){if(img.getAttribute('src')!==src)img.src=src;}else img.removeAttribute('src');wrap.classList.toggle('has-art',!!src);wrap.querySelector('.art-placeholder').hidden=!!src;
}
function refreshValues(){for(const d of $('overlays').children){const f=model.fields.find(x=>x.id===d.dataset.id);if(!f)continue;if(f.kind==='card'){const box=d.querySelector('.itemcard');if(box)refreshCard(box,f,activeSlot);}else if(f.kind==='counter'){const box=d.querySelector('.counter');if(box)refreshCounter(box,f,activeSlot);}else{const e=d.querySelector('.field-value');if(e&&e!==document.activeElement)e.value=value(activeSlot,fieldKey(f))||(editing?f.name:'');}}}
function changeStyle(k,v){const f=model.fields.find(f=>f.id===selected);if(!f)return;f.style={...styleOf(f),[k]:v};persistModel();const d=[...$('overlays').children].find(x=>x.dataset.id===f.id),e=d?.querySelector('.field-value,.itemcard,.counter');if(e){applyStyle(e,f);if(f.kind==='card')refreshCard(e,f,activeSlot);}}
for(const k of Object.keys(defaults))$('st'+k).oninput=()=>changeStyle(k,$('st'+k).value);
$('stRarity').onchange=()=>changeStyle('Rarity',$('stRarity').checked);
function updateCounterSettings(){const f=model.fields.find(f=>f.id===selected);if(!f||f.kind!=='counter')return;try{const min=$('ctMin').value,max=$('ctMax').value,step=$('ctStep').value;for(const [raw,label] of [[min,'Mínimo'],[max,'Máximo'],[step,'Passo']])if(raw!==''&&safeInt(raw)===null)throw Error(label+' deve ser um número inteiro válido.');if(safeInt(step)===null||safeInt(step)<=0)throw Error('O passo deve ser um inteiro positivo.');f.counter=normalizeCounter({min,max,step,showName:$('ctName').checked,signed:$('ctSigned').checked});persistModel();draw();}catch(e){status(e.message);syncStyle();}}
for(const id of ['ctMin','ctMax','ctStep','ctName','ctSigned'])$(id).onchange=updateCounterSettings;
$('rename').onchange=()=>{const f=model.fields.find(f=>f.id===selected);if(f&&$('rename').value.trim()){f.name=$('rename').value.trim();persistModel();draw();}};
async function imageData(file,max,quality){if(!file)throw Error('Selecione uma imagem');const bmp=await createImageBitmap(file);try{const c=element('canvas'),scale=Math.min(1,max/Math.max(bmp.width,bmp.height));c.width=Math.max(1,Math.round(bmp.width*scale));c.height=Math.max(1,Math.round(bmp.height*scale));c.getContext('2d').drawImage(bmp,0,0,c.width,c.height);const data=c.toDataURL('image/webp',quality);if(!imageOK(data))throw Error('Não foi possível converter');return data;}finally{bmp.close();}}
function makeCard(f,s,preview){
 const box=element('div','itemcard');applyStyle(box,f);
 const head=element('div','card-head'),pic=element('div','item-art'),img=element('img');img.alt='Imagem do item';pic.append(img,element('div','art-placeholder','◇'));head.append(pic);box.append(head);
 const file=element('input');file.type='file';file.accept='image/png,image/jpeg,image/webp';file.hidden=true;pic.append(file);
 function button(parent,text,fn,title=text,cls=''){const b=element('button',cls,text);b.type='button';b.title=title;b.setAttribute('aria-label',title);b.disabled=preview;b.onclick=fn;parent.append(b);return b;}
 button(pic,'＋',()=>file.click(),'Importar imagem do item');
 file.onchange=async()=>{const chosen=file.files[0];file.value='';if(!chosen)return;try{const data=await imageData(chosen,256,.78);art[key(s,fieldKey(f))]=data;const ok=store(artStore,art);refreshValues();if(ok)status('Imagem do item salva neste navegador.');}catch(e){status('Falha ao importar imagem: '+e.message);}};
 const info=element('div','card-info');head.append(info);
 function control(parent,p,label,type='text',opts){const e=element(type==='area'?'textarea':type==='select'?'select':'input',p==='name'?'item-name':p==='qty'?'card-qty':p==='desc'?'card-desc':'');if(type==='number'){e.type='number';e.min='0';e.max='999999';e.step='1';}if(type==='select')for(const v of opts){const o=element('option','',v);o.value=v;e.append(o);}else e.placeholder=label;e.setAttribute('aria-label',label);e.title=label;e.dataset.cardProp=p;e.disabled=preview;e.value=cardValue(s,f,p);e.oninput=()=>{save(s,cardKey(f,p),e.value);if(p==='rarity')refreshCard(box,f,s);};e.onchange=()=>{if(p==='qty')e.value=String(Math.min(999999,Math.max(0,Math.floor(Number(e.value)||0))));save(s,cardKey(f,p),e.value,true);if(p==='rarity')refreshCard(box,f,s);};parent.append(e);return e;}
 control(info,'rarity','Raridade','select',Object.keys(rarities));control(info,'name','Nome do item');control(info,'category','Categoria','select',categories);
 const row=element('div','card-controls');box.append(row);row.append(element('span','card-label','Qtd.'));
 const changeQty=delta=>{const v=String(Math.min(999999,Math.max(0,Math.floor(Number(cardValue(s,f,'qty'))||0)+delta)));save(s,cardKey(f,'qty'),v,true);refreshCard(box,f,s);};
 button(row,'−',()=>changeQty(-1),'Diminuir quantidade');control(row,'qty','Quantidade','number');button(row,'+',()=>changeQty(1),'Aumentar quantidade');row.append(element('div','card-spacer'));
 button(row,'× img',()=>{delete art[key(s,fieldKey(f))];store(artStore,art);refreshValues();},'Remover imagem');
 button(row,'Limpar',()=>{if(!confirm('Limpar este item somente deste personagem?'))return;const patch={};for(const [p,v] of Object.entries(cardDefaults))patch[key(s,cardKey(f,p))]=v;patchValues(patch,{immediate:true});delete art[key(s,fieldKey(f))];store(artStore,art);refreshCard(box,f,s);},'Limpar item','clear-item');
 control(box,'desc','Descrição, efeitos e observações','area');refreshCard(box,f,s);return box;
}
function clampCounter(n,c){return Math.max(c.min??Number.MIN_SAFE_INTEGER,Math.min(c.max??Number.MAX_SAFE_INTEGER,n));}
function counterValue(s,f){const c=counterOf(f);return safeInt(value(s,fieldKey(f)))??clampCounter(0,c);}
function formatCounter(n,c){return c.signed&&n>0?'+'+n:String(n);}
function refreshCounter(box,f,s,force=false){const c=counterOf(f),n=counterValue(s,f),input=box.querySelector('.counter-value');if(force||input!==document.activeElement)input.value=formatCounter(n,c);box.querySelector('.counter-minus').disabled=box.dataset.preview==='true'||n<=(c.min??Number.MIN_SAFE_INTEGER);box.querySelector('.counter-plus').disabled=box.dataset.preview==='true'||n>=(c.max??Number.MAX_SAFE_INTEGER);}
function makeCounter(f,s,preview){const c=counterOf(f),box=element('div','counter');box.dataset.preview=String(preview);applyStyle(box,f);if(c.showName)box.append(element('div','counter-name',f.name));const row=element('div','counter-row');box.append(row);
 const minus=element('button','counter-minus','−'),plus=element('button','counter-plus','+'),input=element('input','counter-value');input.type='text';input.inputMode='text';input.autocomplete='off';input.spellcheck=false;input.setAttribute('aria-label',f.name);input.readOnly=preview;if(preview)input.tabIndex=-1;for(const [b,label] of [[minus,'Diminuir'],[plus,'Aumentar']]){b.type='button';b.title=label+' '+f.name;b.setAttribute('aria-label',b.title);}
 function commit(){const n=safeInt(input.value);if(n!==null)save(s,fieldKey(f),String(clampCounter(n,c)),true);refreshCounter(box,f,s,true);}
 if(!preview){input.oninput=()=>{const n=safeInt(input.value);if(n!==null&&n===clampCounter(n,c)){save(s,fieldKey(f),String(n));refreshCounter(box,f,s);}};input.onblur=commit;input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();input.blur();}};const adjust=delta=>{const n=counterValue(s,f),next=clampCounter(n+delta*c.step,c);save(s,fieldKey(f),String(next),true);refreshCounter(box,f,s,true);};minus.onclick=()=>adjust(-1);plus.onclick=()=>adjust(1);}
 row.append(minus,input,plus);refreshCounter(box,f,s,true);return box;}
function draw(){
 syncStyle();const bg=$('bg');bg.hidden=!model.image;if(model.image&&bg.getAttribute('src')!==model.image)bg.src=model.image;else if(!model.image)bg.removeAttribute('src');$('overlays').replaceChildren();if(!model.image)return;
 const s=activeSlot;
 for(const f of model.fields){const d=element('div','overlay'+(editing?' edit':'')+(editing&&selected===f.id?' selected':''));d.dataset.id=f.id;const place=()=>Object.assign(d.style,{left:f.x+'%',top:f.y+'%',width:f.w+'%',height:f.h+'%'});place();
 if(f.kind==='card')d.append(makeCard(f,s,editing));else if(f.kind==='counter')d.append(makeCounter(f,s,editing));else{const e=element(f.kind==='area'?'textarea':'input','field-value');if(f.kind==='number'&&!editing){e.type='number';e.step='any';}e.setAttribute('aria-label',f.name);e.value=value(s,fieldKey(f))||(editing?f.name:'');e.readOnly=editing;if(editing)e.tabIndex=-1;else{e.oninput=()=>save(s,fieldKey(f),e.value);e.onchange=()=>save(s,fieldKey(f),e.value,true);}applyStyle(e,f);d.append(e);}
 if(editing){d.append(element('span','edit-label',f.name));const handle=element('div','handle');d.append(handle);d.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();selected=f.id;syncStyle();for(const n of $('overlays').children)n.classList.toggle('selected',n===d);const r=$('stage').getBoundingClientRect(),sx=e.clientX,sy=e.clientY,orig={...f},resize=e.target===handle;if(!r.width||!r.height)return;d.setPointerCapture(e.pointerId);d.onpointermove=m=>{const dx=(m.clientX-sx)/r.width*100,dy=(m.clientY-sy)/r.height*100;if(resize){f.w=Math.max(4,Math.min(100-f.x,orig.w+dx));f.h=Math.max(3,Math.min(100-f.y,orig.h+dy));}else{f.x=Math.max(0,Math.min(100-f.w,orig.x+dx));f.y=Math.max(0,Math.min(100-f.h,orig.y+dy));}place();};d.onpointerup=d.onpointercancel=()=>{d.onpointermove=null;persistModel();};};}
 $('overlays').append(d);
 }
}
$('sheet').onchange=()=>{commitFocus();activeSlot=slot();renderClassic(true);draw();};
$('toggle').onclick=()=>{commitFocus();const v=$('visual').hidden;$('visual').hidden=!v;$('classic').hidden=v;$('toggle').textContent=v?'Ficha clássica':'Modelo visual';draw();};
$('mode').onclick=()=>{commitFocus();editing=!editing;$('mode').textContent=editing?'Modo jogador':'Editar modelo';$('editor').hidden=!editing;draw();};
$('image').onclick=()=>$('imagefile').click();$('imagefile').onchange=async()=>{const f=$('imagefile').files[0];$('imagefile').value='';if(!f)return;try{model.image=await imageData(f,1800,.85);const ok=persistModel();draw();if(ok)status('Imagem importada. Adicione campos.');}catch(e){status('Imagem inválida: '+e.message);}};
$('add').onclick=()=>{if(!model.image)return status('Importe uma imagem primeiro.');const name=$('name').value.trim();if(!name)return status('Digite o nome do campo.');const kind=$('kind').value;const f={id:uid(),name,kind,x:5,y:5,w:kind==='card'?55:kind==='counter'?25:35,h:kind==='card'?32:kind==='counter'?12:8,style:{},...(kind==='counter'?{counter:{...counterDefaults}}:{})};model.fields.push(f);selected=f.id;persistModel();draw();};
$('remove').onclick=()=>{const f=model.fields.find(f=>f.id===selected);if(!f)return;if(!confirm('Excluir o campo "'+f.name+'" do modelo? Os valores antigos permanecerão no backup.'))return;model.fields=model.fields.filter(x=>x.id!==selected);selected=null;persistModel();draw();};
$('export').onclick=()=>{commitFocus();download(Object.fromEntries([...inputs.keys()].map(f=>[f,value(activeSlot,f)])),'ficha-'+activeSlot+'.json');};
$('import').onclick=()=>$('file').click();$('file').onchange=async()=>{const f=$('file').files[0],s=activeSlot;$('file').value='';if(!f)return;try{const data=JSON.parse(await f.text()),patch={};for(const name of inputs.keys())if(['string','number'].includes(typeof data[name]))patch[key(s,name)]=String(data[name]);patchValues(patch,{immediate:true});renderClassic(true);refreshValues();status('Ficha clássica importada.');}catch(e){status('Falha na importação: '+e.message);}};
$('modelExport').onclick=()=>{commitFocus();download(model,'modelo-visual.json');};
$('modelImport').onclick=()=>$('modelFile').click();$('modelFile').onchange=async()=>{const f=$('modelFile').files[0];$('modelFile').value='';if(!f)return;try{const m=normalizeModel(JSON.parse(await f.text()));if(model.fields.length&&!confirm('Substituir o layout? Os valores antigos permanecem guardados pelos IDs.'))return;model=m;selected=null;migrate();persistModel();draw();status('Modelo importado.');}catch(e){status('Falha: '+e.message);}};
$('backupExport').onclick=()=>{commitFocus();const values=Object.fromEntries(Object.entries(metadata).filter(([k])=>k.startsWith(prefix)));download({format:'one-piece-editor-backup',version:3,model,values,art},'backup-editor-visual.json');};
$('backupImport').onclick=()=>$('backupFile').click();$('backupFile').onchange=async()=>{const f=$('backupFile').files[0];$('backupFile').value='';if(!f)return;try{const b=JSON.parse(await f.text());if(b.format!=='one-piece-editor-backup')throw Error('Arquivo não é um backup completo');const m=normalizeModel(b.model),p={},a={};for(const [k,v] of Object.entries(b.values||{}))if(k.startsWith(prefix)&&['string','number'].includes(typeof v))p[k]=String(v);for(const [k,v] of Object.entries(b.art||{}))if(k.startsWith(prefix)&&imageOK(v))a[k]=v;if(!confirm('Restaurar layout e os dados das duas fichas deste backup? Valores correspondentes serão substituídos.'))return;model=m;selected=null;Object.assign(art,a);store(artStore,art);patchValues(p,{immediate:true});migrate();persistModel();renderClassic(true);draw();status('Backup restaurado.');}catch(e){status('Falha: '+e.message);}};
// Publicação experimental: um único registro, separado dos valores.
const publicationKey='one-piece-editor.publication/v1';
let officialView=false, draftModel=null, published=null, role=null, publicationRevision=null;
function publicationUI(){
 $('publish').disabled=officialView||(ready&&role!=='GM');
 $('draft').hidden=!officialView|| (ready&&role!=='GM');
 $('official').hidden=officialView;
 $('mode').hidden=officialView||(ready&&role!=='GM');
 $('image').hidden=officialView||(ready&&role!=='GM');
 $('modelImport').hidden=officialView||(ready&&role!=='GM');
 $('backupImport').hidden=officialView||(ready&&role!=='GM');
 $('toggle').hidden=officialView||(ready&&role!=='GM');
}
function showOfficial(){
 if(!published){status('Nenhum modelo publicado nesta sala.');return;}
 commitFocus();if(!officialView)draftModel=model;
 officialView=true;model=normalizeModel(published.model);selected=null;editing=false;
 $('visual').hidden=false;$('classic').hidden=true;$('editor').hidden=true;$('toggle').textContent='Ficha clássica';
 publicationUI();draw();status('Ficha oficial aberta.');
}
function receivePublication(raw){
 if(!raw||typeof raw.revision!=='string'||raw.revision===publicationRevision)return;
 try{const m=normalizeModel(raw.model);if(!m.image)throw Error('Sem imagem');published={revision:raw.revision,model:m};publicationRevision=raw.revision;if(officialView||(ready&&role!=='GM'))showOfficial();}catch(e){status('Modelo publicado inválido: '+e.message);}
}
$('publish').onclick=async()=>{
 if(officialView||(ready&&role!=='GM'))return;
 if(!model.image||!model.fields.length)return status('Importe uma imagem e crie campos primeiro.');
 if(window.parent!==window&&!ready)return status('Aguarde a conexão com a sala.');
 if(!confirm('Publicar este layout? Os valores dos personagens não serão substituídos.'))return;
 const payload={revision:uid(),model:normalizeModel({...model,image:hostedImage})};
 $('publish').disabled=true;
 try{if(ready){if(await OBR.player.getRole()!=='GM')throw Error('Somente o mestre pode publicar.');await OBR.room.setMetadata({[publicationKey]:payload});}else{if(!store('rpg-test-publication',payload))throw Error('Armazenamento cheio');}receivePublication(payload);status(ready?'Modelo publicado na sala.':'Modelo publicado apenas neste navegador (teste local).');}catch(e){status('Falha na publicação: '+e.message+' — tente uma imagem menor.');}finally{publicationUI();}
};
$('official').onclick=showOfficial;
$('draft').onclick=()=>{if(ready&&role!=='GM')return;commitFocus();model=draftModel;draftModel=null;officialView=false;editing=true;selected=null;$('editor').hidden=false;$('mode').textContent='Modo jogador';publicationUI();draw();status('Rascunho aberto.');};
// Inicialização local não depende da rede. O SDK só é carregado dentro de iframe.
migrate();persistModel();renderClassic(true);draw();publicationUI();if(window.parent===window)receivePublication(read('rpg-test-publication',null));
if(window.parent!==window){(async()=>{try{OBR=SDK;OBR.onReady(async()=>{try{metadata=await OBR.room.getMetadata();role=await OBR.player.getRole();ready=true;publicationUI();if(role!=='GM'){$('visual').hidden=false;$('classic').hidden=true;$('editor').hidden=true;editing=false;model={version:3,image:'',fields:[]};draw();}receivePublication(metadata[publicationKey]);OBR.room.onMetadataChange(m=>{metadata={...m,...inFlight,...Object.fromEntries(pending)};renderClassic();refreshValues();receivePublication(m[publicationKey]);});if(role==='GM')migrate();renderClassic(true);refreshValues();status(role==='GM'?'Conectado como mestre.':'Conectado como jogador. '+(published?'Ficha oficial disponível.':'Aguardando publicação.'));}catch(e){status('Falha na conexão: '+e.message);}});}catch(e){status('SDK indisponível. Modo local.');}})();}
window.addEventListener('pagehide',()=>{if(ready)void flush();});
