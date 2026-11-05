
const $=id=>document.getElementById(id),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let apps=JSON.parse(localStorage.applications||'[]'),a=null,previewURL;

const note=s=>$('notice').textContent=s;
$('importPosting').onclick=async()=>{const button=$('importPosting');button.disabled=true;button.textContent='Reading posting…';try{let r=await fetch('/posting',{method:'POST',body:$('posting').value});if(!r.ok)throw Error(await r.text());let data=await r.json();for(const key of ['company','title','jd'])if(data[key]?.trim())$(key).value=data[key].trim();note(data.company?'Posting imported. Review its details.':'Description imported. Verify the role title and enter the company name.')}catch(e){note(e.message)}finally{button.disabled=false;button.textContent='Import posting'}};
let vocab='Java|Python|TypeScript|JavaScript|React|Spring Boot|FastAPI|REST APIs|gRPC|AWS|Azure|Kubernetes|Docker|Temporal|Apache Airflow|PostgreSQL|MySQL|Redis|Kafka|SQL|Grafana|CloudWatch|CI/CD|OAuth2|Golang|Kotlin|HIPAA|billing|payments|observability|data integrity|incident response|distributed systems|accessibility|testing|C++|C#|Go|Ruby|Rust|Scala|Swift|PHP|Angular|Vue|Node.js|Next.js|Django|Flask|Terraform|GCP|Google Cloud|MongoDB|DynamoDB|Snowflake|BigQuery|Tableau|Power BI|Excel|ETL|GraphQL|HTML|CSS|Linux|Git|OAuth|machine learning|data analysis|data visualization|code reviews|unit testing|integration testing|product management|documentation|agile|SaaS|microservices|RAG|LangChain|security|healthcare|analytics'.split('|');
const normalize=s=>s.toLowerCase().replace(/[^a-z0-9/+#]+/g,' ').trim();
const has=(s,t)=>(' '+normalize(s)+' ').includes(' '+normalize(t)+' ');
function save(){localStorage.applications=JSON.stringify(apps);list()}
function today(){const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
function list(){
 const filteredMonth=$('month').value;
 const day=$('appliedOn').value||today(), company=$('searchCompany').value.toLowerCase().trim();
 const matches=apps.map((job,index)=>({job,index})).filter(({job})=>job.company.toLowerCase().includes(company));
 const dated=matches.filter(({job})=>job.appliedDate);
 $('counts').textContent=dated.filter(({job})=>job.appliedDate===day).length+' applied on '+day+' · '+dated.filter(({job})=>job.appliedDate.startsWith(day.slice(0,7))).length+' in that month';
 const stages=[['Drafts',apps.filter(j=>j.stage==='Draft').length],['Submitted',apps.filter(j=>j.appliedDate).length],['Interviewing',apps.filter(j=>['Screen','Interview'].includes(j.stage)).length]];
 $('metrics').innerHTML=stages.map(([name,n])=>'<div class="metric"><b>'+n+'</b>'+name+'</div>').join('');
 const period=filteredMonth||day.slice(0,7), days=new Date(Number(period.slice(0,4)),Number(period.slice(5)),0).getDate();
 const freq=Array.from({length:days},(_,i)=>dated.filter(({job})=>job.appliedDate===period+'-'+String(i+1).padStart(2,'0')).length);
 $('chart').innerHTML='<small>DAILY SUBMISSIONS · '+esc(period)+'</small><div class="bars">'+freq.map((n,i)=>'<i title="Day '+(i+1)+': '+n+'" style="height:'+Math.max(2,75*n/Math.max(1,...freq))+'px"></i>').join('')+'</div><p>'+freq.reduce((a,b)=>a+b,0)+' submitted this month</p>';
 const [yearNumber,monthNumber]=period.split('-').map(Number);
 const months=Array.from({length:6},(_,i)=>{const date=new Date(yearNumber,monthNumber-6+i,1);const key=date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0');return {label:date.toLocaleString('en',{month:'short'}),count:dated.filter(({job})=>job.appliedDate.startsWith(key)).length}});
 $('chart').innerHTML+='<details><summary>Monthly activity</summary><div class="months">'+months.map(m=>'<div><b>'+m.count+'</b><i style="height:'+Math.max(2,50*m.count/Math.max(1,...months.map(n=>n.count)))+'px"></i>'+m.label+'</div>').join('')+'</div></details>';
 $('jobs').innerHTML=matches.filter(({job})=>!filteredMonth||job.appliedDate?.startsWith(filteredMonth)).filter(({job})=>!$('appliedOn').value||job.appliedDate===day).map(({job,index})=>'<button class="job" data-i="'+index+'"><strong>'+esc(job.company)+'</strong><span>'+esc(job.title)+'</span><span>'+esc(job.stage)+'</span><span>'+esc(job.appliedDate||'Pending')+'</span><span>'+esc(scoreLabel(job))+'</span></button>').join('')||'No matching applications.';
}
$('searchCompany').oninput=list;$('appliedOn').oninput=list;
function draft(){let base=(localStorage.baseProfile||'').trim(),jd=$('jd').value.trim(),title=$('title').value.trim(),company=$('company').value.trim();if(!base||!jd||!title||!company)return note('Enter a profile, company, title and job description.');
let terms=vocab.filter(t=>has(jd,t)),section='',group='',rows=[];
for(let [i,line] of base.split('\n').map(x=>x.trim()).filter(Boolean).entries()){
let kind=i===0?'name':i===1?'contact':line.startsWith('## ')?'role':line.startsWith('# ')?'section':line.startsWith('@ ')?'links':/^[•*-] /.test(line)?'bullet':'text',original=line.replace(/^(##? |@ |[•*-] )/,'');
if(kind==='section'){section=original;group=''}if(kind==='role')group=original;
let hits=terms.filter(t=>has(original,t)),value=original,why='';
if(section==='Technical Skills'&&kind==='text'){let skills=original.split(',').map(x=>x.trim());value=skills.sort((l,r)=>Number(terms.some(t=>has(r,t)))-Number(terms.some(t=>has(l,t)))).join(', ');why='Prioritizes skills already in the profile that appear in the posting.'}
if($('mode').value!=='Basic'&&kind==='bullet'&&(hits.length||$('mode').value==='Aggressive')){value=original.replace(/\bin order to\b/gi,'to').replace(/\butilized\b/gi,'used').replace(/\bwas responsible for implementing\b/i,'Implemented').replace(/\bresponsible for developing\b/i,'Developed').replace(/\bwith the goal of\b/gi,'to');if(value===original&&hits.length){
 const method=original.match(/^Used (.+?) to ([a-z]+) (.+)\.$/);
 const verbs={identify:'Identified',reduce:'Reduced',automate:'Automated',develop:'Developed',build:'Built',test:'Tested', monitor:'Monitored',analyze:'Analyzed',improve:'Improved',track:'Tracked'};
 if(method&&verbs[method[2]]&&!/\band (?:reduce|increase|build|improve|automate|track)\b/.test(method[3]))value=verbs[method[2]]+' '+method[3]+' using '+method[1]+'.';
}
why=value!==original?'Tightens the source wording while retaining its scope and outcome. '+(hits.length?'Relevant posting terms: '+hits.join(', '):''):''}
rows.push({kind,original,value,why,section,group,rank:hits.length,idx:i,include:true})}
let pos=rows.findIndex(x=>x.kind==='section');if(pos<0)pos=Math.min(2,rows.length);
rows.splice(pos,0,{kind:'role',original:'',value:title,why:'Target title supplied for this application.',idx:-1,include:true});
for(let i=0;i<rows.length;i++){if($('mode').value==='Basic'||rows[i].kind!=='bullet')continue;let j=i+1;while(j<rows.length&&rows[j].kind==='bullet')j++;let block=rows.slice(i,j).sort((x,y)=>y.rank-x.rank);block.forEach((x,k)=>{if(x.idx!==rows[i+k].idx)x.move='Moved within this entry to prioritize the posting’s terms.'});rows.splice(i,j-i,...block);i=j-1}
const summary=rows.find(r=>r.kind==='text'&&/summary|profile/i.test(r.section));
if(summary&&$('mode').value!=='Basic'){
 const sentences=summary.original.match(/[^.!?]+(?:[.!?]+|$)/g)?.map(x=>x.trim())||[];
 if(sentences.length>2){const rest=sentences.slice(1).map((text,i)=>({text,i,n:terms.filter(t=>has(text,t)).length})).sort((l,r)=>r.n-l.n||l.i-r.i);
 summary.value=[sentences[0],...rest.slice(0,3).map(x=>x.text)].join(' ');summary.why='Keeps the professional identity first and prioritizes supported strengths relevant to this posting.'}
}
tab='Changes';const previous=a;a={id:previous.id,diagnosis:previous.diagnosis||diagnose(base,jd),base,mode:$('mode').value,company,title,jd,rows,terms,gaps:terms.filter(t=>!has(base,t)),stage:'Draft'};apps[apps.indexOf(previous)]=a;save();show();note('Draft ready. Review the PDF, then open Preview & export.')}
function diagnose(base,jd){
 let group='',section='',priority='Responsibilities';
 const source=sourceRows(base).map((r,i)=>{if(r.kind==='section'){section=r.value;group=''}if(r.kind==='role')group=r.value;return {...r,section,group,i}});
 const matches=[];
 for(const sentence of jd.split(/\n|(?<=[.!?])\s+/).map(x=>x.trim()).filter(Boolean)){
  if(/preferred|nice.to.have|bonus/i.test(sentence))priority='Preferred';
  else if(/required|minimum|qualifications|you (have|bring)/i.test(sentence))priority='Required';
  else if(/responsibilit|you will/i.test(sentence))priority='Responsibilities';
  for(const term of vocab.filter(t=>has(sentence,t))){
   const existing=matches.find(x=>x.term===term);
   if(existing&&(existing.priority==='Required'||priority!=='Required'))continue;
   const candidates=source.filter(r=>!['links','section','name','contact'].includes(r.kind)&&has(r.value,term));
   const weight=r=>r.kind==='bullet'&&/experience|employment/i.test(r.section)?4:r.kind==='bullet'?3:/skills/i.test(r.section)?2:1;
   const evidence=candidates.sort((l,r)=>weight(r)-weight(l))[0];
   const entry={term,priority,sentence,evidence:evidence?{line:evidence.i,text:evidence.value,location:evidence.group||evidence.section}:null};
   if(existing)Object.assign(existing,entry);else matches.push(entry)
  }
 }
 return {base,jd,matches};
}
function matchBrief(job,base){
 if(!job.diagnosis||job.diagnosis.base!==base||job.diagnosis.jd!==job.jd){job.diagnosis=diagnose(base,job.jd);save()}
 const matches=job.diagnosis.matches, supported=matches.filter(m=>m.evidence);
 return '<section><small>BEFORE TAILORING</small><h2>Requirement coverage</h2><p>'+supported.length+' of '+matches.length+' recognized posting terms have source evidence. Unmatched terms stay private.</p>'+matches.map(m=>'<details><summary>'+esc(m.term+' · '+m.priority+' · '+(m.evidence?'Supported':'Unconfirmed'))+'</summary><p>'+esc(m.sentence)+'</p>'+ (m.evidence?'<strong>'+esc(m.evidence.location||'Source resume')+'</strong><p>'+esc(m.evidence.text)+'</p>':'No supporting source line found.')+'</details>').join('')+'</section>';
}
function concise(value){
 return value.replace(/\bin order to\b/gi,'to').replace(/\bwith the goal of\b/gi,'to').replace(/\bon a daily basis\b/gi,'daily').replace(/\bwas responsible for developing\b/gi,'Developed').replace(/\butilized\b/gi,'used').replace(/\bthrough the use of\b/gi,'using');
}

function scoreLabel(job){if(!job.terms.length)return 'Coverage unavailable';return Math.round(100*(job.terms.length-job.gaps.length)/job.terms.length)+'% recognized requirement coverage'}
const approved=()=>a.rows.filter(r=>r.include&&r.value.trim());
function analysis(){
 const content=a.rows.filter(r=>r.idx>=0);
 let out='<section><small>PROFILE MATCH</small><h2>'+esc(scoreLabel(a))+'</h2><p>Share of recognized posting terms found in the base profile. Each term counts once.</p>';
 const groups=[['Supported terms',a.terms.filter(t=>!a.gaps.includes(t))],['Unconfirmed requirements',a.gaps]];
 for(const [label,terms] of groups){out+='<h3>'+label+'</h3><div class="chips '+(label.startsWith('Unconfirmed')?'gap':'')+'">'+terms.map(t=>'<span>'+esc(t)+'</span>').join('')+(terms.length?'':'None detected')+'</div>'}
 out+='</section><section><h2>Evidence by requirement</h2>';
 for(const term of groups[0][1]){const rows=content.filter(r=>has(r.original,term)).sort((l,r)=>Number(/experience/i.test(r.section))-Number(/experience/i.test(l.section)));const row=rows[0];if(row)out+='<details><summary>'+esc(term)+'</summary><p>'+esc(row.group||row.section)+'</p>'+esc(row.original)+'</details>'}
 const domains=['healthcare','payments','finance','retail','security','insurance','education','marketplace','analytics','SaaS','infrastructure','cloud','AI','e-commerce','logistics'].filter(t=>has(a.jd,t));
 out+='</section><section><h2>Posting context</h2><p>'+esc(domains.length?domains.join(' · '):'No domain identified automatically.')+'</p>';
 let category='Responsibilities';const buckets={Responsibilities:[],Required:[],Preferred:[]};
 for(let line of a.jd.split(/\n/).map(t=>t.trim()).filter(Boolean)){
 if(/^(?:preferred|nice.to.have|bonus)/i.test(line))category='Preferred';else if(/^(?:required|requirements|qualifications|you (?:have|bring)|minimum)/i.test(line))category='Required';else if(/^(?:responsibilities|you will|what you.ll do)/i.test(line))category='Responsibilities';
 if(line.length>24)buckets[category].push(line)
 }
 for(const [label,items] of Object.entries(buckets)){if(items.length)out+='<details><summary>'+label+'</summary>'+items.map(t=>'<p>'+esc(t)+'</p>').join('')+'</details>'}
 return out+'</section><details><summary>Original job requirements and domain context</summary><pre>'+esc(a.jd)+'</pre></details>';
}
function comparison(){
 const prior=apps.filter(j=>j!==a&&j.company.trim().toLowerCase()===a.company.trim().toLowerCase()&&j.appliedDate);
 if(!prior.length)return '<section><h2>Company history</h2><p>No earlier submissions recorded for '+esc(a.company)+'.</p></section>';
 return prior.map(j=>{let out='<section><small>SUBMITTED '+esc(j.appliedDate)+'</small><h2>'+esc(j.title)+'</h2>';if(!j.submitted)return out+'Earlier snapshot unavailable.</section>';
 const previous=j.submitted.map(r=>r.value),current=approved().map(r=>r.value);
 for(const [heading,lines] of [['Earlier wording',previous.filter(t=>!current.includes(t))],['Current wording',current.filter(t=>!previous.includes(t))]])out+='<h3>'+heading+'</h3>'+ (lines.map(t=>'<p>'+esc(t)+'</p>').join('')||'No differences.');
 const identity=j.submitted.filter(r=>r.kind==='role'&&r.idx>=0&&!current.includes(r.value));if(identity.length)out+='<p><b>Check consistency:</b> '+identity.length+' employer or project headings differ. Verify names, dates, and scope against the base profile before submitting.</p>';
 const suggestions=j.submitted.filter(old=>old.kind==='bullet'&&a.rows.some(now=>now.kind==='bullet'&&now.group===old.group&&now.original===old.original&&now.value!==old.value));
 for(const old of suggestions){out+='<details><summary>Previously submitted wording available</summary><p>'+esc(old.value)+'</p><button class="alt" data-prior="'+apps.indexOf(j)+'" data-row="'+j.submitted.indexOf(old)+'">Use this wording</button></details>'}
 return out+'</section>'}).join('');
}
function sourceRows(text){
 return structureImport(text).split('\n').filter(Boolean).map((s,i)=>({
 kind:i===0?'name':i===1?'contact':s.startsWith('## ')?'role':s.startsWith('# ')?'section':s.startsWith('@ ')?'links':s.startsWith('• ')?'bullet':'text',
 value:s.replace(/^(##? |@ |• )/,'')
 }));
}
async function pdfSurface(host, rows, change, onSelect){
 const container=document.createElement('div');host.replaceChildren(container);
 const visible=rows.filter(r=>r.include!==false&&r.value.trim());
 if(!visible.length){container.textContent='Upload or paste a resume to see its PDF.';return}
 container.textContent='Rendering PDF…';
 try{
 const res=await fetch('/page-preview',{method:'POST',body:JSON.stringify(visible.map(r=>[r.kind,r.value]))});if(!res.ok)throw Error(await res.text());const data=await res.json();container.replaceChildren();
 if(data.pages.length>1&&change){const tip=document.createElement('p');tip.textContent='This resume spans '+data.pages.length+' pages. Shorten the draft for a one-page application export.';container.append(tip)}
 const pages=data.pages.map((src,n)=>{const page=document.createElement('div');page.className='pdfSheet';const img=new Image();img.alt='Resume PDF, page '+(n+1);img.src='data:image/png;base64,'+src;page.append(img);container.append(page);return page});
 if(!change)return;
 data.boxes.forEach(([n,x,y,w,h],i)=>{const target=document.createElement('button');target.className='pdfHit';target.style.cssText='left:'+100*x/596+'%;top:'+100*y/842+'%;width:'+100*w/596+'%;height:'+100*h/842+'%';target.setAttribute('aria-label','Edit '+visible[i].value);target.onclick=()=>{
 if(onSelect)onSelect(visible[i]);container.querySelector('.pdfEditor')?.remove();const form=document.createElement('form');form.className='pdfEditor';form.style.top=Math.min(74,100*y/842)+'%';form.innerHTML='<label>Edit PDF entry<textarea required></textarea></label><button>Apply edit</button> <button type="button" class="quiet">Cancel</button>';const area=form.querySelector('textarea');area.value=visible[i].value;pages[n].append(form);area.focus();form.lastElementChild.onclick=()=>form.remove();form.onsubmit=e=>{e.preventDefault();if(area.value.trim()){change(visible[i],area.value.trim());form.remove()}}};pages[n].append(target)});
 }catch(e){container.textContent=e.message}
}
let originalUrl='', sourceView=0;
async function sourceFile(file){
 const db=await new Promise((resolve,reject)=>{const req=indexedDB.open('rolefolio-files',1);req.onupgradeneeded=()=>req.result.createObjectStore('files');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});
 try{return await new Promise((resolve,reject)=>{const tx=db.transaction('files',file?'readwrite':'readonly'),store=tx.objectStore('files');const req=file?store.put(file,'resume'):store.get('resume');tx.oncomplete=()=>resolve(req.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}finally{db.close()}
}
function displayOriginal(file){
 const frame=document.createElement('iframe');frame.title='Uploaded resume PDF';if(originalUrl)URL.revokeObjectURL(originalUrl);originalUrl=URL.createObjectURL(file);frame.src=originalUrl;$('sourcePage').replaceChildren(frame);
}
function editSource(){
 ++sourceView;
 const rows=sourceRows(localStorage.baseProfile||'');pdfSurface($('sourcePage'),rows,(row,value)=>{row.value=value;localStorage.baseProfile=rows.map(r=>({role:'## ',section:'# ',links:'@ ',bullet:'• '}[r.kind]||'')+r.value).join('\n');localStorage.sourceEdited='yes';editSource();note('PDF edit saved.')});
}
async function sourcePreview(forceOriginal=false){
 const view=++sourceView;$('resumeOpportunity').hidden=!returnRecord||!localStorage.baseProfile;
 try{const file=await sourceFile();if(view!==sourceView)return;
 $('originalSource').hidden=!file;$('editSource').hidden=!localStorage.baseProfile;
 if(file&&(forceOriginal||!localStorage.sourceEdited))displayOriginal(file);
 else if(localStorage.baseProfile)editSource();else $('sourcePage').textContent='Choose a PDF to preview your resume.';
 }catch(e){note('Could not access the saved PDF: '+e.message)}
}
$('upload').onchange=async e=>{
 const input=e.target,file=input.files[0];if(!file)return;
 if(file.size>5000000){note('Choose a PDF smaller than 5 MB.');input.value='';return}
 ++sourceView;displayOriginal(file);input.disabled=true;$('pdfActions').hidden=true;note('Reading your PDF…');
 try{const res=await fetch('/extract',{method:'POST',body:file});if(!res.ok)throw Error((await res.text()).replace('Paste the resume text instead.','Upload a searchable PDF.'));
 const parsed=structureImport(await res.text());if(!parsed.trim())throw Error('Upload a PDF with selectable text.');
 await sourceFile(file);localStorage.baseProfile=parsed;delete localStorage.sourceEdited;await sourcePreview(true);note('PDF parsed and saved.');}
 catch(e){await sourcePreview();note(e.message)}finally{input.disabled=false;input.value='';$('pdfActions').hidden=false}
};
$('editSource').onclick=editSource;$('originalSource').onclick=()=>sourcePreview(true);
$('resumeOpportunity').onclick=()=>{if(returnRecord){location.hash='application-'+returnRecord;returnRecord=null}};
function reviewRows(){
 const host=$('review');
 host.innerHTML='<div class="workbench"><section class="paper"><small>TAILORED RESUME</small><p class="hint">Select a line to inspect or edit it.</p><div id="editPdf"></div><details><summary>Review changes and excluded entries</summary><label>Show<select id="lineFilter"><option>All lines</option><option>Changed lines</option><option>Professional experience</option><option>Projects</option></select></label><div id="paperLines"></div></details></section><section class="inspector" id="inspector" aria-live="polite"></section></div>';
 const changed=r=>r.original!==r.value||r.move||!r.include;
 function draw(preferred){
 pdfSurface($('editPdf'),a.rows,(r,value)=>{r.value=value;r.why='Edited directly on the resume PDF.';save();draw(a.rows.indexOf(r))},r=>select(a.rows.indexOf(r)));
 const lines=$('paperLines');lines.replaceChildren();const visible=[];
 a.rows.forEach((r,i)=>{const filter=$('lineFilter').value;if(filter==='Changed lines'&&!changed(r)||filter==='Professional experience'&&!/experience|employment/i.test(r.section)||filter==='Projects'&&!/project/i.test(r.section))return;
 const b=document.createElement('button');b.className='line'+(r.include?'':' excluded');b.dataset.line=i;b.textContent=(r.kind==='bullet'?'• ':'')+r.value;b.style.fontWeight=['name','section','role'].includes(r.kind)?'700':'400';if(r.kind==='section')b.style.borderBottom='1px solid #d1dbcf';b.onclick=()=>select(i);lines.append(b);visible.push(i)});
 if(visible.length)select(visible.includes(preferred)?preferred:visible.filter(i=>a.rows[i].kind==='bullet'&&/employment|experience/i.test(a.rows[i].section)).sort((i,j)=>(a.rows[j].rank||0)-(a.rows[i].rank||0))[0]??visible.find(i=>changed(a.rows[i]))??visible[0]);else $('inspector').textContent='No lines match this filter.';
 }
 function select(i){const r=a.rows[i];document.querySelectorAll('.line').forEach(b=>b.classList.toggle('selected',+b.dataset.line===i));
 $('inspector').innerHTML='<small>CHANGE INSPECTOR</small><h2>'+esc(!r.include?'Excluded line':!r.original?'Added line':r.value!==r.original?'Rewritten line':r.move?'Reordered line':'Original line')+'</h2><strong>Before</strong><p>'+esc(r.original||'New in this draft')+'</p><label>After<textarea id="newWording"></textarea></label><strong>Reason</strong><p>'+esc([r.why,r.move].filter(Boolean).join(' ')||'Kept the base resume wording.')+'</p><button id="applyLine">Save wording</button> <button class="alt" id="restoreLine">Restore</button> <button class="alt" id="includeLine">'+(r.include?'Exclude':'Include')+'</button>';
 const reqs=a.diagnosis.matches.filter(m=>has(r.original,m.term));
 const metrics=r.original.match(/\b\d+(?:[.,]\d+)*(?:%|\+)?/g)||[];
 const evidenceNote=reqs.length?'Posting asks for '+reqs.map(m=>m.term).join(', ')+'. Source: '+(r.group||r.section||'base resume')+'.':'';
 $('inspector').insertAdjacentHTML('beforeend','<p>'+esc(evidenceNote)+'</p>'+(reqs[0]?'<blockquote>'+esc(reqs[0].sentence)+'</blockquote>':'')+(metrics.length?'<p>Verify source figures: '+esc(metrics.join(', '))+'</p>':''));
 if(r.kind==='bullet'){const refine=document.createElement('button');refine.textContent='Suggest shorter wording';refine.className='quiet';refine.onclick=()=>{const input=$('newWording'),next=concise(input.value);if(next===input.value)return note('No safe shortening found. Edit this bullet directly to preserve its meaning.');input.value=next;note('Suggestion ready. Review and save this line to apply it.')};$('inspector').append(refine)}
 $('newWording').value=r.value;$('applyLine').onclick=()=>{const value=$('newWording').value.trim();if(!value)return note('Enter wording or choose Exclude.');r.value=value;r.why='Edited during candidate review.';save();draw(i);note('Wording saved.')};
 $('restoreLine').onclick=()=>{r.value=r.original;r.include=!!r.original;r.why='';if(r.move){const peers=a.rows.filter(x=>x.kind==='bullet'&&x.group===r.group&&x.section===r.section);const start=a.rows.indexOf(peers[0]);a.rows.splice(i,1);a.rows.splice(start+peers.filter(x=>x.idx<r.idx).length,0,r);r.move=''}save();draw(a.rows.indexOf(r))};
 $('includeLine').onclick=()=>{r.include=!r.include;save();draw(i)};
 }
 $('lineFilter').onchange=()=>draw();draw();
}
async function fileFor(path){const res=await fetch(path,{method:'POST',body:JSON.stringify(approved().map(r=>[r.kind,r.value]))});if(!res.ok)throw Error(await res.text());return URL.createObjectURL(await res.blob())}
async function exportsView(){
 const job=a;$('review').innerHTML='<section><h2>Approved resume</h2><button id="word">Download Word</button> <a id="pdf" hidden>Download PDF</a><p id="fileStatus" role="status">Preparing PDF…</p><div id="viewer"></div></section>';
 const changedFigures=approved().filter(r=>r.kind==='bullet'&&JSON.stringify(r.original.match(/\d+(?:[.,]\d+)*(?:%|\+)?/g)||[])!==JSON.stringify(r.value.match(/\d+(?:[.,]\d+)*(?:%|\+)?/g)||[]));
 if(changedFigures.length)$('viewer').insertAdjacentHTML('beforebegin','<details open><summary>Confirm changed figures ('+changedFigures.length+')</summary>'+changedFigures.map(r=>'<p>Source: '+esc(r.original)+'</p><p>Draft: '+esc(r.value)+'</p>').join('')+'</details>');
 $('word').onclick=async()=>{try{let link=document.createElement('a');link.href=await fileFor('/word');link.download=a.company+' Resume.docx';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),10000)}catch(e){note(e.message)}};
 try{const url=await fileFor('/pdf');if(a!==job||tab!=='Preview' || !$('pdf')){URL.revokeObjectURL(url);return}if(previewURL)URL.revokeObjectURL(previewURL);previewURL=url;$('pdf').href=url;$('pdf').download=a.company+' Resume.pdf';$('pdf').hidden=false;$('fileStatus').textContent='One-page PDF ready. Included hyperlink destinations verified in the exported PDF. Unconfirmed posting terms: '+(a.gaps.join(', ')||'none detected')+'.';$('viewer').innerHTML='<iframe title="Approved resume" src="'+url+'"></iframe>'}catch(e){if($('fileStatus'))$('fileStatus').textContent=e.message}
}
function show(){
 if(!a.diagnosis){a.diagnosis=diagnose(a.base||a.rows.filter(r=>r.idx>=0).sort((l,r)=>l.idx-r.idx).map(r=>r.original).join('\n'),a.jd);save()}
 screen('result');$('lead').replaceChildren();$('reviewTitle').textContent=a.title;$('reviewCompany').textContent=a.company+' · '+a.stage;
 const names=['Changes','Preview','Status','Analysis','Base resume','Company history'];
 $('tabs').replaceChildren();const more=document.createElement('details');more.className='reviewMore';const label=document.createElement('summary');label.textContent='Supporting details';more.append(label);more.open=['Analysis','Base resume','Company history'].includes(tab);for(const name of names){const b=document.createElement('button');b.textContent=({'Analysis':'Match analysis','Base resume':'Original resume','Changes':'Review & edit','Preview':'Preview & export','Status':'Application stage'}[name]||name);b.classList.toggle('active',name===tab);b.onclick=()=>{tab=name;show()};(['Analysis','Base resume','Company history'].includes(name)?more:$('tabs')).append(b)}$('tabs').append(more);
 if(tab==='Changes')return reviewRows();if(tab==='Preview')return exportsView();
 if(tab==='Analysis')$('review').innerHTML=matchBrief(a,a.base||a.rows.filter(r=>r.idx>=0).sort((l,r)=>l.idx-r.idx).map(r=>r.original).join('\n'))+analysis();
 if(tab==='Company history'){$('review').innerHTML=comparison();for(const b of $('review').querySelectorAll('[data-prior]'))b.onclick=()=>{const old=apps[+b.dataset.prior].submitted[+b.dataset.row];const row=a.rows.find(r=>r.kind==='bullet'&&r.group===old.group&&r.original===old.original);if(row){row.value=old.value;row.why='Candidate selected wording from a previous submission for this company.';save();show();note('Previously submitted wording applied.')}}}
 if(tab==='Base resume')pdfSurface($('review'),a.base?sourceRows(a.base):a.rows.filter(r=>r.idx>=0).sort((l,r)=>l.idx-r.idx).map(r=>({value:r.original,kind:r.kind})));
 if(tab==='Status'){$('review').innerHTML='<section><h2>Application stage</h2><label>Stage<select id="stage">'+['Draft','Applied','Screen','Interview','Closed'].map(s=>'<option '+(s===a.stage?'selected':'')+'>'+s+'</option>').join('')+'</select></label><p>Marking this application Applied saves the current resume for future comparisons.</p></section>';
 $('stage').onchange=e=>{a.stage=e.target.value;if(a.stage==='Applied'&&!a.appliedDate){a.appliedDate=today();a.submitted=structuredClone(approved())}save();show()}}
}
function structureImport(raw){
 const headings=/^(?:professional summary|career summary|summary|profile|technical skills|skills|professional experience|work experience|experience|employment history|projects|selected projects|education|leadership(?: & achievements)?|certifications|achievements)$/i;
 let section='',previousBullet=false;
 return raw.split(/\r?\n/).map(s=>s.trim()).filter(Boolean).reduce((out,line)=>{
 const clean=line.replace(/^#+\s*/, '').replace(/:$/, '');
 if(headings.test(clean)||line.startsWith('# ')){section=clean;out.push('# '+clean);previousBullet=false}
 else if(/^[•●▪◦*-]\s*/.test(line)){out.push('• '+line.replace(/^[•●▪◦*-]\s*/,''));previousBullet=true}
 else if(line.startsWith('## ')||(/projects/i.test(section)&&line.length<90&&!/^[•@#]/.test(line)&&!/[.!?]$/.test(line))||(/experience|employment/i.test(section)&&/\b(?:19|20)\d{2}\b/.test(line))){out.push('## '+line.replace(/^## /,''));previousBullet=false}
 else if(previousBullet&&!/[.!?]$/.test(out[out.length-1])&&!line.startsWith('@ ')){out[out.length-1]+=' '+line}
 else{out.push(line);previousBullet=false}return out},[]).join('\n')
}

let tab='Changes',returnRecord=null;
const sections=['desk','new','base','tracker','result'];
function screen(id){
 for(const name of sections)$(name).hidden=name!==id;
 document.querySelectorAll('nav a').forEach(link=>{if(link.hash==='#'+id)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current')});
 window.scrollTo(0,0);
}
function openRecord(id){location.hash='application-'+id}
function route(){
 note('');const key=location.hash.slice(1);
 if(key.startsWith('application-')){
  a=apps.find(j=>'application-'+j.id===key);
  if(a){if(a.stage==='Saved')brief();else {tab=a.stage==='Draft'?'Changes':'Status';show()}return}
 }
 const dest=({home:'desk',studio:'new'})[key]||key;
 screen(sections.includes(dest)&&dest!=='result'?dest:'desk');
 if(!$('desk').hidden){
 renderDesk();
 }
 if(dest==='base')sourcePreview();
 if(dest==='tracker')list();
}
function brief(){
 screen('result');$('reviewCompany').textContent=a.company+'　 /　 Saved opportunity';$('reviewTitle').textContent=a.title;$('review').replaceChildren();$('tabs').replaceChildren();
 $('lead').innerHTML='<div class="spread"><section><small>OPPORTUNITY FILE</small><h2>Role brief</h2><pre>'+esc(a.jd)+'</pre></section><section><small>APPLICATION PREPARATION</small><h2>Prepare a resume</h2><p>'+esc(localStorage.baseProfile?'Using '+localStorage.baseProfile.split('\n')[0]+'’s source resume.':'Add your source resume to start tailoring.')+'</p><label>Tailoring depth<select id="mode"><option>Basic</option><option selected>Medium</option><option>Aggressive</option></select></label><button id="prepare">'+(localStorage.baseProfile?'Prepare draft':'Add source resume')+'　→</button></section></div>';
 if(localStorage.baseProfile)$('lead').insertAdjacentHTML('beforeend',matchBrief(a,localStorage.baseProfile));
 $('prepare').onclick=()=>{if(!localStorage.baseProfile){returnRecord=a.id;location.hash='base';return}for(const key of ['title','company','jd'])$(key).value=a[key];draft();if(a.stage!=='Saved')$('capture').reset()};
}
$('capture').onsubmit=e=>{e.preventDefault();const job={id:crypto.randomUUID(),stage:'Saved',rows:[],terms:[],gaps:[]};for(const k of ['company','title','jd']){job[k]=$(k).value.trim();if(!job[k])return $(k).focus()}apps.unshift(job);save();$('capture').reset();openRecord(job.id)};
$('jobs').onclick=e=>{const btn=e.target.closest('[data-i]');if(btn)openRecord(apps[+btn.dataset.i].id)};
$('queue').onclick=e=>{const btn=e.target.closest('[data-record]');if(btn)openRecord(btn.dataset.record)};
$('month').oninput=list;
$('roles').innerHTML=['Software Engineer','Data Analyst','Product Manager','Project Manager','UX Designer','Business Analyst','Account Executive','Operations Manager'].map(t=>'<option>'+t+'</option>').join('');
$('jd').onchange=()=>{const m=$('jd').value.match(/^Company:\s*(.+)$/im);if(m&&!$('company').value)$('company').value=m[1].trim()};
let queueFilter='All';
function queueStage(j){return j.stage==='Saved'?'To prepare':j.stage==='Draft'?'Needs review':'Tracking'}
function drawQueue(){
 const query=$('queueSearch').value.trim().toLowerCase();
 const filtered=apps.filter(j=>(j.company+' '+j.title).toLowerCase().includes(query));
 const filters=$('queueFilters');filters.replaceChildren();
 for(const label of ['All','To prepare','Needs review','Tracking']){
 const b=document.createElement('button');b.textContent=label+' · '+filtered.filter(j=>label==='All'||queueStage(j)===label).length;b.setAttribute('aria-pressed',label===queueFilter);b.onclick=()=>{queueFilter=label;drawQueue()};filters.append(b)}
 const jobs=filtered.filter(j=>queueFilter==='All'||queueStage(j)===queueFilter);
 $('queue').innerHTML=jobs.map(j=>'<button class="entry" data-record="'+esc(j.id)+'"><b>'+esc(j.company)+'</b><span>'+esc(j.title)+'</span><em>'+esc(j.stage==='Saved'?'View match →':j.stage==='Draft'?'Review PDF →':j.stage)+'</em></button>').join('')||'<p>'+(!apps.length?'Your saved jobs will appear here.':'No applications match this view.')+'</p>';
}
function renderDesk(){
 const next=apps.find(j=>j.stage==='Draft')||apps.find(j=>j.stage==='Saved');
 const config=!localStorage.baseProfile?['Upload your resume','Your source PDF is used for each job you add.','Upload PDF','#base']:next?[next.stage==='Draft'?'Review your tailored PDF':'Check the match',next.company+' · '+next.title,next.stage==='Draft'?'Review PDF':'View match','#application-'+next.id]:['Add a job you want to apply for','Import a posting link or paste the job description.','Add job','#new'];
 $('nextTitle').textContent=config[0];$('nextHint').textContent=config[1];$('nextAction').textContent=config[2]+'　→';$('nextAction').href=config[3];drawQueue();
}
$('queueSearch').oninput=drawQueue;
if(apps.some(j=>!j.id)){for(const j of apps)j.id||=crypto.randomUUID();save()}
window.addEventListener('hashchange',route);route();
