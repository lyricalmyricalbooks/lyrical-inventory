import { test, expect } from 'vitest';
import { collectUniqueConsignmentStores as orig } from '../../src/lib/consignment.js';
import { collectUniqueConsignmentStores as fixed } from '../../src/lib/consignment.js';
const states={a:{stores:[{name:'X'}]},b:{stores:[{name:'X',rate:25}]}};
const books=[{id:'a',title:'A'},{id:'b',title:'B'}];
test('orig', ()=>expect(orig(states,books)[0].rate).toBe(25));
test('fixed', ()=>{expect(fixed(states,books)[0].rate).toBe(25); expect(fixed({a:{stores:[{name:'Y'}]}},books)[0].rate).toBe(40);});
