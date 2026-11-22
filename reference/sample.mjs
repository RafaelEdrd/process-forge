import {executePipeline} from './pipeline.mjs';

export const example = {stages: [
  {id:'clients', kind:'source', inputs:[], config:{rows:[{id:'c-1',active:true},{id:'c-2',active:false}]}},
  {id:'payments', kind:'source', inputs:[], config:{rows:[{client:'c-1',amount:120},{client:'c-2',amount:70}]}},
  {id:'active', kind:'filter', inputs:['clients'], config:{field:'active',equals:true}},
  {id:'joined', kind:'join', inputs:['active','payments'], config:{leftKey:'id',rightKey:'client'}},
  {id:'result', kind:'output', inputs:['joined'], config:{}},
]};
if (process.argv[1]?.endsWith('sample.mjs')) {
  console.log(JSON.stringify(executePipeline(example), null, 2));
}
