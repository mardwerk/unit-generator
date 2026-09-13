import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createMangaEncounter } from '../../../../packages/definitions/dist/manga-mayhem/simulator.js';
import { compileMangaBuild, legalMangaTiers } from '../../../../packages/definitions/dist/manga-mayhem/compiler.js';
const unit = JSON.parse(fs.readFileSync(new URL('../../runs/crew-v4-usopp-20260913/usopp/unit.json', import.meta.url)));
const targets = () => [
  {id:'sleep-eligible',x:10,y:0,health:1000,weakWilled:true,stunnable:true},
  {id:'sleep-ineligible',x:11,y:2,health:1000,weakWilled:false,stunnable:false}
];
const result = {legalBuilds:0,formBuildCases:0,nemuriCases:[],contextualReplacements:[],purchaseChecks:[]};
for(let a=0;a<=5;a++) for(let b=0;b<=5;b++) for(let c=0;c<=5;c++) {
  const tiers=[a,b,c]; if(!legalMangaTiers(tiers))continue;
  result.legalBuilds++;
  const build=compileMangaBuild(unit,tiers);
  assert.equal(build.modifiers.flatDamage,0);
  for(const form of build.forms){
    result.formBuildCases++;
    const e=createMangaEncounter(unit,tiers,targets());
    if(form.id!==unit.baseForm) assert.equal(e.requestForm(form.id),true);
    const technique=e.snapshot().technique;
    if(technique==='nemuri-so'){
      assert.equal(e.requestTechnique(),true); e.advance(1);
      const snapshot=e.snapshot();
      assert(snapshot.targets.every(t=>t.health===1000));
      assert.equal(snapshot.events.filter(x=>x.type==='technique').length,0);
      assert(snapshot.events.some(x=>x.type==='status'&&x.target==='sleep-eligible'));
      assert(!snapshot.events.some(x=>x.type==='status'&&x.target==='sleep-ineligible'));
      result.nemuriCases.push({tiers,form:form.id,health:snapshot.targets.map(t=>t.health),sleepApplied:true});
    }else result.contextualReplacements.push({tiers,form:form.id,technique});
  }
}
for(let path=0;path<3;path++) for(let tier=1;tier<=5;tier++){
  const before=[0,0,0],after=[0,0,0];before[path]=tier-1;after[path]=tier;
  const previous=compileMangaBuild(unit,before),next=compileMangaBuild(unit,after);
  assert.notDeepEqual(previous.modifiers,next.modifiers);
  const check={path,tier,modifiers:unit.paths[path].upgrades[tier-1].modifiers,effectiveModifierChanged:true};
  if(path===1){
    const hit=tiers=>{const e=createMangaEncounter(unit,tiers,targets());e.advance(1);return e.snapshot().events.find(x=>x.type==='primary').amount;};
    check.primaryDamageBefore=hit(before);check.primaryDamageAfter=hit(after);
    assert(check.primaryDamageAfter>check.primaryDamageBefore);
  }
  result.purchaseChecks.push(check);
}
fs.writeFileSync(new URL('./usopp-v4-probe.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({legalBuilds:result.legalBuilds,formBuildCases:result.formBuildCases,nemuriCases:result.nemuriCases.length,purchases:result.purchaseChecks.length}));
