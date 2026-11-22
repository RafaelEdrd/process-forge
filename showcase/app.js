import {execute} from './engine/engine.js';
const flows=window.RA_PROCESS_TEMPLATES;
const $=id=>document.getElementById(id);
let selected='leads', lastRun=null, activeStep=0;
const add=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
function template(){return flows[selected];}
function configure(){const flow=template();$('title').textContent=flow.name;$('description').textContent=flow.description;$('run-status').textContent='PRONTO PARA EXECUTAR';lastRun=null;
  for(const button of $('templates').children)button.setAttribute('aria-pressed',String(button.dataset.id===selected));
  $('metric-input').textContent='—';$('metric-output').textContent='—';$('metric-rejected').textContent='—';$('output').replaceChildren(add('p','','Execute o fluxo para examinar os resultados.'));renderNodes();}
function renderNodes(){const canvas=$('canvas');canvas.replaceChildren();const flow=template();flow.steps.forEach((step,index)=>{const node=add('button','node');node.type='button';node.dataset.index=index;node.setAttribute('aria-pressed',String(index===activeStep));node.append(add('span','number',String(index+1).padStart(2,'0')),add('strong','',step.label),add('small','',step.kind));node.addEventListener('click',()=>{activeStep=index;renderNodes();inspector();});canvas.append(node);});inspector();}
function inspector(){const step=template().steps[activeStep];$('step-title').textContent=step.label;$('step-kind').textContent=step.kind.toUpperCase();const run=lastRun?.steps.find(row=>row.node===step.id);
  $('step-detail').textContent=run?`${run.inputCount} registros recebidos · ${run.outputCount} na saída · ${run.rejects} rejeitados`:`Nó ${step.id}. Configuração declarativa, sem execução arbitrária de código.`;
  const config=$('step-config');config.replaceChildren();for(const [key,value] of Object.entries(step.config)){const item=add('div');item.append(add('span','',key),add('span','',typeof value==='object'?JSON.stringify(value).slice(0,180):String(value)));config.append(item);}}
function renderTable(rows){const out=$('output');out.replaceChildren();if(!rows.length){out.append(add('p','','Nenhum registro na saída.'));return;}const table=add('table'),header=add('tr');for(const key of Object.keys(rows[0]))header.append(add('th','',key));table.append(header);for(const row of rows){const tr=add('tr');for(const key of Object.keys(rows[0]))tr.append(add('td','',String(row[key]??'—')));table.append(tr);}out.append(table);}
for(const flow of Object.values(flows)){const button=add('button','template');button.dataset.id=flow.id;button.append(add('strong','',flow.name),add('small','',flow.description));button.addEventListener('click',()=>{selected=flow.id;activeStep=0;configure();});$('templates').append(button);}
$('run').addEventListener('click',()=>{try{lastRun=execute(template());$('metric-input').textContent=lastRun.recordsIn;$('metric-output').textContent=lastRun.recordsOut;$('metric-rejected').textContent=lastRun.rejected;$('run-status').textContent='EXECUÇÃO SIMULADA CONCLUÍDA';renderTable(lastRun.output);inspector();}catch(error){$('run-status').textContent='FALHA DE VALIDAÇÃO';$('output').replaceChildren(add('p','',error.message));}});
configure();
